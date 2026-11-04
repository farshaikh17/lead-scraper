import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { cleanLinkInput, createLink, listLinks, listRequests, markLocationAccepted, requestDetail, slugFrom, updateLink } from "../src/access/db";
import { b64url, cookieFor, decryptSecret, encryptSecret, readState, requestIdFromCookie, signState } from "../src/access/crypto";
import { gbpMode } from "../src/access/config";
import { grantedFor, grantForRequest, listForRequest, markManual, rateLimit, startRequest, storedToken, takeToken } from "../src/access/flow";
import { mockProvider, NotApprovedError, type GbpProvider } from "../src/access/google";

const fs = (await import("node:" + "fs")) as { readdirSync(p: string): string[]; readFileSync(p: string, enc: "utf8"): string };
const migrations = fs.readdirSync("migrations").filter((x) => x.endsWith(".sql")).sort();

export function d1(extra: Record<string, unknown> = {}) {
  const db = new DatabaseSync(":memory:");
  for (const f of migrations) db.exec(fs.readFileSync(`migrations/${f}`, "utf8"));
  const stmt = (sql: string, binds: unknown[] = []) => ({
    sql,
    bind: (...b: unknown[]) => stmt(sql, b),
    all: async () => ({ results: db.prepare(sql).all(...(binds as never[])) }),
    first: async (col?: string) => { const r = db.prepare(sql).get(...(binds as never[])) as Record<string, unknown> | undefined; return r ? (col ? r[col] : r) : null; },
    run: async () => { const r = db.prepare(sql).run(...(binds as never[])) as { changes: number }; return { meta: { changes: r.changes } }; },
  });
  const DB = {
    prepare: (sql: string) => stmt(sql),
    batch: async (list: ReturnType<typeof stmt>[]) => {
      const out = [];
      for (const s of list) out.push(/^\s*(SELECT|WITH)/i.test(s.sql) ? await s.all() : await s.run().then((r) => ({ ...r, results: [] })));
      return out;
    },
  };
  return { db, env: { DB, ...extra } as unknown as Env };
}

const linkInput = { title: "Acme Dental", agencyGoogleEmail: "Team@Agency.com", accessLevel: "manager" };

describe("access links", () => {
  it("checks what the agency typed", () => {
    expect(() => cleanLinkInput({ ...linkInput, title: " " })).toThrow(/name/);
    expect(() => cleanLinkInput({ ...linkInput, agencyGoogleEmail: "nope" })).toThrow(/Google account/);
    expect(() => cleanLinkInput({ ...linkInput, accessLevel: "admin" })).toThrow(/manager or owner/);
    expect(() => cleanLinkInput({ ...linkInput, logoUrl: "http://x.com/a.png" })).toThrow(/https/);
    expect(() => cleanLinkInput({ ...linkInput, logoUrl: "javascript:alert(1)" })).toThrow(/https/);
    expect(() => cleanLinkInput({ ...linkInput, brandColor: "red" })).toThrow(/colour/);
    expect(() => cleanLinkInput({ ...linkInput, slug: "Bad Slug!" })).toThrow(/letters/);
    expect(cleanLinkInput(linkInput).agency_google_email).toBe("team@agency.com");
    expect(slugFrom("Acme Dental & Co.")).toMatch(/^acme-dental-co-[0-9a-f]{6}$/);
  });

  it("creates, edits and lists links for one agency only", async () => {
    const { env } = d1();
    const a = await createLink(env, "main", { ...linkInput, slug: "acme" }, "u1");
    expect(a.slug).toBe("acme");
    await expect(createLink(env, "main", { ...linkInput, slug: "acme" }, "u1")).rejects.toThrow(/taken/);
    await createLink(env, "other", { ...linkInput, title: "Theirs" }, "u2");
    expect((await listLinks(env, "main")).map((l) => l.title)).toEqual(["Acme Dental"]);
    // Another agency can't edit it.
    expect(await updateLink(env, "other", a.id, { title: "Hijacked" })).toBeNull();
    const off = await updateLink(env, "main", a.id, { isActive: false, welcomeText: "Hi!" });
    expect(off?.is_active).toBe(0);
    expect(off?.welcome_text).toBe("Hi!");
    expect(off?.title).toBe("Acme Dental");
  });
});

