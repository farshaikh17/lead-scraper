// Google Business Profile access requests: the agency's links and the requests clients make through
// them. Every read and write here is scoped to one agency (agency_id). This app has one agency, the
// team itself, so every signed-in person belongs to "main"; a reseller setup would map users to agencies.

import type { User } from "../auth";

export const LINK_STATUSES = ["opened", "authorized", "granted", "partial", "failed", "manual_pending"] as const;
export type RequestStatus = (typeof LINK_STATUSES)[number];
export type LocationStatus = "pending_invite" | "granted" | "failed";
export type AccessLevel = "manager" | "owner";

export class AccessError extends Error {
  constructor(message: string, public status: 400 | 403 | 404 | 409 | 429 = 400) {
    super(message);
  }
}

export interface RequestLink {
  id: string; agency_id: string; slug: string; title: string; welcome_text: string | null; access_level: AccessLevel;
  agency_google_email: string; notify_email: string | null; logo_url: string | null; brand_color: string | null;
  is_active: number; created_by: string | null; created_at: string; updated_at: string;
}

export interface AccessRequest {
  id: string; agency_id: string; link_id: string; client_name: string | null; client_email: string | null;
  client_google_email: string | null; status: RequestStatus; error_message: string | null; listing_json: string | null;
  mode: string | null; created_at: string; updated_at: string; finished_at: string | null;
}

export interface GrantedLocation {
  id: number; request_id: string; gbp_account_name: string; gbp_location_name: string; title: string | null;
  address: string | null; status: LocationStatus; error_message: string | null; created_at: string; updated_at: string;
}

/** The agency a signed-in person works for. */
export const agencyOf = (_user: Pick<User, "id">): string => "main";

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i;
export const validEmail = (v: string) => v.length <= 160 && EMAIL_RE.test(v);
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;

export const newId = () => crypto.randomUUID();
const randomSuffix = () => [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, "0")).join("");

export function slugFrom(title: string): string {
  const base = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36).replace(/-+$/, "");
  return `${base || "access"}-${randomSuffix()}`;
}

