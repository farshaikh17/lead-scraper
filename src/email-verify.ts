// Email verification with MillionVerifier (about $0.50-2.50 per 1,000, prepaid credits on the
// team's own MillionVerifier account). Only on request: "Verify emails" on a list checks the
// best email of each business in it. Results are kept per address (email_checks), so the same
// address is never paid for twice, and downloads leave out addresses that would bounce.
//
// Results: ok = safe to send; catch_all = the domain accepts everything (can't be sure);
// unknown = the server didn't say; invalid / disposable = don't send.

import { bestFirst } from "./emails";
import { ValidationError } from "./pipeline";
import { sqlString } from "./leads";
import { getBudget } from "./ops";

const API = "https://api.millionverifier.com/api/v3/";
const PER_TICK = 20;          // outside requests per minute job (the free plan allows 50 per run)
const MAX_PER_REQUEST = 5000; // businesses per "Verify emails"
const RECHECK_DAYS = 90;
// Addresses taken by a run are pushed this far ahead in the queue, so a second run can't send
// them again; if the run dies they simply come back after this long.
const LEASE_MINUTES = 15;
const MAX_TRIES = 3;
export const BAD_RESULTS = ["invalid", "disposable"];
const RESULTS = ["ok", "catch_all", "unknown", "invalid", "disposable"];

type VerifyEnv = Env & { MILLIONVERIFIER_API_KEY?: string };