describe("access requests dashboard", () => {
  it("filters by status, counts, and keeps agencies apart", async () => {
    const { env, db } = d1();
    const link = await createLink(env, "main", linkInput, "u1");
    const other = await createLink(env, "other", linkInput, "u2");
    const add = (id: string, linkId: string, agency: string, status: string) =>
      db.prepare(`INSERT INTO access_requests (id, agency_id, link_id, status) VALUES (?, ?, ?, ?)`).run(id, agency, linkId, status);
    add("r1", link.id, "main", "granted");
    add("r2", link.id, "main", "opened");
    add("r3", other.id, "other", "granted");
    db.prepare(`INSERT INTO granted_locations (request_id, gbp_account_name, gbp_location_name, title, status) VALUES ('r1', 'accounts/1', 'locations/1', 'Shop', 'pending_invite')`).run();
    db.prepare(`INSERT INTO granted_locations (request_id, gbp_account_name, gbp_location_name, title, status) VALUES ('r3', 'accounts/9', 'locations/9', 'Theirs', 'pending_invite')`).run();

    const all = await listRequests(env, "main");
    expect(all.requests.map((r) => (r as { id: string }).id).sort()).toEqual(["r1", "r2"]);
    expect(all.counts).toEqual({ granted: 1, opened: 1 });
    expect((await listRequests(env, "main", { status: "granted" })).requests).toHaveLength(1);
    // An unknown status is ignored rather than put in the query.
    expect((await listRequests(env, "main", { status: "x' OR 1=1 --" })).requests).toHaveLength(2);

    expect(await requestDetail(env, "main", "r3")).toBeNull();
    const d = await requestDetail(env, "main", "r1");
    expect(d?.locations).toHaveLength(1);

    const theirLoc = (db.prepare(`SELECT id FROM granted_locations WHERE request_id = 'r3'`).get() as { id: number }).id;
    expect(await markLocationAccepted(env, "main", "r3", theirLoc)).toBe(false);
    expect(await markLocationAccepted(env, "main", "r1", d!.locations[0].id)).toBe(true);
    expect(await markLocationAccepted(env, "main", "r1", d!.locations[0].id)).toBe(false); // already done
  });
});

describe("modes", () => {
  it("only goes live with every Google setting, and defaults to manual", () => {
    const full = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s", TOKEN_ENC_KEY: "k", STATE_SIGNING_SECRET: "x" };
    expect(gbpMode({} as never)).toBe("manual");
    expect(gbpMode({ GBP_MODE: "mock" } as never)).toBe("mock");
    expect(gbpMode({ GBP_MODE: "live" } as never)).toBe("manual");
    expect(gbpMode({ GBP_MODE: "live", ...full } as never)).toBe("live");
    expect(gbpMode({ GBP_MODE: "manual", ...full } as never)).toBe("manual");
  });
});

describe("signing and encryption", () => {
  it("signs the OAuth state, refusing changes and old ones", async () => {
    const s = await signState("secret", { r: "abc", exp: Date.now() + 60_000 });
    expect((await readState<{ r: string; exp: number }>("secret", s))?.r).toBe("abc");
    expect(await readState("other-secret", s)).toBeNull();
    const [body, sig] = s.split(".");
    const forged = b64url(new TextEncoder().encode(JSON.stringify({ r: "evil", exp: Date.now() + 60_000 })));
    expect(await readState("secret", `${forged}.${sig}`)).toBeNull();
    expect(await readState("secret", `${body}.${sig}x`)).toBeNull();
    expect(await readState("secret", await signState("secret", { r: "abc", exp: Date.now() - 1 }))).toBeNull();
  });

  it("ties a browser to one request", async () => {
    const id = crypto.randomUUID();
    const v = await cookieFor("secret", id);
    expect(await requestIdFromCookie("secret", v)).toBe(id);
    expect(await requestIdFromCookie("secret", v.replace(id, crypto.randomUUID()))).toBeNull();
    expect(await requestIdFromCookie("nope", v)).toBeNull();
    expect(await requestIdFromCookie("secret", undefined)).toBeNull();
  });

  it("encrypts tokens with AES-256-GCM (hex or base64 key), fresh IV each time", async () => {
    const hexKey = "11".repeat(32);
    const a = await encryptSecret(hexKey, "1//refresh-token");
    const b = await encryptSecret(hexKey, "1//refresh-token");
    expect(a).not.toBe(b);
    expect(a).not.toContain("refresh");
    expect(await decryptSecret(hexKey, a)).toBe("1//refresh-token");
    await expect(decryptSecret("22".repeat(32), a)).rejects.toThrow();
    const b64Key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
    expect(await decryptSecret(b64Key, await encryptSecret(b64Key, "x"))).toBe("x");
    await expect(encryptSecret("short", "x")).rejects.toThrow(/32 bytes/);
  });
});

