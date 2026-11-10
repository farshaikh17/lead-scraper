// What happens when a client uses an access link: start a request, list their profiles, send the
// invitations, or say they added the agency by hand. The browser is tied to its request by a signed
// cookie; the client's Google sign-in (refresh token) is kept encrypted only until the invitations are sent.

import { gbpMode, type GbpEnv, type GbpMode } from "./config";
import { AccessError, newId, validEmail, type AccessLevel, type AccessRequest, type LocationStatus, type RequestLink, type RequestStatus } from "./db";
import { MOCK_GOOGLE_EMAIL, NotApprovedError, type GbpAccount, type GbpProvider } from "./google";

export const TOKEN_MINUTES = 60;

/** An active link by its public address (or null). */
export async function linkBySlug(env: Env, slug: string): Promise<RequestLink | null> {
  if (!/^[a-z0-9-]{3,48}$/.test(slug)) return null;
  return env.DB.prepare(`SELECT * FROM request_links WHERE slug = ? AND is_active = 1`).bind(slug).first<RequestLink>();
}

export async function requestFor(env: Env, link: RequestLink, id: string | null): Promise<AccessRequest | null> {
  if (!id) return null;
  return env.DB.prepare(`SELECT * FROM access_requests WHERE id = ? AND link_id = ?`).bind(id, link.id).first<AccessRequest>();
}

/**
 * Counts one try against a limit per key (an IP and an action) in a time window, in one database
 * step (shared with the sign-in limits table). Throws once the limit is passed.
 */
