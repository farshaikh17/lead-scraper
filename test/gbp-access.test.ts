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
    // The full list of the client's profiles is dropped once they've chosen.
    expect(db.prepare(`SELECT listing_json FROM access_requests WHERE id = ?`).get(request.id)).toEqual({ listing_json: null });
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

describe("Google sign-in (OAuth)", async () => {
  const oauth = await import("../src/access/oauth");
  const env = { GBP_MODE: "live", GOOGLE_CLIENT_ID: "cid.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "csecret", TOKEN_ENC_KEY: "33".repeat(32), STATE_SIGNING_SECRET: "state-secret" } as never;
  const idToken = (p: object) => `x.${b64url(new TextEncoder().encode(JSON.stringify(p)))}.y`;

  it("asks for offline access with consent, a signed state and PKCE", async () => {
    const url = new URL(await oauth.authorizationUrl(env, "https://lf.example", "11111111-1111-1111-1111-111111111111", "acme", "pat@x.com"));
    const q = url.searchParams;
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(q.get("access_type")).toBe("offline");
    expect(q.get("prompt")).toBe("consent");
    expect(q.get("response_type")).toBe("code");
    expect(q.get("redirect_uri")).toBe("https://lf.example/api/connect/oauth/callback");
    expect(q.get("scope")!.split(" ")).toContain("https://www.googleapis.com/auth/business.manage");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("login_hint")).toBe("pat@x.com");
    expect(url.toString()).not.toContain("csecret");
    const st = await oauth.checkState(env, q.get("state")!);
    expect(st?.r).toBe("11111111-1111-1111-1111-111111111111");
    expect(st?.s).toBe("acme");
    expect(await oauth.checkState(env, q.get("state")! + "x")).toBeNull();
  });

  it("stores only the encrypted refresh token, and reads the email", async () => {
    const calls: { url: string; body: string }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      return Response.json({ access_token: "ya29.a", refresh_token: "1//refresh", scope: "openid email https://www.googleapis.com/auth/business.manage", id_token: idToken({ email: "Owner@Gmail.com", email_verified: true }) });
    }) as unknown as typeof fetch;
    const st = { r: "r1", s: "acme", n: "n1", exp: Date.now() + 60_000 };
    const out = await oauth.exchangeCode(env, "https://lf.example", "the-code", st, fetcher);
    expect(out.googleEmail).toBe("owner@gmail.com");
    expect(out.sealed).not.toContain("refresh");
    expect(await decryptSecret("33".repeat(32), out.sealed)).toBe("1//refresh");
    const sent = new URLSearchParams(calls[0].body);
    expect(sent.get("grant_type")).toBe("authorization_code");
    expect(sent.get("code_verifier")!.length).toBeGreaterThanOrEqual(43);
  });

  it("refuses a sign-in without the Business Profile permission, and gives the token back", async () => {
    const urls: string[] = [];
    const fetcher = (async (url: string) => {
      urls.push(url);
      return url.includes("revoke") ? new Response("") : Response.json({ access_token: "ya29.a", refresh_token: "1//r", scope: "openid email" });
    }) as unknown as typeof fetch;
    await expect(oauth.exchangeCode(env, "https://lf.example", "c", { r: "r", s: "s", n: "n", exp: Date.now() + 1000 }, fetcher)).rejects.toMatchObject({ kind: "scope" });
    expect(urls.some((u) => u.includes("revoke"))).toBe(true);
  });

  it("never logs tokens when Google says no", async () => {
    const logged: unknown[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { logged.push(...a); };
    try {
      const fetcher = (async () => Response.json({ error: "invalid_grant", refresh_token: "1//leak" }, { status: 400 })) as unknown as typeof fetch;
      await expect(oauth.exchangeCode(env, "https://lf.example", "c", { r: "r", s: "s", n: "n", exp: Date.now() + 1000 }, fetcher)).rejects.toMatchObject({ kind: "exchange" });
      await expect(oauth.accessToken(env, "1//secret-refresh", fetcher)).rejects.toMatchObject({ kind: "exchange" });
    } finally { console.error = orig; }
    expect(JSON.stringify(logged)).not.toMatch(/1\/\/|csecret|secret-refresh/);
  });

  it("only trusts a verified email", () => {
    expect(oauth.emailFromIdToken(idToken({ email: "a@b.com", email_verified: false }))).toBeNull();
    expect(oauth.emailFromIdToken("garbage")).toBeNull();
  });
});

