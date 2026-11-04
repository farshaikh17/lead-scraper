import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { cleanLinkInput, createLink, listLinks, listRequests, markLocationAccepted, requestDetail, slugFrom, updateLink } from "../src/access/db";

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
