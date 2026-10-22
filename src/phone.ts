// Phone line type: toll-free is detected from the area code for free; mobile /
// landline / VoIP needs a lookup service. Providers are tried in order: Telnyx (live
// carrier/porting data), then Abstract (free tier), then Veriphone, skipping any that
// refuse (e.g. account not upgraded, free checks used up).

import { monthSpend, notify } from "./ops";
import { abstractLineType, ABSTRACT_PHONE_ENDPOINT, type AbstractPhoneResponse } from "./providers/abstract-phone";

export type PhoneType = "mobile" | "landline" | "toll_free" | "voip" | "unknown";

interface LookupResult {
  type: PhoneType;
  carrier: string | null;
}

interface PhoneProvider {
  name: string;
  /** Estimated USD per lookup, recorded against the search's phone cost. */
  costPerLookup: number;
  /** Minimum gap between calls (free plans are rate limited). */
  minIntervalMs?: number;
  lookup(e164: string): Promise<LookupResult>;
}

/** Account-level problem (bad key, no credit, feature not enabled): stop using this provider. */
class ProviderBlockedError extends Error {}

const TOLL_FREE_AREA_CODES = ["800", "833", "844", "855", "866", "877", "888"];
// Workers' free plan allows 50 outbound requests per invocation; stay under it.
const LOOKUPS_PER_RUN = 40;
const LOOKUP_TIMEOUT_MS = 8000;

export function isTollFree(e164: string | null): boolean {
  return !!e164 && e164.startsWith("+1") && TOLL_FREE_AREA_CODES.includes(e164.slice(2, 5));
}

/** "Too many requests right now": not a refusal, just try again a little later. */
class RateLimitedError extends Error {}

async function fetchJson<T>(provider: string, url: string, apiKey: string, extraBlocked: number[] = []): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!res.ok) {
    const message = `${provider} ${res.status}: ${(await res.text()).slice(0, 300)}`;
    if (res.status === 429) throw new RateLimitedError(message);
    if ([401, 402, 403, ...extraBlocked].includes(res.status)) throw new ProviderBlockedError(message);
    throw new Error(message);
  }
  return res.json<T>();
}

// --- Telnyx ---------------------------------------------------------------

interface TelnyxLookup {
  data?: {
    carrier?: { type?: string; name?: string; normalized_carrier?: string };
    portability?: { line_type?: string; spid_carrier_name?: string; ported_status?: string };
  };
}

/** Maps a free-text line type ("Wireless", "voip", "fixed line", …) to ours. */
function lineTypeFromText(text: string | undefined): PhoneType | null {
  const t = (text ?? "").toLowerCase();
  if (!t) return null;
  if (t.includes("toll")) return "toll_free";
  if (t.includes("voip") || t.includes("vowifi")) return "voip";
  if (t === "fixed line or mobile") return null; // ambiguous; let the other field decide
  if (t.includes("mobile") || t.includes("wireless") || t.includes("cell")) return "mobile";
  if (t.includes("fixed") || t.includes("wireline") || t.includes("landline")) return "landline";
  return null;
}

export function telnyxResultToLineType(body: TelnyxLookup): LookupResult {
  const { carrier, portability } = body.data ?? {};
  // Portability reflects where the number lives today (after any port), so it wins.
  const type = lineTypeFromText(portability?.line_type) ?? lineTypeFromText(carrier?.type) ?? "unknown";
  const name = carrier?.normalized_carrier || portability?.spid_carrier_name || carrier?.name || null;
  return { type, carrier: name?.trim() || null };
}

function telnyx(apiKey: string): PhoneProvider {
  return {
    name: "Telnyx",
    costPerLookup: 0.0025,
    async lookup(e164) {
      const body = await fetchJson<TelnyxLookup>(
        "Telnyx",
        `https://api.telnyx.com/v2/number_lookup/${encodeURIComponent(e164)}?type=carrier`,
        apiKey,
      );
      return telnyxResultToLineType(body);
    },
  };
}

// --- Veriphone ------------------------------------------------------------

interface VeriphoneResponse {
  status: string;
  phone_valid: boolean;
  phone_type: string;
  carrier?: string;
}