describe("live routes, start to sign-in (Google faked)", async () => {
  const app = (await import("../src/index")).default;
  const LIVE = { GBP_MODE: "live", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "csecret", TOKEN_ENC_KEY: "44".repeat(32), STATE_SIGNING_SECRET: "sss" };
  const call = (env: Env, path: string, init: RequestInit = {}) => app.fetch(new Request(`https://lf.example${path}`, init), env, { waitUntil() {}, passThroughOnException() {} } as never);

  it("sends the client to Google, then back to the list only in the same browser", async () => {
    const { env, db } = d1(LIVE);
    await createLink(env, "main", { ...linkInput, slug: "acme" }, "u1");
    const start = await call(env, "/api/connect/acme/start", { method: "POST", body: new URLSearchParams({ name: "Pat", email: "pat@x.com" }), headers: { Origin: "https://lf.example" } });
    expect(start.status).toBe(303);
    const google = new URL(start.headers.get("Location")!);
    expect(google.host).toBe("accounts.google.com");
    const cookie = start.headers.get("Set-Cookie")!.split(";")[0];
    expect(start.headers.get("Set-Cookie")).toMatch(/HttpOnly/i);
    const state = google.searchParams.get("state")!;

    // Another browser (no cookie) can't finish this sign-in.
    const stranger = await call(env, `/api/connect/oauth/callback?code=abc&state=${encodeURIComponent(state)}`);
    expect(stranger.status).toBe(400);
    // A forged state is refused.
    expect((await call(env, `/api/connect/oauth/callback?code=abc&state=x.y`, { headers: { Cookie: cookie } })).status).toBe(400);

    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => Response.json({ access_token: "ya29", refresh_token: "1//rt", scope: "openid email https://www.googleapis.com/auth/business.manage", id_token: `x.${b64url(new TextEncoder().encode(JSON.stringify({ email: "owner@gmail.com" })))}.y` })) as typeof fetch;
    try {
      const back = await call(env, `/api/connect/oauth/callback?code=abc&state=${encodeURIComponent(state)}`, { headers: { Cookie: cookie } });
      expect(back.status).toBe(303);
      expect(back.headers.get("Location")).toBe("/connect/acme/select");
      // Signing in again while still choosing is allowed (it replaces the stored token).
      const again = await call(env, `/api/connect/oauth/callback?code=abc&state=${encodeURIComponent(state)}`, { headers: { Cookie: cookie } });
      expect(again.headers.get("Location")).toBe("/connect/acme/select");
    } finally { globalThis.fetch = realFetch; }
    const r = db.prepare(`SELECT status, client_google_email FROM access_requests`).get() as { status: string; client_google_email: string };
    expect(r).toEqual({ status: "authorized", client_google_email: "owner@gmail.com" });
    const t = db.prepare(`SELECT refresh_token_encrypted FROM oauth_tokens`).get() as { refresh_token_encrypted: string };
    expect(t.refresh_token_encrypted).not.toContain("1//rt");

  });

  it("refuses cross-site posts and unknown or switched-off links", async () => {
    const { env } = d1(LIVE);
    const l = await createLink(env, "main", { ...linkInput, slug: "acme" }, "u1");
    expect((await call(env, "/api/connect/acme/start", { method: "POST", headers: { Origin: "https://evil.example" } })).status).toBe(403);
    expect((await call(env, "/connect/nope")).status).toBe(404);
    await updateLink(env, "main", l.id, { isActive: false });
    expect((await call(env, "/connect/acme")).status).toBe(404);
  });
});