describe("client flow (mock mode)", () => {
  async function setup() {
    const t = d1({ GBP_MODE: "mock" });
    const link = await createLink(t.env, "main", { ...linkInput, slug: "acme" }, "u1");
    return { ...t, link };
  }

  it("signs in, lists sample profiles, and sends invitations once", async () => {
    const { env, db, link } = await setup();
    const { request, mode } = await startRequest(env, link, { name: " Pat ", email: "PAT@client.com" });
    expect(mode).toBe("mock");
    expect(request.status).toBe("authorized");
    expect(request.client_email).toBe("pat@client.com");
    expect(await storedToken(env, request.id)).toBe("mock");

    const accounts = await listForRequest(env, request, mockProvider);
    expect(accounts.flatMap((a) => a.locations)).toHaveLength(4);
    const fresh = db.prepare(`SELECT * FROM access_requests WHERE id = ?`).get(request.id) as never;

    // Profiles not in the list are ignored; nothing valid -> an error and nothing recorded.
    await expect(grantForRequest(env, link, fresh, ["locations/999"], mockProvider)).rejects.toThrow(/Tick/);
    const out = await grantForRequest(env, link, fresh, ["locations/2000001", "locations/2000002", "locations/2000004", "locations/2000001", "locations/999"], mockProvider);
    expect(out.results.map((r) => r.status)).toEqual(["pending_invite", "granted", "failed"]);
    expect(out.status).toBe("partial");
    expect((await grantedFor(env, request.id)).map((r) => r.status)).toEqual(["pending_invite", "granted", "failed"]);
    const row = db.prepare(`SELECT status, finished_at FROM access_requests WHERE id = ?`).get(request.id) as { status: string; finished_at: string };
    expect(row.status).toBe("partial");
    expect(row.finished_at).toBeTruthy();

    // The token can be taken once.
    expect(await takeToken(env, request.id)).toBe("mock");
    expect(await takeToken(env, request.id)).toBeNull();
  });

  it("is all-or-nothing in the overall status", async () => {
    const { env, db, link } = await setup();
    const { request } = await startRequest(env, link, {});
    await listForRequest(env, request, mockProvider);
    const fresh = db.prepare(`SELECT * FROM access_requests WHERE id = ?`).get(request.id) as never;
    expect((await grantForRequest(env, link, fresh, ["locations/2000001", "locations/2000003"], mockProvider)).status).toBe("granted");
    expect((await grantForRequest(env, link, fresh, ["locations/2000004"], mockProvider)).status).toBe("failed");
  });

  it("sends the client to the manual steps when Google hasn't approved the API", async () => {
    const { env, db, link } = await setup();
    const { request } = await startRequest(env, link, {});
    await listForRequest(env, request, mockProvider);
    const fresh = db.prepare(`SELECT * FROM access_requests WHERE id = ?`).get(request.id) as never;
    const refusing: GbpProvider = { listAccounts: mockProvider.listAccounts, invite: async () => { throw new NotApprovedError("403"); } };
    await expect(grantForRequest(env, link, fresh, ["locations/2000001"], refusing)).rejects.toBeInstanceOf(NotApprovedError);
    const row = db.prepare(`SELECT status, error_message FROM access_requests WHERE id = ?`).get(request.id) as { status: string; error_message: string };
    expect(row.status).toBe("authorized");
    expect(row.error_message).toMatch(/manual/);
  });

  it("records 'I've added you' with or without an earlier request, and drops the token", async () => {
    const { env, link } = await setup();
    const fromScratch = await markManual(env, link, null, { name: "Sam", email: "sam@x.com" });
    expect(fromScratch.status).toBe("manual_pending");
    expect(fromScratch.mode).toBe("manual");
    const { request } = await startRequest(env, link, {});
    const after = await markManual(env, link, request, {});
    expect(after.id).toBe(request.id);
    expect(after.status).toBe("manual_pending");
    expect(await storedToken(env, request.id)).toBeNull();
    await expect(markManual(env, link, null, { email: "bad" })).rejects.toThrow(/email/);
  });

  it("rate-limits per key", async () => {
    const { env } = d1();
    for (let i = 0; i < 3; i++) await rateLimit(env, "grant:1.2.3.4", 3, 10);
    await expect(rateLimit(env, "grant:1.2.3.4", 3, 10)).rejects.toThrow(/Too many/);
    await rateLimit(env, "grant:5.6.7.8", 3, 10);
  });
});

describe("client pages", async () => {
  const { landingPage, manualPage, brandFor } = await import("../src/access/client-pages");
  const link = { slug: "acme", agency_google_email: "team@agency.com", access_level: "owner", welcome_text: "<script>alert(1)</script>", logo_url: "javascript:alert(1)", brand_color: "red" } as never;

  it("escapes what the agency typed and ignores unsafe logos and colours", () => {
    const b = brandFor(link, "");
    expect(b.logo).toBeNull();
    expect(b.color).toBe("#E4572E");
    const html = landingPage(link, b, "live");
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Continue with Google");
    expect(html).toContain("with us");
  });

  it("shows the guide's button in manual mode, with the role to pick", () => {
    expect(landingPage(link, brandFor(link, "Goes Local"), "manual")).toContain("Show me how");
    const m = manualPage(link, brandFor(link, "Goes Local"), { hasRequest: false, reason: "api" });
    expect(m).toContain("People and access");
    expect(m).toContain("<b>Owner</b>");
    expect(m).toContain("hasn't switched on automatic sharing");
    expect(m).toContain('name="email"');
  });
});