const VERIPHONE_TYPES: Record<string, PhoneType> = {
  mobile: "mobile",
  fixed_line: "landline",
  toll_free: "toll_free",
  voip: "voip",
};

function veriphone(apiKey: string): PhoneProvider {
  return {
    name: "Veriphone",
    costPerLookup: 0, // free tier; paid tiers are fractions of a cent
    async lookup(e164) {
      const data = await fetchJson<VeriphoneResponse>(
        "Veriphone",
        `https://api.veriphone.io/v2/verify?phone=${encodeURIComponent(e164)}`,
        apiKey,
      );
      if (data.status !== "success") throw new Error(`Veriphone status ${data.status}`);
      return {
        type: data.phone_valid ? (VERIPHONE_TYPES[data.phone_type] ?? "unknown") : "unknown",
        carrier: data.carrier?.trim() || null,
      };
    },
  };
}

// --- Abstract Phone Intelligence (free tier; number-range data) ------------

function abstract(apiKey: string): PhoneProvider {
  return {
    name: "Abstract",
    costPerLookup: 0, // free tier
    minIntervalMs: 1600, // free plan: 1 request per second (with margin)
    async lookup(e164) {
      const body = await fetchJson<AbstractPhoneResponse>(
        "Abstract",
        `${ABSTRACT_PHONE_ENDPOINT}?${new URLSearchParams({ phone: e164 })}`,
        apiKey,
        [422], // Abstract: free checks used up
      );
      return { type: abstractLineType(body), carrier: body.phone_carrier?.name?.trim() || null };
    },
  };
}

/** Providers in order of preference. When one refuses (no credit, not enabled) the next is used. */
function providers(env: Env): PhoneProvider[] {
  const list: PhoneProvider[] = [];
  if (env.TELNYX_API_KEY) list.push(telnyx(env.TELNYX_API_KEY));
  if (env.ABSTRACT_PHONE_API_KEY) list.push(abstract(env.ABSTRACT_PHONE_API_KEY));
  if (env.VERIPHONE_API_KEY) list.push(veriphone(env.VERIPHONE_API_KEY));
  return list;
}

/** What a phone check can cost with the services set up: the most per number, and whether a free one exists. */
export function phoneCheckPricing(env: Env): { maxPerCheck: number; hasFreeService: boolean; hasService: boolean } {
  const chain = providers(env);
  return {
    maxPerCheck: chain.reduce((m, p) => Math.max(m, p.costPerLookup), 0),
    hasFreeService: chain.some((p) => p.costPerLookup === 0),
    hasService: chain.length > 0,
  };
}

// The phone-check queue. phone_check_requested: 1 = queued by a pull that asked for phone types,
// 2 = asked for by hand (checked first). A number keeps its old answer until a new one arrives.
// A partial index (idx_leads_phone_queue) holds only queued rows, so these reads stay tiny.
const QUEUED = `l.phone_check_requested > 0 AND l.gbp_phone_formatted IS NOT NULL`;

/** Most numbers one request can queue (keeps a mistaken click cheap). */
export const MAX_PHONE_REQUEST = 1000;
/** Highest price per check among the services in use (Telnyx); Abstract's free checks cost nothing. */
export const PHONE_CHECK_MAX_USD = 0.0025;
// Retry a failed lookup after 5 minutes, then 30 minutes; give up after the third try.
const RETRY_DELAYS_MIN = [5, 30];
const MAX_ATTEMPTS = 3;
// While checks are paused, the minute timer retries this often (a by-hand request retries at once).
const PAUSE_RETRY_MINUTES = 30;
// Stop a run well before the 3-minute lock could go stale.
const RUN_TIME_LIMIT_MS = 110_000;

export async function pendingPhoneCount(env: Env): Promise<number> {
  return (await env.DB.prepare(`SELECT COUNT(*) AS n FROM leads l WHERE ${QUEUED}`).first<number>("n")) ?? 0;
}