export async function rateLimit(env: Env, key: string, limit: number, windowMinutes: number) {
  const n = await env.DB.prepare(
    `INSERT INTO login_attempts (ip, window_start, attempts) VALUES (?, datetime('now'), 1)
     ON CONFLICT(ip) DO UPDATE SET
       attempts = CASE WHEN window_start < datetime('now', ?) THEN 1 ELSE attempts + 1 END,
       window_start = CASE WHEN window_start < datetime('now', ?) THEN datetime('now') ELSE window_start END
     RETURNING attempts`,
  ).bind(`gbp:${key}`, `-${windowMinutes} minutes`, `-${windowMinutes} minutes`).first<number>("attempts");
  if ((n ?? 0) > limit) throw new AccessError(`Too many tries from this network. Please wait ${windowMinutes} minutes and try again.`, 429);
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** "Continue": a new request for this link, with the name and email the client typed (both optional). */
export async function startRequest(env: GbpEnv, link: RequestLink, input: { name?: unknown; email?: unknown }): Promise<{ request: AccessRequest; mode: GbpMode }> {
  const email = clean(input.email, 160).toLowerCase();
  if (email && !validEmail(email)) throw new AccessError("That email address doesn't look right.");
  const mode = gbpMode(env);
  const id = newId();
  await env.DB.prepare(`INSERT INTO access_requests (id, agency_id, link_id, client_name, client_email, status, mode) VALUES (?, ?, ?, ?, ?, 'opened', ?)`)
    .bind(id, link.agency_id, link.id, clean(input.name, 120) || null, email || null, mode).run();
  if (mode === "mock") await authorize(env, id, MOCK_GOOGLE_EMAIL, "mock");
  return { request: (await env.DB.prepare(`SELECT * FROM access_requests WHERE id = ?`).bind(id).first<AccessRequest>())!, mode };
}

/** After Google sign-in: remember who signed in and keep the (already encrypted) token for an hour. */
export async function authorize(env: Env, requestId: string, googleEmail: string | null, sealedToken: string) {
  await env.DB.batch([
    env.DB.prepare(`UPDATE access_requests SET status = 'authorized', client_google_email = ?, error_message = NULL, updated_at = datetime('now') WHERE id = ?`)
      .bind(googleEmail, requestId),
    env.DB.prepare(
      `INSERT INTO oauth_tokens (request_id, refresh_token_encrypted, expires_at) VALUES (?, ?, datetime('now', ?))
       ON CONFLICT(request_id) DO UPDATE SET refresh_token_encrypted = excluded.refresh_token_encrypted, expires_at = excluded.expires_at, created_at = datetime('now')`,
    ).bind(requestId, sealedToken, `+${TOKEN_MINUTES} minutes`),
  ]);
}

/** The stored (encrypted) token while it's still valid, without removing it. */
export async function storedToken(env: Env, requestId: string): Promise<string | null> {
  return env.DB.prepare(`SELECT refresh_token_encrypted FROM oauth_tokens WHERE request_id = ? AND expires_at > datetime('now')`)
    .bind(requestId).first<string>("refresh_token_encrypted");
}

/** Takes the token out (deleted in the same step), so only one "Grant access" can use it. */
export async function takeToken(env: Env, requestId: string): Promise<string | null> {
  const t = await env.DB.prepare(`DELETE FROM oauth_tokens WHERE request_id = ? RETURNING refresh_token_encrypted, expires_at > datetime('now') AS fresh`)
    .bind(requestId).first<{ refresh_token_encrypted: string; fresh: number }>();
  return t && t.fresh ? t.refresh_token_encrypted : null;
}

/** Tokens nobody used within the hour (the client closed the page). Runs from the minute job. */
export async function dropExpiredTokens(env: Env) {
  await env.DB.prepare(`DELETE FROM oauth_tokens WHERE expires_at <= datetime('now')`).run();
}

/** Lists the client's profiles and remembers the list, so "Grant access" only takes profiles from it. */
export async function listForRequest(env: Env, request: AccessRequest, provider: GbpProvider): Promise<GbpAccount[]> {
  const accounts = await provider.listAccounts();
  const slim = accounts.map((a) => ({ ...a, locations: a.locations.map((l) => ({ name: l.name, title: l.title, address: l.address })) }));
  await env.DB.prepare(`UPDATE access_requests SET listing_json = ?, updated_at = datetime('now') WHERE id = ?`).bind(JSON.stringify(slim), request.id).run();
  return slim;
}

export interface GrantOutcome { status: RequestStatus; results: { name: string; title: string; status: LocationStatus; error?: string }[] }

export const overallStatus = (statuses: LocationStatus[]): RequestStatus => {
  const ok = statuses.filter((s) => s !== "failed").length;
  return ok === statuses.length ? "granted" : ok ? "partial" : "failed";
};

/**
 * Invites the link's Google account to each chosen profile and records each result. `chosen` are
 * location names; only ones from the stored list are accepted (and each once).
 */
export async function grantForRequest(env: Env, link: RequestLink, request: AccessRequest, chosen: unknown, provider: GbpProvider): Promise<GrantOutcome> {
  let listing: GbpAccount[] = [];
  try { listing = request.listing_json ? (JSON.parse(request.listing_json) as GbpAccount[]) : []; } catch { listing = []; }
  const byName = new Map(listing.flatMap((a) => a.locations.map((l) => [l.name, { account: a.name, ...l }] as const)));
  const names = [...new Set(Array.isArray(chosen) ? chosen.filter((x): x is string => typeof x === "string") : [])].filter((n) => byName.has(n)).slice(0, 200);
  if (!names.length) throw new AccessError("Tick at least one business profile.");

  const results: GrantOutcome["results"] = [];
  let notApproved = 0;
  for (const name of names) {
    const loc = byName.get(name)!;
    let r: { status: LocationStatus; error?: string };
    try {
      r = await provider.invite(name, link.agency_google_email, link.access_level as AccessLevel);
    } catch (err) {
      if (err instanceof NotApprovedError) { notApproved++; r = { status: "failed", error: "Google hasn't switched this on for us yet." }; }
      else r = { status: "failed", error: err instanceof Error ? err.message.slice(0, 300) : "Unknown problem" };
    }
    results.push({ name, title: loc.title, ...r });
    await env.DB.prepare(
      `INSERT INTO granted_locations (request_id, gbp_account_name, gbp_location_name, title, address, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(request_id, gbp_location_name) DO UPDATE SET status = excluded.status, error_message = excluded.error_message, updated_at = datetime('now')`,
    ).bind(request.id, loc.account, name, loc.title, loc.address || null, r.status, r.error ?? null).run();
  }
  // Every invitation refused because the API isn't approved: the manual guide instead.
  if (notApproved === names.length) {
    await env.DB.prepare(`UPDATE access_requests SET error_message = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind("Google hasn't approved API access yet: the client was sent to the manual steps.", request.id).run();
    throw new NotApprovedError("not approved");
  }
  const status = overallStatus(results.map((r) => r.status));
  const failed = results.filter((r) => r.status === "failed").length;
  // The list of every profile the client manages was only needed to check their choice: drop it.
  await env.DB.prepare(`UPDATE access_requests SET status = ?, error_message = ?, listing_json = NULL, finished_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
    .bind(status, failed ? `${failed} of ${results.length} profiles couldn't be shared.` : null, request.id).run();
  return { status, results };
}

/** "I've added you" on the manual guide (a new request when the browser hasn't got one). */
export async function markManual(env: GbpEnv, link: RequestLink, request: AccessRequest | null, input: { name?: unknown; email?: unknown }): Promise<AccessRequest> {
  let id = request?.id;
  if (!id) {
    const email = clean(input.email, 160).toLowerCase();
    if (email && !validEmail(email)) throw new AccessError("That email address doesn't look right.");
    id = newId();
    await env.DB.prepare(`INSERT INTO access_requests (id, agency_id, link_id, client_name, client_email, status, mode) VALUES (?, ?, ?, ?, ?, 'opened', 'manual')`)
      .bind(id, link.agency_id, link.id, clean(input.name, 120) || null, email || null).run();
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE access_requests SET status = 'manual_pending', finished_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND status NOT IN ('granted')`).bind(id),
    env.DB.prepare(`DELETE FROM oauth_tokens WHERE request_id = ?`).bind(id),
  ]);
  return (await env.DB.prepare(`SELECT * FROM access_requests WHERE id = ?`).bind(id).first<AccessRequest>())!;
}

export async function grantedFor(env: Env, requestId: string) {
  const { results } = await env.DB.prepare(`SELECT title, address, status, error_message FROM granted_locations WHERE request_id = ? ORDER BY id`)
    .bind(requestId).all<{ title: string | null; address: string | null; status: LocationStatus; error_message: string | null }>();
  return results;
}