export interface LinkInput {
  title?: unknown; slug?: unknown; welcomeText?: unknown; accessLevel?: unknown; agencyGoogleEmail?: unknown;
  notifyEmail?: unknown; logoUrl?: unknown; brandColor?: unknown; isActive?: unknown;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Checks and tidies what the agency typed for a link. `partial` = an edit (missing fields are left alone). */
export function cleanLinkInput(input: LinkInput, partial = false) {
  const out: Partial<Pick<RequestLink, "title" | "slug" | "welcome_text" | "access_level" | "agency_google_email" | "notify_email" | "logo_url" | "brand_color" | "is_active">> = {};
  const has = (k: keyof LinkInput) => !partial || input[k] !== undefined;
  if (has("title")) {
    out.title = text(input.title, 120);
    if (!out.title) throw new AccessError("Give the link a name (only your team sees it).");
  }
  if (has("slug") && text(input.slug, 60)) {
    const slug = text(input.slug, 60).toLowerCase();
    if (!SLUG_RE.test(slug)) throw new AccessError("The link address can use lowercase letters, numbers and dashes (3 to 48 characters).");
    out.slug = slug;
  }
  if (has("welcomeText")) out.welcome_text = text(input.welcomeText, 1200) || null;
  if (has("accessLevel")) {
    if (input.accessLevel !== "manager" && input.accessLevel !== "owner") throw new AccessError("Access level must be manager or owner.");
    out.access_level = input.accessLevel;
  }
  if (has("agencyGoogleEmail")) {
    const e = text(input.agencyGoogleEmail, 160).toLowerCase();
    if (!validEmail(e)) throw new AccessError("Enter the Google account email your agency uses for Business Profiles.");
    out.agency_google_email = e;
  }
  if (has("notifyEmail")) {
    const e = text(input.notifyEmail, 160).toLowerCase();
    if (e && !validEmail(e)) throw new AccessError("The email for notifications doesn't look right.");
    out.notify_email = e || null;
  }
  if (has("logoUrl")) {
    const u = text(input.logoUrl, 500);
    if (u) {
      let ok = false;
      try { ok = new URL(u).protocol === "https:"; } catch { ok = false; }
      if (!ok) throw new AccessError("The logo must be an https:// image address.");
    }
    out.logo_url = u || null;
  }
  if (has("brandColor")) {
    const c = text(input.brandColor, 7);
    if (c && !/^#[0-9a-f]{6}$/i.test(c)) throw new AccessError("The colour must look like #1F6FEB.");
    out.brand_color = c || null;
  }
  if (partial && input.isActive !== undefined) {
    if (typeof input.isActive !== "boolean") throw new AccessError("isActive must be true or false.");
    out.is_active = input.isActive ? 1 : 0;
  }
  return out;
}

export async function listLinks(env: Env, agencyId: string) {
  const { results } = await env.DB.prepare(
    `SELECT l.*, (SELECT COUNT(*) FROM access_requests r WHERE r.link_id = l.id) AS requests,
       (SELECT MAX(r.created_at) FROM access_requests r WHERE r.link_id = l.id) AS last_request_at
     FROM request_links l WHERE l.agency_id = ? ORDER BY l.created_at DESC`,
  ).bind(agencyId).all<RequestLink & { requests: number; last_request_at: string | null }>();
  return results;
}

export async function createLink(env: Env, agencyId: string, input: LinkInput, userId: string): Promise<RequestLink> {
  const v = cleanLinkInput(input);
  const slug = v.slug ?? slugFrom(v.title!);
  if (await env.DB.prepare(`SELECT 1 AS x FROM request_links WHERE slug = ?`).bind(slug).first()) {
    throw new AccessError("That link address is taken. Pick another one.", 409);
  }
  const id = newId();
  await env.DB.prepare(
    `INSERT INTO request_links (id, agency_id, slug, title, welcome_text, access_level, agency_google_email, notify_email, logo_url, brand_color, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, agencyId, slug, v.title!, v.welcome_text ?? null, v.access_level ?? "manager", v.agency_google_email!, v.notify_email ?? null,
    v.logo_url ?? null, v.brand_color ?? null, userId).run();
  return (await getLink(env, agencyId, id))!;
}

export async function getLink(env: Env, agencyId: string, id: string): Promise<RequestLink | null> {
  return env.DB.prepare(`SELECT * FROM request_links WHERE id = ? AND agency_id = ?`).bind(id, agencyId).first<RequestLink>();
}

export async function updateLink(env: Env, agencyId: string, id: string, input: LinkInput): Promise<RequestLink | null> {
  const current = await getLink(env, agencyId, id);
  if (!current) return null;
  const v = cleanLinkInput(input, true);
  if (v.slug && v.slug !== current.slug && (await env.DB.prepare(`SELECT 1 AS x FROM request_links WHERE slug = ?`).bind(v.slug).first())) {
    throw new AccessError("That link address is taken. Pick another one.", 409);
  }
  const entries = Object.entries(v);
  if (entries.length) {
    await env.DB.prepare(`UPDATE request_links SET ${entries.map(([k]) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ? AND agency_id = ?`)
      .bind(...entries.map(([, x]) => x ?? null), id, agencyId).run();
  }
  return getLink(env, agencyId, id);
}

/** Requests for the dashboard, newest first; `status` filters (one of LINK_STATUSES), `linkId` narrows to one link. */
export async function listRequests(env: Env, agencyId: string, filter: { status?: string | null; linkId?: string | null } = {}) {
  const where = ["r.agency_id = ?"], binds: unknown[] = [agencyId];
  if (filter.status && (LINK_STATUSES as readonly string[]).includes(filter.status)) { where.push("r.status = ?"); binds.push(filter.status); }
  if (filter.linkId) { where.push("r.link_id = ?"); binds.push(filter.linkId); }
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.link_id, l.title AS link_title, r.client_name, r.client_email, r.client_google_email, r.status, r.error_message, r.mode,
       r.created_at, r.updated_at, r.finished_at,
       (SELECT COUNT(*) FROM granted_locations g WHERE g.request_id = r.id) AS locations,
       (SELECT COUNT(*) FROM granted_locations g WHERE g.request_id = r.id AND g.status <> 'failed') AS locations_ok
     FROM access_requests r JOIN request_links l ON l.id = r.link_id
     WHERE ${where.join(" AND ")} ORDER BY r.created_at DESC LIMIT 500`,
  ).bind(...binds).all();
  const counts = await env.DB.prepare(`SELECT status, COUNT(*) AS n FROM access_requests WHERE agency_id = ? GROUP BY status`).bind(agencyId).all<{ status: string; n: number }>();
  return { requests: results, counts: Object.fromEntries(counts.results.map((x) => [x.status, x.n])) };
}

export async function requestDetail(env: Env, agencyId: string, id: string) {
  const r = await env.DB.prepare(
    `SELECT r.id, r.link_id, l.title AS link_title, l.slug, l.agency_google_email, l.access_level, r.client_name, r.client_email, r.client_google_email,
       r.status, r.error_message, r.mode, r.created_at, r.updated_at, r.finished_at
     FROM access_requests r JOIN request_links l ON l.id = r.link_id WHERE r.id = ? AND r.agency_id = ?`,
  ).bind(id, agencyId).first();
  if (!r) return null;
  const { results } = await env.DB.prepare(
    `SELECT id, gbp_account_name, gbp_location_name, title, address, status, error_message, updated_at FROM granted_locations WHERE request_id = ? ORDER BY id`,
  ).bind(id).all<GrantedLocation>();
  return { ...r, locations: results };
}

/** The agency confirms it accepted Google's invitation for a profile (or marks a manual request done). */
export async function markLocationAccepted(env: Env, agencyId: string, requestId: string, locationId: number): Promise<boolean> {
  const r = await env.DB.prepare(
    `UPDATE granted_locations SET status = 'granted', updated_at = datetime('now')
     WHERE id = ? AND request_id = ? AND status = 'pending_invite'
       AND request_id IN (SELECT id FROM access_requests WHERE agency_id = ?)`,
  ).bind(locationId, requestId, agencyId).run();
  return (r.meta?.changes ?? 0) > 0;
}