/** Queues the verified, open, unchecked businesses of these pulls (used when a pull asks for phone types). */
export async function queuePhonesForSearches(env: Env, searchIds: string[]): Promise<number> {
  if (!searchIds.length) return 0;
  const list = searchIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ");
  const r = await env.DB.prepare(
    `UPDATE leads SET phone_check_requested = 1, phone_check_requested_at = datetime('now'), phone_check_attempts = 0
     WHERE id IN (SELECT lead_id FROM search_leads WHERE search_id IN (${list}))
       AND phone_check_requested = 0 AND phone_type IS NULL AND gbp_phone_formatted IS NOT NULL
       AND COALESCE(is_claimed, 1) = 1 AND business_status = 'operational'`,
  ).run();
  return r.meta.changes ?? 0;
}

export interface PhoneRequestResult {
  /** Businesses looked at. */
  total: number;
  /** No phone number on Google: nothing to check. */
  noPhone: number;
  /** Has a phone that was never checked. */
  unchecked: number;
  /** Already waiting in the queue. */
  waiting: number;
  /** Already has an answer (mobile, landline, …). */
  checked: number;
  /** Toll-free numbers: known from the number itself, never looked up. */
  tollFree: number;
  /** What this request adds to the queue. */
  queued: number;
  maxCostUsd: number;
  maxPerCheck: number;
  hasFreeService: boolean;
  hasService: boolean;
}

/**
 * Queues phone checks for the given businesses, verified or not. With recheck, numbers that
 * already have an answer are checked again (the old answer stays until the new one arrives).
 * dryRun only counts, so the page can explain what would happen and what it could cost.
 */