const upsert = (env: Env, key: string, value: string) => env.DB.prepare(
  `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
).bind(key, value);

/** The email that would be used for each business: its best one (a person's first). */
async function bestEmails(env: Env, leadIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < leadIds.length; i += 90) {
    const { results } = await env.DB.prepare(
      `SELECT lead_id, email FROM lead_emails WHERE lead_id IN (${leadIds.slice(i, i + 90).map(sqlString).join(", ")}) ORDER BY lead_id, position`,
    ).all<{ lead_id: string; email: string }>();
    const by = new Map<string, string[]>();
    for (const r of results) by.set(r.lead_id, [...(by.get(r.lead_id) ?? []), r.email.toLowerCase()]);
    for (const [id, list] of by) out.set(id, bestFirst(list)[0]);
  }
  return out;
}

async function known(env: Env, emails: string[]): Promise<Map<string, { result: string; checked_at: string | null }>> {
  const out = new Map<string, { result: string; checked_at: string | null }>();
  for (let i = 0; i < emails.length; i += 90) {
    const { results } = await env.DB.prepare(
      `SELECT email, result, checked_at FROM email_checks WHERE email IN (${emails.slice(i, i + 90).map(sqlString).join(", ")})`,
    ).all<{ email: string; result: string; checked_at: string | null }>();
    for (const r of results) out.set(r.email, r);
  }
  return out;
}

/**
 * Doesn't need (re)checking: already waiting, checked in the last RECHECK_DAYS, or known to
 * bounce (kept for good: re-checking costs money and would put it back in downloads meanwhile).
 * A failed check ('error', from before retries existed) is not fresh.
 */
export function isFresh(k: { result: string; checked_at: string | null } | undefined, cutoff: string): boolean {
  if (!k) return false;
  if (k.result === "queued" || BAD_RESULTS.includes(k.result)) return true;
  return k.result !== "error" && !!k.checked_at && k.checked_at > cutoff;
}

/**
 * An answer we couldn't read: try again later, and after MAX_TRIES give up as 'unknown'.
 * The number of tries so far is kept at the start of the error text ("try 2: ...").
 */
export function afterBadAnswer(prevError: string | null, message: string | null): { giveUp: boolean; error: string } {
  const tries = (Number(/^try (\d+):/.exec(prevError ?? "")?.[1]) || 0) + 1;
  const text = (message || "unexpected answer").slice(0, 150);
  return tries >= MAX_TRIES ? { giveUp: true, error: text } : { giveUp: false, error: `try ${tries}: ${text}` };
}

export const QUEUE_EMAIL_SQL = `INSERT INTO email_checks (email, result, queued_at) VALUES (?, 'queued', datetime('now'))
  ON CONFLICT(email) DO UPDATE SET result = 'queued', queued_at = datetime('now'), error = NULL
  WHERE email_checks.result NOT IN ('queued', 'invalid', 'disposable')`;

/** "Verify emails" for these businesses: preview (dryRun) or queue the ones not checked yet. */
export async function requestVerification(env: VerifyEnv, leadIds: string[], opts: { dryRun?: boolean } = {}) {
  if (!env.MILLIONVERIFIER_API_KEY) throw new ValidationError("Email verification needs the MillionVerifier key (MILLIONVERIFIER_API_KEY).");
  // A $0 monthly budget pauses every paid service, this one included (it uses bought credits).
  if (!opts.dryRun && (await getBudget(env)) <= 0) throw new ValidationError("Paid services are paused: this month’s budget is $0 (Admin → Spending).");
  const ids = [...new Set(leadIds)].slice(0, MAX_PER_REQUEST);
  const emails = [...new Set((await bestEmails(env, ids)).values())];
  const have = await known(env, emails);
  const cutoff = new Date(Date.now() - RECHECK_DAYS * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
  const todo = emails.filter((e) => !isFresh(have.get(e), cutoff));
  const credits = await env.DB.prepare(`SELECT value FROM app_settings WHERE key = 'millionverifier_credits'`).first<string>("value");
  const summary = {
    businesses: ids.length, withEmail: emails.length, alreadyChecked: emails.length - todo.length, toCheck: todo.length,
    credits: credits == null || credits === "" ? null : Number(credits),
  };
  if (opts.dryRun || !todo.length) return { ...summary, queued: 0 };
  // Never touches an address already waiting (or being checked) or known to bounce.
  const st = todo.map((e) => env.DB.prepare(QUEUE_EMAIL_SQL).bind(e));
  for (let i = 0; i < st.length; i += 90) await env.DB.batch(st.slice(i, i + 90));
  return { ...summary, queued: todo.length };
}

export interface MvAnswer { result: string; subresult: string | null; quality: string | null; role: boolean | null; free: boolean | null; credits: number | null; error: string | null }

/** Reads MillionVerifier's answer (never trusts its shape). */
export function parseMvAnswer(v: unknown): MvAnswer {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const s = (x: unknown) => (typeof x === "string" && x ? x.slice(0, 60) : null);
  const result = typeof o.result === "string" && RESULTS.includes(o.result) ? o.result : "error";
  return {
    result, subresult: s(o.subresult), quality: s(o.quality),
    role: typeof o.role === "boolean" ? o.role : null, free: typeof o.free === "boolean" ? o.free : null,
    credits: typeof o.credits === "number" ? o.credits : null, error: s(o.error),
  };
}

export const CLAIM_EMAILS_SQL = `UPDATE email_checks SET queued_at = datetime('now', '+${LEASE_MINUTES} minutes')
  WHERE result = 'queued' AND email IN (
    SELECT email FROM email_checks WHERE result = 'queued' AND queued_at <= datetime('now') ORDER BY queued_at LIMIT ?)
  RETURNING email, error`;

/** Minute job: checks up to PER_TICK queued addresses. */
export async function verifyStep(env: VerifyEnv): Promise<{ checked: number }> {
  const key = env.MILLIONVERIFIER_API_KEY;
  if (!key) return { checked: 0 };
  // Claim in one statement (so two runs never pay for the same address): the taken ones move
  // LEASE_MINUTES ahead in the queue. Anything not finished below just comes back then.
  const { results } = await env.DB.prepare(CLAIM_EMAILS_SQL).bind(PER_TICK).all<{ email: string; error: string | null }>();
  if (!results.length) return { checked: 0 };
  const prevError = new Map(results.map((r) => [r.email, r.error]));
  let credits: number | null = null;
  let stop = false;
  const answers = await Promise.all(results.map(async ({ email }) => {
    try {
      const res = await fetch(`${API}?${new URLSearchParams({ api: key, email, timeout: "20" })}`, { signal: AbortSignal.timeout(30_000) });
      if (res.status === 429 || res.status >= 500) return null; // try again next minute
      const a = parseMvAnswer(await res.json().catch(() => null));
      if (a.credits != null) credits = a.credits;
      // Out of credits / bad key: leave everything queued and say so on the Admin page.
      if (a.result === "error" && a.error && /credit|api key|apikey|invalid key/i.test(a.error)) { stop = true; return { email, a, keep: true }; }
      return { email, a, keep: false };
    } catch {
      return null;
    }
  }));
  const st: D1PreparedStatement[] = [];
  for (const x of answers) {
    if (!x || x.keep) continue;
    if (x.a.result === "error") {
      // Couldn't read the answer: stays queued (tried again after the lease), 'unknown' after MAX_TRIES.
      const next = afterBadAnswer(prevError.get(x.email) ?? null, x.a.error);
      st.push(next.giveUp
        ? env.DB.prepare(`UPDATE email_checks SET result = 'unknown', checked_at = datetime('now'), error = ? WHERE email = ?`).bind(next.error, x.email)
        : env.DB.prepare(`UPDATE email_checks SET error = ? WHERE email = ? AND result = 'queued'`).bind(next.error, x.email));
      continue;
    }
    st.push(env.DB.prepare(
      `UPDATE email_checks SET result = ?, subresult = ?, quality = ?, is_role = ?, is_free = ?, checked_at = datetime('now'), error = ? WHERE email = ?`,
    ).bind(x.a.result, x.a.subresult, x.a.quality, x.a.role == null ? null : x.a.role ? 1 : 0, x.a.free == null ? null : x.a.free ? 1 : 0, x.a.error, x.email));
  }
  if (credits != null) st.push(upsert(env, "millionverifier_credits", String(credits)));
  const problem = answers.find((x) => x?.keep)?.a.error;
  st.push(upsert(env, "millionverifier_problem", stop && problem ? problem : ""));
  if (st.length) await env.DB.batch(st);
  return { checked: answers.filter((x) => x && !x.keep).length };
}

export async function verifyStatus(env: VerifyEnv) {
  const r = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM email_checks WHERE result = 'queued') AS queued,
            (SELECT COUNT(*) FROM email_checks WHERE result = 'ok') AS ok,
            (SELECT COUNT(*) FROM email_checks WHERE result IN ('catch_all', 'unknown')) AS risky,
            (SELECT COUNT(*) FROM email_checks WHERE result IN ('invalid', 'disposable')) AS bad,
            (SELECT value FROM app_settings WHERE key = 'millionverifier_credits') AS credits,
            (SELECT value FROM app_settings WHERE key = 'millionverifier_problem') AS problem`,
  ).first<{ queued: number; ok: number; risky: number; bad: number; credits: string | null; problem: string | null }>();
  return { enabled: !!env.MILLIONVERIFIER_API_KEY, ...r, credits: r?.credits ? Number(r.credits) : null, problem: r?.problem || null };
}