describe("separate client-access app (its own address)", async () => {
  const worker = (await import("../src/access/worker")).default;
  const main = (await import("../src/index")).default;
  const { baseUrl } = await import("../src/access/config");
  const ctx = { waitUntil() {}, passThroughOnException() {} } as never;
  const hit = (app: { fetch: (r: Request, e: Env, c: never) => Response | Promise<Response> }, env: Env, url: string, init: RequestInit = {}) => app.fetch(new Request(url, init), env, ctx);

  it("cleans the addresses it's given", () => {
    expect(baseUrl("https://access.mianrosystems.com/")).toBe("https://access.mianrosystems.com");
    expect(baseUrl(" https://access.mianrosystems.com/connect/x ")).toBe("https://access.mianrosystems.com");
    expect(baseUrl("http://access.mianrosystems.com")).toBe("");
    expect(baseUrl("http://localhost:8788")).toBe("http://localhost:8788");
    expect(baseUrl("javascript:alert(1)")).toBe("");
    expect(baseUrl(undefined)).toBe("");
  });

  it("serves the client pages and nothing of Lead Finder", async () => {
    const { env } = d1({ GBP_MODE: "mock" });
    await createLink(env, "main", { ...linkInput, slug: "acme" }, "u1");
    const page = await hit(worker, env, "https://access.example/connect/acme");
    expect(page.status).toBe(200);
    expect(page.headers.get("Content-Security-Policy")).toContain("https://accounts.google.com");
    expect(await (await hit(worker, env, "https://access.example/api/connect/status")).json()).toEqual({ mode: "mock", emailOn: false });
    for (const p of ["/login", "/access", "/api/access/links", "/api/leads"]) {
      expect((await hit(worker, env, `https://access.example${p}`)).status).toBe(404);
    }
    // Home and privacy pages, for Google's sign-in screen.
    const home = await hit(worker, env, "https://access.example/");
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('href="/privacy"');
    const privacy = await (await hit(worker, env, "https://access.example/privacy")).text();
    expect(privacy).toContain("Limited Use");
    expect(privacy).toContain("deleted as soon as you press Grant access");
    // The whole mock flow works on its own address.
    const start = await hit(worker, env, "https://access.example/api/connect/acme/start", { method: "POST", body: new URLSearchParams({ name: "Pat" }), headers: { Origin: "https://access.example" } });
    expect(start.headers.get("Location")).toBe("/connect/acme/select");
  });

  it("Lead Finder sends old links to the client-access address", async () => {
    const { env } = d1({ CLIENT_ACCESS_URL: "https://access.mianrosystems.com" });
    const r = await hit(main, env, "https://lf.example/connect/acme?x=1");
    expect(r.status).toBe(302);
    expect(r.headers.get("Location")).toBe("https://access.mianrosystems.com/connect/acme?x=1");
    // Without the setting the pages are served here, as before.
    const { env: plain } = d1();
    expect((await hit(main, plain, "https://lf.example/connect/acme")).status).toBe(404);
  });
});