export async function requestPhoneChecks(
  env: Env,
  leadIds: string[],
  opts: { recheck?: boolean; dryRun?: boolean } = {},
): Promise<PhoneRequestResult> {
  const pricing = phoneCheckPricing(env);
  const ids = [...new Set(leadIds)].slice(0, MAX_PHONE_REQUEST);
  const empty = { total: 0, noPhone: 0, unchecked: 0, waiting: 0, checked: 0, tollFree: 0, queued: 0, maxCostUsd: 0, ...pricing };
  if (!ids.length) return empty;
  const list = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ");
  const c = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(gbp_phone_formatted IS NULL) AS no_phone,
            SUM(gbp_phone_formatted IS NOT NULL AND phone_check_requested > 0) AS waiting,
            SUM(gbp_phone_formatted IS NOT NULL AND phone_check_requested = 0 AND phone_type IS NULL) AS unchecked,
            SUM(gbp_phone_formatted IS NOT NULL AND phone_check_requested = 0 AND phone_type IS NOT NULL AND phone_type <> 'toll_free') AS checked,
            SUM(gbp_phone_formatted IS NOT NULL AND phone_type = 'toll_free') AS toll_free
     FROM leads WHERE id IN (${list})`,
  ).first<Record<string, number | null>>();
  const n = (k: string) => c?.[k] ?? 0;
  const queued = n("unchecked") + (opts.recheck ? n("checked") : 0);
  const result: PhoneRequestResult = {
    total: n("total"), noPhone: n("no_phone"), unchecked: n("unchecked"), waiting: n("waiting"), checked: n("checked"),
    tollFree: n("toll_free"), queued, maxCostUsd: queued * pricing.maxPerCheck, ...pricing,
  };
  if (opts.dryRun || !queued) return result;
  await env.DB.prepare(
    `UPDATE leads SET phone_check_requested = 2, phone_check_requested_at = datetime('now'), phone_check_attempts = 0, enrichment_error = NULL
     WHERE id IN (${list}) AND gbp_phone_formatted IS NOT NULL AND phone_check_requested = 0
       AND (phone_type IS NULL OR (? AND phone_type <> 'toll_free'))`,
  )
    .bind(opts.recheck ? 1 : 0)
    .run();
  return result;
}

export type PhoneCheckState = "idle" | "running" | "paused_budget" | "paused_refused" | "retrying" | "no_service" | "busy";

export interface PhoneCheckResult {
  checked: number;
  /** Still waiting after this run. */
  pending: number;
  /** Plain-language state for the page. */
  state: PhoneCheckState;
  provider: string | null;
  /** Services that refused this run (e.g. account not upgraded, free checks used up). */
  refused: string[];
  error?: string;
  /** Another run is already checking phones. */
  busy?: boolean;
}

/**
 * Checks the line type of queued numbers. Only one run at a time (a lock in app_settings),
 * so the minute timer and open pages never check, or pay for, a number twice. When nothing is
 * queued it returns after one tiny read, without taking the lock.
 */
export async function checkPendingPhones(env: Env, limit = LOOKUPS_PER_RUN, opts: { force?: boolean } = {}): Promise<PhoneCheckResult> {
  const waiting = await env.DB.prepare(`SELECT 1 AS x FROM leads l WHERE ${QUEUED} LIMIT 1`).first();
  if (!waiting) return { checked: 0, pending: 0, state: "idle", provider: null, refused: [] };
  // While paused (services refusing, or budget used up), only try again every PAUSE_RETRY_MINUTES,
  // unless someone asks by hand: no point knocking on a closed door every minute.
  if (!opts.force) {
    const last = await env.DB.prepare(
      `SELECT value FROM app_settings WHERE key = 'phone_check_status' AND updated_at >= datetime('now', ?)`,
    ).bind(`-${PAUSE_RETRY_MINUTES} minutes`).first<string>("value");
    const state = last ? (JSON.parse(last) as { state?: string }).state : null;
    if (state === "paused_refused" || state === "paused_budget") {
      return { checked: 0, pending: await pendingPhoneCount(env), state, provider: null, refused: [] };
    }
  }
  if (!providers(env).length) {
    await saveStatus(env, "no_service", 1);
    return { checked: 0, pending: await pendingPhoneCount(env), state: "no_service", provider: null, refused: [] };
  }
  const lock = crypto.randomUUID();
  const got = await env.DB.prepare(
    `UPDATE app_settings SET value = ?, updated_at = datetime('now')
     WHERE key = 'phone_check_lock' AND (value = '' OR updated_at < datetime('now', '-3 minutes'))`,
  )
    .bind(lock)
    .run();
  if (!got.meta.changes) return { checked: 0, pending: await pendingPhoneCount(env), state: "busy", provider: null, refused: [], busy: true };
  try {
    return await runPhoneChecks(env, limit, lock);
  } finally {
    await env.DB.prepare(`UPDATE app_settings SET value = '' WHERE key = 'phone_check_lock' AND value = ?`).bind(lock).run();
  }
}

interface QueuedLead {
  id: string;
  search_id: string | null;
  phone: string;
  old_type: string | null;
  attempts: number;
}

async function runPhoneChecks(env: Env, limit: number, lock: string): Promise<PhoneCheckResult> {
  const started = Date.now();
  const chain = providers(env);
  const { results: batch } = await env.DB.prepare(
    `SELECT l.id, l.search_id, l.gbp_phone_formatted AS phone, l.phone_type AS old_type, l.phone_check_attempts AS attempts
     FROM leads l WHERE ${QUEUED} AND (l.phone_check_requested_at IS NULL OR l.phone_check_requested_at <= datetime('now'))
     ORDER BY l.phone_check_requested DESC, l.phone_check_requested_at, l.created_at LIMIT ?`,
  )
    .bind(Math.min(Math.max(limit, 1), LOOKUPS_PER_RUN))
    .all<QueuedLead>();

  const save = (ids: string[], type: PhoneType, carrier: string | null, cost: number, searchId: string | null) => {
    const list = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ");
    const statements = [
      env.DB.prepare(
        `UPDATE leads SET phone_type = ?, phone_carrier = ?, enrichment_error = NULL, phone_check_requested = 0,
           phone_check_attempts = 0, updated_at = datetime('now') WHERE id IN (${list})`,
      ).bind(type, carrier),
    ];
    if (cost > 0) {
      statements.push(
        env.DB.prepare(`UPDATE searches SET cost_twilio = cost_twilio + ? WHERE id = ?`).bind(cost, searchId),
        // Booked to today, so it counts toward this month's budget whenever the lead was pulled.
        env.DB.prepare(`INSERT INTO spend_log (kind, amount_usd) VALUES ('phone', ?)`).bind(cost),
      );
    }
    return env.DB.batch(statements);
  };

  // Several listings can share a number: look each number up once.
  const byPhone = new Map<string, QueuedLead[]>();
  for (const lead of batch) byPhone.set(lead.phone, [...(byPhone.get(lead.phone) ?? []), lead]);

  // Reuse a recent answer for the same number from another listing (free), except for re-checks.
  const fresh = [...byPhone.keys()].filter((ph) => byPhone.get(ph)!.every((l) => !l.old_type));
  if (fresh.length) {
    const { results: known } = await env.DB.prepare(
      `SELECT gbp_phone_formatted AS phone, phone_type, phone_carrier FROM leads
       WHERE gbp_phone_formatted IN (${fresh.map((ph) => `'${ph.replace(/'/g, "''")}'`).join(", ")})
         AND phone_type IS NOT NULL AND phone_type <> 'unknown' AND phone_check_requested = 0
         AND updated_at >= datetime('now', '-90 days')
       GROUP BY gbp_phone_formatted`,
    ).all<{ phone: string; phone_type: PhoneType; phone_carrier: string | null }>();
    for (const k of known) {
      const leads = byPhone.get(k.phone)!;
      await save(leads.map((l) => l.id), k.phone_type, k.phone_carrier, 0, null);
      byPhone.delete(k.phone);
    }
  }

  // Paid checks stop at this month's budget; free services carry on.
  const left = chain.some((p) => p.costPerLookup > 0) ? (await monthSpend(env)).left : Infinity;
  let spent = 0;
  let checked = 0;
  let lastCall = 0;
  let state: PhoneCheckState = "running";
  const blocked = new Set<string>();
  const refused: string[] = [];
  let budgetStopped = false;
  let lastProvider: string | null = null;

  numbers: for (const [phone, leads] of byPhone) {
    if (Date.now() - started > RUN_TIME_LIMIT_MS) break;
    const ids = leads.map((l) => l.id);
    if (isTollFree(phone)) {
      await save(ids, "toll_free", null, 0, null);
      checked += ids.length;
      continue;
    }
    let lastError = "";
    let answered4xx = false;
    for (const provider of chain) {
      if (blocked.has(provider.name)) continue;
      if (provider.costPerLookup > 0 && spent + provider.costPerLookup > left) {
        budgetStopped = true;
        continue; // over budget: try a free service instead
      }
      try {
        const wait = (provider.minIntervalMs ?? 0) - (Date.now() - lastCall);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        lastCall = Date.now();
        const { type, carrier } = await provider.lookup(phone).catch(async (err) => {
          if (err instanceof RateLimitedError) {
            await new Promise((r) => setTimeout(r, 3000));
            lastCall = Date.now();
            return provider.lookup(phone);
          }
          throw err;
        });
        await save(ids, type, carrier, provider.costPerLookup, leads[0].search_id);
        spent += provider.costPerLookup;
        checked += ids.length;
        lastProvider = provider.name;
        // Keep the lock fresh so a long run never overlaps another.
        await env.DB.prepare(`UPDATE app_settings SET updated_at = datetime('now') WHERE key = 'phone_check_lock' AND value = ?`).bind(lock).run();
        continue numbers;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`phone check of ${phone} with ${provider.name} failed:`, message);
        if (err instanceof ProviderBlockedError) {
          blocked.add(provider.name);
          refused.push(`${provider.name}: ${message}`);
          continue; // this service won't serve us today: next one
        }
        if (err instanceof RateLimitedError || /too many subrequests/i.test(message)) {
          // Busy right now, or this run's request allowance is used up: stop and carry on next run.
          state = "retrying";
          break numbers;
        }
        const status = Number(/^\w+ (\d{3}):/.exec(message)?.[1] ?? 0);
        if (status >= 400 && status < 500) {
          answered4xx = true; // the service answered: it can't look this number up
          lastError = message;
          break;
        }
        lastError = message; // outage / timeout: try the next service
      }
    }
    if (answered4xx) {
      // Keep an earlier answer if there is one; otherwise it's "Couldn't tell".
      const list = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ");
      await env.DB.prepare(
        `UPDATE leads SET phone_type = COALESCE(phone_type, 'unknown'), phone_check_requested = 0, phone_check_attempts = 0,
           enrichment_error = ? WHERE id IN (${list})`,
      ).bind(lastError.slice(0, 300)).run();
      checked += ids.length;
      continue;
    }
    if (chain.every((p) => blocked.has(p.name) || (p.costPerLookup > 0 && budgetStopped))) break; // nobody left to ask
    if (lastError) {
      // Every service failed temporarily: try again later, and give up after a few tries.
      const attempts = (leads[0].attempts ?? 0) + 1;
      const list = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ");
      const giveUp = attempts >= MAX_ATTEMPTS;
      await env.DB.prepare(
        `UPDATE leads SET phone_check_attempts = ?, enrichment_error = ?,
           phone_check_requested = CASE WHEN ? THEN 0 ELSE phone_check_requested END,
           phone_check_requested_at = CASE WHEN ? THEN phone_check_requested_at ELSE datetime('now', ?) END
         WHERE id IN (${list})`,
      )
        .bind(attempts, `Couldn't check (${giveUp ? "gave up after " + attempts + " tries" : "will retry"}): ${lastError.slice(0, 200)}`,
          giveUp ? 1 : 0, giveUp ? 1 : 0, `+${RETRY_DELAYS_MIN[Math.min(attempts - 1, RETRY_DELAYS_MIN.length - 1)]} minutes`)
        .run();
    }
  }

  const pending = await pendingPhoneCount(env);
  const allRefused = chain.every((p) => blocked.has(p.name));
  const onlyPaidLeftOverBudget = budgetStopped && chain.every((p) => blocked.has(p.name) || p.costPerLookup > 0);
  if (pending > 0 && allRefused) {
    state = "paused_refused";
    await notify(env, {
      kind: "phones_paused",
      level: "warn",
      message: "Phone-type checks (mobile or landline) are paused: the phone-check service needs topping up. Nothing else is affected.",
      dedupeKey: `phones-paused-${new Date().toISOString().slice(0, 7)}`,
    });
  } else if (pending > 0 && onlyPaidLeftOverBudget) {
    state = "paused_budget";
    await notify(env, {
      kind: "budget",
      level: "warn",
      message: "Phone checks are paused: this month’s budget for paid services is used up or set to $0. The super admin can change it on the Admin page (Spending).",
      dedupeKey: `phones-budget-${new Date().toISOString().slice(0, 7)}`,
    });
  } else if (!pending) {
    state = "idle";
  }
  if (budgetStopped) refused.push("Budget: this month’s budget is used up or set to $0");
  await saveStatus(env, state, pending);
  return { checked, pending, state, provider: lastProvider, refused };
}

/** The last run's outcome, so the page can explain a pause without starting a run itself. */
async function saveStatus(env: Env, state: PhoneCheckState, pending: number) {
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('phone_check_status', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
    .bind(JSON.stringify({ state, pending }))
    .run();
}

export interface PhoneStatus {
  pending: number;
  state: PhoneCheckState;
  /** Plain-language line for the page, or null when there's nothing to say. */
  message: string | null;
}

/** Cheap status for the page: how many numbers wait, and why (from the last run). */
export async function phoneStatus(env: Env): Promise<PhoneStatus> {
  const pending = await pendingPhoneCount(env);
  if (!pending) return { pending: 0, state: "idle", message: null };
  if (!providers(env).length) return { pending, state: "no_service", message: `${pending.toLocaleString("en-US")} phone numbers are waiting, but no phone-check service is set up.` };
  const row = await env.DB.prepare(`SELECT value FROM app_settings WHERE key = 'phone_check_status'`).first<string>("value");
  let state: PhoneCheckState = "running";
  try {
    state = (JSON.parse(row ?? "{}") as { state?: PhoneCheckState }).state ?? "running";
  } catch {
    // keep "running"
  }
  if (state === "idle" || state === "busy") state = "running";
  const n = pending.toLocaleString("en-US");
  const message =
    state === "paused_budget" ? `Phone checks are paused: this month’s budget for paid services is used up or set to $0 (${n} waiting). The super admin can change it on the Admin page (Spending).`
    : state === "paused_refused" ? `Phone checks are paused: the phone-check service is out of credit or needs upgrading (${n} waiting).`
    : state === "retrying" ? `Checking phone types: ${n} to go (the service is busy, retrying shortly).`
    : `Checking phone types: ${n} to go. Results appear within a few minutes.`;
  return { pending, state, message };
}