describe("listing profiles from Google (faked)", async () => {
  const g = await import("../src/access/google");
  const env = { GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "cs" } as never;
  type Route = (u: URL, init: RequestInit) => Response | undefined;
  function fakeGoogle(route: Route) {
    const calls: string[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      const u = new URL(url);
      calls.push(`${init.method ?? "GET"} ${u.host}${u.pathname}${u.searchParams.get("pageToken") ? "?pt=" + u.searchParams.get("pageToken") : ""}`);
      if (u.host === "oauth2.googleapis.com") return Response.json({ access_token: "ya29.t" });
      return route(u, init) ?? new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
    const waits: number[] = [];
    return { fetcher, calls, waits, sleep: async (ms: number) => { waits.push(ms); } };
  }

  it("reads every page of accounts and locations", async () => {
    const f = fakeGoogle((u, init) => {
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ya29.t");
      if (u.pathname === "/v1/accounts") {
        return u.searchParams.get("pageToken")
          ? Response.json({ accounts: [{ name: "accounts/2", accountName: "Second", type: "LOCATION_GROUP" }] })
          : Response.json({ accounts: [{ name: "accounts/1", accountName: "First", type: "PERSONAL" }], nextPageToken: "p2" });
      }
      if (u.pathname === "/v1/accounts/1/locations") {
        expect(u.searchParams.get("readMask")).toBe("name,title,storefrontAddress");
        return u.searchParams.get("pageToken")
          ? Response.json({ locations: [{ name: "locations/12", title: "Shop B" }] })
          : Response.json({ locations: [{ name: "locations/11", title: "Shop A", storefrontAddress: { addressLines: ["1 Main St"], locality: "Tampa", administrativeArea: "FL", postalCode: "33602" } }], nextPageToken: "q2" });
      }
      if (u.pathname === "/v1/accounts/2/locations") return Response.json({});
    });
    const accounts = await g.liveProvider(env, "1//r", f.fetcher, f.sleep).listAccounts();
    expect(accounts).toEqual([
      { name: "accounts/1", accountName: "First", type: "PERSONAL", locations: [
        { name: "locations/11", title: "Shop A", address: "1 Main St, Tampa, FL 33602" }, { name: "locations/12", title: "Shop B", address: "" }] },
      { name: "accounts/2", accountName: "Second", type: "LOCATION_GROUP", locations: [] },
    ]);
    expect(f.calls.filter((c) => c.includes("oauth2"))).toHaveLength(1); // one access token for everything
  });

  it("treats a 403 (API not approved or not switched on) as 'use the manual steps'", async () => {
    const f = fakeGoogle(() => Response.json({ error: { code: 403, status: "PERMISSION_DENIED", message: "My Business Account Management API has not been used in project 123" } }, { status: 403 }));
    await expect(g.liveProvider(env, "1//r", f.fetcher, f.sleep).listAccounts()).rejects.toBeInstanceOf(g.NotApprovedError);
  });

  it("retries 429 with back-off, but not a zero quota", async () => {
    let n = 0;
    const busy = fakeGoogle((u) => (u.pathname === "/v1/accounts" && ++n < 3 ? new Response(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } }), { status: 429, headers: { "Retry-After": "2" } }) : Response.json({ accounts: [] })));
    expect(await g.liveProvider(env, "1//r", busy.fetcher, busy.sleep).listAccounts()).toEqual([]);
    expect(busy.waits).toEqual([2000, 2000]);

    const zero = fakeGoogle(() => Response.json({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded for quota metric 'Requests' and limit 'Requests per minute' of service 'mybusinessaccountmanagement.googleapis.com'", details: [{ reason: "RATE_LIMIT_EXCEEDED", metadata: { quota_limit_value: "0" } }] } }, { status: 429 }));
    await expect(g.liveProvider(env, "1//r", zero.fetcher, zero.sleep).listAccounts()).rejects.toBeInstanceOf(g.NotApprovedError);
    expect(zero.waits).toEqual([]);

    const always = fakeGoogle(() => Response.json({ error: { code: 429, status: "RESOURCE_EXHAUSTED", details: [{ metadata: { quota_limit_value: "300" } }] } }, { status: 429 }));
    await expect(g.liveProvider(env, "1//r", always.fetcher, always.sleep).listAccounts()).rejects.toMatchObject({ httpStatus: 429 });
    expect(always.waits).toEqual([1000, 2000, 4000]);
  });

  it("says plainly when the sign-in has expired", async () => {
    const f = fakeGoogle(() => Response.json({ error: { code: 401 } }, { status: 401 }));
    await expect(g.liveProvider(env, "1//r", f.fetcher, f.sleep).listAccounts()).rejects.toMatchObject({ httpStatus: 401 });
  });
});

describe("sending invitations (Google faked)", async () => {
  const g = await import("../src/access/google");
  const app = (await import("../src/index")).default;

  it("reads each kind of answer", () => {
    expect(g.inviteResult(200, { pendingInvitation: true }, "manager")).toEqual({ status: "pending_invite" });
    expect(g.inviteResult(200, {}, "manager")).toEqual({ status: "pending_invite" });
    expect(g.inviteResult(200, { pendingInvitation: false }, "manager")).toEqual({ status: "granted" });
    expect(g.inviteResult(409, { error: { status: "ALREADY_EXISTS" } }, "manager").status).toBe("pending_invite");
    expect(g.inviteResult(403, { error: { status: "PERMISSION_DENIED", message: "The caller does not have permission" } }, "owner")).toMatchObject({ status: "failed", error: expect.stringMatching(/owner/) });
    expect(g.inviteResult(400, { error: { message: "Invalid admin email" } }, "manager")).toEqual({ status: "failed", error: "Google said: Invalid admin email" });
    expect(() => g.inviteResult(403, { error: { message: "My Business Account Management API has not been used in project 1 before or it is disabled" } }, "manager")).toThrow(g.NotApprovedError);
    expect(() => g.inviteResult(429, { error: { details: [{ metadata: { quota_limit_value: "0" } }] } }, "manager")).toThrow(g.NotApprovedError);
  });

  it("runs the whole live flow: sign in, list, grant, token deleted and revoked", async () => {
    const LIVE = { GBP_MODE: "live", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "csecret", TOKEN_ENC_KEY: "55".repeat(32), STATE_SIGNING_SECRET: "sss" };
    const { env, db } = d1(LIVE);
    await createLink(env, "main", { ...linkInput, slug: "acme", accessLevel: "owner" }, "u1");
    const call = (path: string, init: RequestInit = {}) => app.fetch(new Request(`https://lf.example${path}`, init), env, { waitUntil() {}, passThroughOnException() {} } as never);
    const posted: { url: string; body: unknown }[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string, init: RequestInit = {}) => {
      const u = new URL(input);
      if (u.host === "oauth2.googleapis.com" && u.pathname === "/token") {
        const p = new URLSearchParams(String(init.body));
        return p.get("grant_type") === "authorization_code"
          ? Response.json({ access_token: "ya29.a", refresh_token: "1//rt", scope: `openid email https://www.googleapis.com/auth/business.manage`, id_token: `x.${b64url(new TextEncoder().encode(JSON.stringify({ email: "owner@gmail.com" })))}.y` })
          : Response.json({ access_token: "ya29.b" });
      }
      if (u.pathname === "/revoke") { posted.push({ url: "revoke", body: String(init.body) }); return new Response(""); }
      if (u.pathname === "/v1/accounts") return Response.json({ accounts: [{ name: "accounts/1", accountName: "Owner's account", type: "PERSONAL" }] });
      if (u.pathname === "/v1/accounts/1/locations") return Response.json({ locations: [{ name: "locations/11", title: "Shop A" }, { name: "locations/12", title: "Shop B" }] });
      if (u.pathname.endsWith("/admins")) {
        posted.push({ url: u.pathname, body: JSON.parse(String(init.body)) });
        return u.pathname.includes("/12/") ? Response.json({ error: { code: 403, status: "PERMISSION_DENIED", message: "The caller does not have permission" } }, { status: 403 })
          : Response.json({ name: "locations/11/admins/9", admin: "team@agency.com", role: "OWNER", pendingInvitation: true });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
    try {
      const start = await call("/api/connect/acme/start", { method: "POST", body: new URLSearchParams({}) });
      const cookie = start.headers.get("Set-Cookie")!.split(";")[0];
      const state = new URL(start.headers.get("Location")!).searchParams.get("state")!;
      await call(`/api/connect/oauth/callback?code=c&state=${encodeURIComponent(state)}`, { headers: { Cookie: cookie } });
      const list = await (await call("/api/connect/acme/locations", { headers: { Cookie: cookie } })).json() as { accounts: { locations: unknown[] }[] };
      expect(list.accounts[0].locations).toHaveLength(2);
      const grant = await call("/api/connect/acme/grant", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ locations: ["locations/11", "locations/12", "locations/99"] }) });
      expect(await grant.json()).toEqual({ redirect: "/connect/acme/done" });
      await new Promise((r) => setTimeout(r, 10)); // the revoke runs after the answer
    } finally { globalThis.fetch = realFetch; }

    expect(posted.filter((p) => p.url.endsWith("/admins"))).toEqual([
      { url: "/v1/locations/11/admins", body: { admin: "team@agency.com", role: "OWNER" } },
      { url: "/v1/locations/12/admins", body: { admin: "team@agency.com", role: "OWNER" } },
    ]);
    expect(posted.some((p) => p.url === "revoke" && p.body === "token=1%2F%2Frt")).toBe(true);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM oauth_tokens`).get()).toEqual({ n: 0 });
    expect(db.prepare(`SELECT status FROM access_requests`).get()).toEqual({ status: "partial" });
    expect(db.prepare(`SELECT gbp_location_name, status FROM granted_locations ORDER BY id`).all()).toEqual([
      { gbp_location_name: "locations/11", status: "pending_invite" }, { gbp_location_name: "locations/12", status: "failed" }]);
  });
});

describe("emails", async () => {
  const mail = await import("../src/access/mail");
  const link = { title: "Acme onboarding", agency_google_email: "team@agency.com", notify_email: null } as never;
  const rows = [{ title: "Shop A", status: "pending_invite" as const, error_message: null }, { title: "Shop B", status: "failed" as const, error_message: "Only an owner can add people." }];

  it("tells the agency what happened and thanks the client", () => {
    const m = mail.buildMails(link, { id: "r", status: "partial", client_name: "Pat", client_email: "pat@x.com", client_google_email: "pat@gmail.com" }, rows, "boss@agency.com", "https://lf.example", "Goes Local");
    expect(m.agency?.to).toBe("boss@agency.com");
    expect(m.agency?.subject).toBe("Pat shared Business Profile access");
    expect(m.agency?.lines[0]).toBe(`Pat shared 1 Business Profile through "Acme onboarding" (1 couldn't be shared).`);
    expect(m.agency?.items).toEqual(["Shop A: invitation sent (accept it in Business Profile)", "Shop B: not shared (Only an owner can add people.)"]);
    expect(m.agency?.link?.url).toBe("https://lf.example/access");
    expect(m.client?.to).toBe("pat@x.com");
    expect(m.client?.subject).toBe("Thanks, Goes Local has your Business Profile request");
  });

  it("only emails the client when something was shared, and handles 'added by hand'", () => {
    const failed = mail.buildMails(link, { id: "r", status: "failed", client_name: null, client_email: "pat@x.com", client_google_email: null }, [rows[1]], "boss@agency.com", "https://lf.example", "");
    expect(failed.client).toBeNull();
    expect(failed.agency?.subject).toBe("Access request failed: pat@x.com");
    const manual = mail.buildMails(link, { id: "r", status: "manual_pending", client_name: "Sam", client_email: null, client_google_email: null }, [], "", "https://lf.example", "");
    expect(manual.agency).toBeNull(); // no address to send to
    expect(manual.bell).toBe("Sam says they added team@agency.com to their Business Profile by hand.");
  });

  it("escapes what clients typed", () => {
    const { html } = mail.renderMail({ to: "a@b.com", subject: "s", lines: ["<img src=x onerror=alert(1)>"] }, "<b>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("sends through Resend only when it's set up", async () => {
    const { env, db } = d1({ RESEND_API_KEY: "re_test", GBP_EMAIL_FROM: "Goes Local <hi@goeslocal.example>" });
    const l = await createLink(env, "main", { ...linkInput, slug: "acme", notifyEmail: "alerts@agency.com" }, "u1");
    db.prepare(`INSERT INTO access_requests (id, agency_id, link_id, client_name, client_email, status) VALUES ('r1', 'main', ?, 'Pat', 'pat@x.com', 'granted')`).run(l.id);
    db.prepare(`INSERT INTO granted_locations (request_id, gbp_account_name, gbp_location_name, title, status) VALUES ('r1', 'accounts/1', 'locations/1', 'Shop A', 'pending_invite')`).run();
    const sent: { to: string[]; from: string; subject: string }[] = [];
    const fetcher = (async (_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return Response.json({ id: "e1" }); }) as unknown as typeof fetch;
    await mail.notifyFinished(env as never, l, "r1", "https://lf.example", fetcher);
    expect(sent.map((s) => s.to[0])).toEqual(["alerts@agency.com", "pat@x.com"]);
    expect(sent[0].from).toBe("Goes Local <hi@goeslocal.example>");
    expect((db.prepare(`SELECT message FROM notifications`).get() as { message: string }).message).toMatch(/Pat shared 1 Business Profile/);
    expect(await mail.emailOn({ DB: env.DB } as never)).toBe(false);
  });
});
