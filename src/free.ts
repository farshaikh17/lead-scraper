// Free tier: businesses from Overture Maps open data (free to use, CDLA-Permissive-2.0).
//
// 1. "Collect for free" creates a free_imports row and one search per type x place
//    (source 'free'), then asks GitHub Actions to run scripts/overture_collect.py
//    (or an admin runs it on any computer).
// 2. The collector reads /api/free/collector/<id>/spec, queries Overture with DuckDB and posts
//    the businesses back in gzip chunks, which are parked in R2 (BACKUPS bucket, free/ prefix).
// 3. freeSaveStep() saves them a slice at a time (queue message { free: true } + the minute cron),
//    at most `free_daily_limit` businesses a day so the free plan's database allowance holds.
//    A business we already have (same Overture id, or the same phone or website in the same city;
//    toll-free numbers never count) is linked, not stored twice. Only one saving step runs at a
//    time (a lease in app_settings).

import categoryMap from "../data/category-map.json";
import { applyToLeads } from "./suppress";
import { formatLeadDate, formatLeadDateTime } from "./format";
import { cleanEmails, safeWebsite, toE164, websiteDomain } from "./normalize";
import { notify } from "./ops";
import { isTollFree, queuePhonesForSearches } from "./phone";
import { industryOf } from "./taxonomy";
import type { ResolvedPlace } from "./find";
import { verifyGithubOidc } from "./github-oidc";

const MAP = categoryMap as Record<string, string[]>;
/** Places from Overture below this confidence are usually stale or duplicates. */
export const MIN_CONFIDENCE = 0.5;
/** Default radius around a picked city (Google's "plumber in Orlando" also covers the suburbs). */
const CITY_RADIUS_KM = 20;
const SAVE_ROWS_PER_STEP = 250;
const DB_BATCH = 50;
/** Counted from when the collector was started: the job may run 2 hours, plus GitHub's queue. */
const STALE_IMPORT_HOURS = 4;
/** One saving chain at a time: a step holds this lease (app_settings) while it saves. */
const SAVE_LEASE_KEY = "free_save_lease";
const SAVE_LEASE_MINUTES = 3;
/** A batch that can't be read this many times is skipped, so it can't hold up everything after it. */
const MAX_CHUNK_FAILURES = 3;
const CHUNK_FAILURES_KEY = "free_chunk_failures";

type FreeEnv = Env & { BACKUPS?: R2Bucket; GITHUB_DISPATCH_TOKEN?: string; FREE_COLLECTOR_SECRET?: string; GITHUB_REPO?: string; GITHUB_REPO_ID?: string };

/** Overture categories for a Google business type, or [] when the free data doesn't have it. */
export function overtureCategories(googleType: string): string[] {
  return MAP[googleType] ?? MAP[Object.keys(MAP).find((k) => k.toLowerCase() === googleType.toLowerCase()) ?? ""] ?? [];
}

export interface CollectorPlace {
  country: string;
  /** US state code (Overture writes US regions as 2-letter codes). */
  regionCode: string | null;
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
}

/** Where the collector should look for a place: a box around it, plus a region or radius filter. */
export async function collectorPlace(env: Env, place: ResolvedPlace): Promise<CollectorPlace | null> {
  const country = place.countryCode;
  // "Within X miles of" a city: a circle around the centre found when the search was made.
  if (place.city && place.radiusMiles && place.lat != null && place.lng != null) {
    const km = Math.round(place.radiusMiles * 1.609344 * 10) / 10;
    const dLat = km / 111.32, dLng = km / (111.32 * Math.cos((place.lat * Math.PI) / 180));
    return {
      country, regionCode: null, lat: place.lat, lng: place.lng, radiusKm: km,
      bbox: [round(place.lng - dLng), round(place.lat - dLat), round(place.lng + dLng), round(place.lat + dLat)],
    };
  }
  if (place.city) {
    const regionCode = country === "US" ? place.state : await regionCodeByName(env, country, place.regionName);
    const city = await env.DB.prepare(
      `SELECT lat, lng FROM geo_cities WHERE country = ? AND (name = ? OR ascii = ?) ${regionCode ? "AND region = ?" : ""}
       ORDER BY population DESC LIMIT 1`,
    )
      .bind(...[country, place.city, place.city, ...(regionCode ? [regionCode] : [])])
      .first<{ lat: number; lng: number }>();
    if (!city) return null;
    const dLat = CITY_RADIUS_KM / 111.32, dLng = CITY_RADIUS_KM / (111.32 * Math.cos((city.lat * Math.PI) / 180));
    return {
      country, regionCode: null, lat: city.lat, lng: city.lng, radiusKm: CITY_RADIUS_KM,
      bbox: [round(city.lng - dLng), round(city.lat - dLat), round(city.lng + dLng), round(city.lat + dLat)],
    };
  }
  // Whole state / region / country: a box around its cities, with a margin.
  const regionCode = place.regionName ? (country === "US" ? place.state : await regionCodeByName(env, country, place.regionName)) : null;
  const box = await env.DB.prepare(
    `SELECT MIN(lng) AS w, MIN(lat) AS s, MAX(lng) AS e, MAX(lat) AS n FROM geo_cities WHERE country = ? ${regionCode ? "AND region = ?" : ""}`,
  )
    .bind(...[country, ...(regionCode ? [regionCode] : [])])
    .first<{ w: number | null; s: number | null; e: number | null; n: number | null }>();
  if (box?.w == null || box.s == null || box.e == null || box.n == null) return null;
  const m = 0.6;
  return {
    country,
    // Only US regions are filtered by name: elsewhere Overture's region codes differ from GeoNames'.
    regionCode: country === "US" ? regionCode : null,
    lat: null, lng: null, radiusKm: null,
    bbox: [round(box.w - m), round(box.s - m), round(box.e + m), round(box.n + m)],
  };
}

async function regionCodeByName(env: Env, country: string, name: string | null): Promise<string | null> {
  if (!name) return null;
  return env.DB.prepare(`SELECT code FROM geo_regions WHERE country = ? AND name = ?`).bind(country, name).first<string>("code");
}

const round = (n: number) => Math.round(n * 10000) / 10000;

export interface FreeSearchInput {
  category: string;
  place: ResolvedPlace;
}

/**
 * Starts a free collection: one search per type x place, all collected by one collector run.
 * Returns the searches (status 'pending' until the collector picks them up).
 */
export async function startFreeCollection(
  env: FreeEnv,
  items: FreeSearchInput[],
  opts: { checkPhones: boolean; createdBy: string | null },
): Promise<{ importId: string; searchIds: string[]; dispatched: boolean; dispatchError: string | null }> {
  const importId = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO free_imports (id, created_by) VALUES (?, ?)`).bind(importId, opts.createdBy).run();
  const searchIds: string[] = [];
  for (const it of items) {
    const id = crypto.randomUUID();
    searchIds.push(id);
    await env.DB.prepare(
      `INSERT INTO searches (id, category, city, state, country, country_code, region_name, source_code, max_results,
         check_phones, apify_actor_id, created_by, estimated_cost, status, source, free_import_id, radius_miles, center_lat, center_lng)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'overture', ?, 0, 'pending', 'free', ?, ?, ?, ?)`,
    )
      .bind(id, it.category, it.place.city, it.place.state || null, it.place.countryCode === "US" ? "USA" : it.place.countryName,
        it.place.countryCode, it.place.regionName, env.SOURCE_CODE_DEFAULT, opts.checkPhones ? 1 : 0, opts.createdBy, importId,
        it.place.radiusMiles ?? null, it.place.lat ?? null, it.place.lng ?? null)
      .run();
  }
  const d = await dispatchCollector(env, importId);
  return { importId, searchIds, dispatched: d.ok, dispatchError: d.error };
}

/** Starts the free-collect.yml workflow on GitHub (needs GITHUB_DISPATCH_TOKEN). 204 = started. */
export async function startWorkflow(env: FreeEnv, importId = ""): Promise<Response | null> {
  if (!env.GITHUB_DISPATCH_TOKEN) return null;
  const repo = env.GITHUB_REPO || "farshaikh17/lead-scraper";
  return fetch(`https://api.github.com/repos/${repo}/actions/workflows/free-collect.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "lead-finder",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { import_id: importId } }),
    signal: AbortSignal.timeout(20_000),
  });
}

/** Asks GitHub Actions to run the collector for this import. */
export async function dispatchCollector(env: FreeEnv, importId: string): Promise<{ ok: boolean; error: string | null }> {
  // Without a token the scheduled collector picks it up on its next check (every ~10 minutes).
  if (!env.GITHUB_DISPATCH_TOKEN) return { ok: false, error: null };
  try {
    const res = (await startWorkflow(env, importId))!;
    if (res.status !== 204) {
      const text = (await res.text()).slice(0, 200);
      const error = `GitHub didn’t start the free collector (${res.status}): ${text}`;
      await env.DB.prepare(`UPDATE free_imports SET error = ? WHERE id = ?`).bind(error, importId).run();
      return { ok: false, error };
    }
    await env.DB.prepare(`UPDATE free_imports SET runner = 'github', dispatched_at = datetime('now'), error = NULL WHERE id = ?`).bind(importId).run();
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: `GitHub didn’t answer: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ----------------------------------------------------------------------------------------
// Collector endpoints (called by scripts/overture_collect.py with the collector secret)
// ----------------------------------------------------------------------------------------

/**
 * The collector proves who it is either with GitHub's signed pass for our free-collect.yml
 * workflow (no stored secret needed), or with FREE_COLLECTOR_SECRET (running on a computer).
 */
export async function collectorAuthorized(env: FreeEnv, header: string | undefined): Promise<boolean> {
  if (!header?.startsWith("Bearer ")) return false;
  const given = header.slice(7).trim();
  const secret = env.FREE_COLLECTOR_SECRET;
  if (secret && given.length === secret.length) {
    let diff = 0;
    for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
    if (diff === 0) return true;
  }
  return given.split(".").length === 3 && !!(await verifyGithubOidc(given, env.GITHUB_REPO || "farshaikh17/lead-scraper", env.GITHUB_REPO_ID));
}

/**
 * The scheduled collector asks for work every ~10 minutes: hands out the oldest waiting
 * collection (claimed, so two runs never take the same one) and notes that it checked in.
 */
export async function claimNextImport(env: FreeEnv): Promise<string | null> {
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('collector_seen_at', datetime('now'), datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run();
  return env.DB.prepare(
    `UPDATE free_imports SET status = 'claimed', runner = COALESCE(runner, 'github'), dispatched_at = datetime('now')
     WHERE id = (SELECT id FROM free_imports WHERE status = 'queued' ORDER BY created_at LIMIT 1) AND status = 'queued'
     RETURNING id`,
  ).first<string>("id");
}

/** Puts a waiting or failed collection back in line for the collector. */
export async function requeueImport(env: FreeEnv, importId: string): Promise<boolean> {
  const r = await env.DB.prepare(
    `UPDATE free_imports SET status = 'queued', error = NULL, created_at = datetime('now'), finished_at = NULL
     WHERE id = ? AND status IN ('queued', 'claimed', 'failed')`,
  ).bind(importId).run();
  if (!r.meta.changes) return false;
  await env.DB.prepare(
    `UPDATE searches SET status = 'pending', error = NULL, finished_at = NULL WHERE free_import_id = ? AND status = 'failed' AND cancelled_at IS NULL`,
  ).bind(importId).run();
  return true;
}

interface SearchRowLite {
  id: string; category: string; city: string; state: string | null; country: string; country_code: string | null;
  region_name: string | null; status: string; cancelled_at: string | null; check_phones: number;
}

/** What the collector should read: each waiting search's Overture categories and area. */
export async function collectorSpec(env: FreeEnv, importId: string) {
  const imp = await env.DB.prepare(`SELECT status FROM free_imports WHERE id = ?`).bind(importId).first<string>("status");
  if (!imp) return null;
  const { results } = await env.DB.prepare(
    `SELECT id, category, city, state, country, country_code, region_name, status, cancelled_at, check_phones, radius_miles, center_lat, center_lng
     FROM searches WHERE free_import_id = ? AND status IN ('pending', 'scraping') AND cancelled_at IS NULL`,
  )
    .bind(importId)
    .all<SearchRowLite & { radius_miles: number | null; center_lat: number | null; center_lng: number | null }>();
  const searches = [];
  for (const s of results) {
    const cc = s.country_code ?? "US";
    const place: ResolvedPlace = {
      countryCode: cc, countryName: s.country, state: s.state ?? "", regionName: s.region_name, city: s.city, label: "",
      radiusMiles: s.radius_miles, lat: s.center_lat, lng: s.center_lng,
    };
    const area = await collectorPlace(env, place);
    const categories = overtureCategories(s.category);
    if (!area || !categories.length) {
      // (spec is asked for by the collector; searches it can't do are failed with a plain reason)
      await env.DB.prepare(`UPDATE searches SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?`)
        .bind(!area ? "Couldn’t find this place on the map." : "This type of business isn’t in the free data. Use Google Maps (paid) for it.", s.id)
        .run();
      continue;
    }
    searches.push({ id: s.id, label: `${s.category} in ${s.city || s.region_name || s.country}`, categories, place: area });
  }
  return { searches, minConfidence: MIN_CONFIDENCE };
}

export async function collectorStarted(env: FreeEnv, importId: string, release: string | null, runner: string | null) {
  await env.DB.batch([
    env.DB.prepare(`UPDATE free_imports SET status = 'collecting', release = ?, runner = COALESCE(?, runner), error = NULL WHERE id = ?`)
      .bind(release, runner, importId),
    env.DB.prepare(`UPDATE searches SET status = 'scraping', updated_at = datetime('now') WHERE free_import_id = ? AND status = 'pending' AND cancelled_at IS NULL`)
      .bind(importId),
  ]);
}

/** One gzip NDJSON batch from the collector, parked in R2 until it's saved. */
export async function collectorChunk(env: FreeEnv, importId: string, searchId: string, n: number, rows: number, body: ArrayBuffer) {
  if (!env.BACKUPS) throw new Error("File storage (R2) isn’t connected.");
  const owns = await env.DB.prepare(`SELECT 1 AS x FROM searches WHERE id = ? AND free_import_id = ?`).bind(searchId, importId).first();
  if (!owns) throw new Error("That search doesn’t belong to this collection.");
  const key = `free/${importId}/${String(n).padStart(6, "0")}.ndjson.gz`;
  await env.BACKUPS.put(key, body, { httpMetadata: { contentType: "application/gzip" } });
  // A retried upload of the same batch keeps its saving progress and isn't counted twice.
  const r = await env.DB.prepare(`INSERT OR IGNORE INTO free_import_chunks (import_id, n, search_id, rows, r2_key) VALUES (?, ?, ?, ?, ?)`)
    .bind(importId, n, searchId, rows, key).run();
  if (r.meta.changes) {
    await env.DB.prepare(`UPDATE free_imports SET rows_received = rows_received + ?, chunks = chunks + 1 WHERE id = ?`).bind(rows, importId).run();
  }
}

export async function collectorDone(env: FreeEnv, importId: string, perSearch: Record<string, number>, release: string | null) {
  const statements = [
    env.DB.prepare(`UPDATE free_imports SET status = 'received', collected_at = datetime('now'), release = COALESCE(?, release) WHERE id = ?`).bind(release, importId),
  ];
  for (const [id, rows] of Object.entries(perSearch)) {
    statements.push(
      rows > 0
        ? env.DB.prepare(`UPDATE searches SET status = 'ingesting', rows_expected = ?, results_count = ?, updated_at = datetime('now')
                          WHERE id = ? AND free_import_id = ? AND status IN ('pending', 'scraping')`).bind(rows, rows, id, importId)
        : env.DB.prepare(`UPDATE searches SET status = 'done', rows_expected = 0, results_count = 0, finished_at = datetime('now'),
                            error = 'The free map data has none of these here. Try Google Maps (paid) for this search.'
                          WHERE id = ? AND free_import_id = ? AND status IN ('pending', 'scraping')`).bind(id, importId),
    );
  }
  await env.DB.batch(statements);
  // The collector posts batches while it works, so some searches may already be fully saved:
  // finish those now (nothing else would), and the collection itself once nothing is open.
  const { results: open } = await env.DB.prepare(
    `SELECT id FROM searches WHERE free_import_id = ? AND status IN ('scraping', 'ingesting')`,
  ).bind(importId).all<{ id: string }>();
  for (const { id } of open) await finishSearchIfSaved(env, id);
  await finishImportIfDone(env, importId);
  await env.INGEST_QUEUE?.send({ free: true }).catch(() => undefined);
}

export async function collectorFailed(env: FreeEnv, importId: string, error: string) {
  const message = `The free collector stopped: ${error.slice(0, 300)}`;
  await env.DB.batch([
    env.DB.prepare(`UPDATE free_imports SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?`).bind(message, importId),
    env.DB.prepare(`UPDATE searches SET status = 'failed', error = ?, finished_at = datetime('now')
                    WHERE free_import_id = ? AND status IN ('pending', 'scraping')`).bind(message, importId),
  ]);
  await notify(env, { kind: "free_failed", level: "error", message, dedupeKey: `free-failed-${importId}` });
}

// ----------------------------------------------------------------------------------------
// Saving (a slice at a time)
// ----------------------------------------------------------------------------------------

export interface OvertureRow {
  id: string;
  name: string | null;
  category: string | null;
  alternates?: string[];
  confidence?: number | null;
  websites?: string[];
  phones?: string[];
  socials?: string[];
  emails?: string[];
  brand?: string | null;
  street?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  operating_status?: string | null;
}

export interface FreeLead {
  googlePlaceId: string;
  name: string | null;
  phoneRaw: string | null;
  phone: string | null;
  website: string | null;
  domain: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  status: "operational" | "temporarily_closed" | "permanently_closed";
  emails: string[];
  socials: string | null;
  subCategory: string | null;
  raw: string;
}

const humanize = (cat: string | null) => (cat ? cat.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : null);

/** An Overture record as a lead (pure; no database). */
/** The open data mixes "APOLLO BEACH" and "Apollo Beach"; store all-capitals names as "Apollo Beach". */
export function tidyCity(city: string | null | undefined): string | null {
  const c = city?.trim().replace(/\s+/g, " ");
  if (!c) return null;
  if (c !== c.toUpperCase() || !/[A-Z]/.test(c)) return c;
  return c.toLowerCase().replace(/(^|[\s\-'.])([a-z])/g, (_m, p: string, ch: string) => p + ch.toUpperCase());
}

export function overtureToLead(r: OvertureRow): FreeLead {
  const country = (r.country ?? "").toUpperCase() || null;
  const phoneRaw = (r.phones ?? []).find(Boolean) ?? null;
  const website = safeWebsite((r.websites ?? []).find(Boolean) ?? null);
  const status = r.operating_status === "permanently_closed" ? "permanently_closed"
    : r.operating_status === "temporarily_closed" ? "temporarily_closed" : "operational";
  const emails = cleanEmails(r.emails ?? []);
  const socials = (r.socials ?? []).filter((s) => /^https?:\/\//i.test(s)).slice(0, 6);
  return {
    googlePlaceId: `ovt:${r.id}`,
    name: r.name?.trim() || null,
    phoneRaw,
    phone: toE164(phoneRaw, country ?? "US"),
    website,
    domain: websiteDomain(website),
    street: r.street?.trim() || null,
    city: tidyCity(r.city),
    state: r.region?.trim() || null,
    postcode: r.postcode?.trim() || null,
    country: country === "US" ? "USA" : country,
    lat: typeof r.lat === "number" ? r.lat : null,
    lng: typeof r.lng === "number" ? r.lng : null,
    status,
    emails,
    socials: socials.length ? socials.join(", ") : null,
    subCategory: humanize(r.category),
    raw: JSON.stringify({ source: "overture", id: r.id, category: r.category, alternates: r.alternates ?? [], confidence: r.confidence ?? null, brand: r.brand ?? null }),
  };
}

const sql = (v: string) => `'${v.replace(/'/g, "''")}'`;

/** A parked batch as lines (one business each); only the lines being saved are parsed. */
async function readChunkLines(env: FreeEnv, key: string): Promise<string[]> {
  const obj = await env.BACKUPS!.get(key);
  if (!obj) throw new Error(`Saved batch ${key} is missing from file storage.`);
  const text = await new Response(obj.body.pipeThrough(new DecompressionStream("gzip"))).text();
  return text.split("\n").filter(Boolean);
}

/** Parses lines into rows; a damaged line is left out rather than stopping the batch. */
export function parseLines(lines: string[]): OvertureRow[] {
  const out: OvertureRow[] = [];
  for (const l of lines) {
    try {
      const r = JSON.parse(l) as OvertureRow;
      if (r && typeof r === "object" && typeof r.id === "string") out.push(r);
    } catch { /* damaged line: skipped */ }
  }
  return out;
}

/** Whether a batch is finished once `savedRows` of its lines are saved (the lines actually read count, not the number sent). */
export function chunkFinished(savedRows: number, linesInChunk: number): boolean {
  return savedRows >= linesInChunk;
}

/** Claims the saving lease; returns its value (to release it) or null when another step holds it. */
async function claimSaveLease(env: Env): Promise<string | null> {
  const token = crypto.randomUUID();
  await env.DB.prepare(`INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, '', datetime('now'))`).bind(SAVE_LEASE_KEY).run();
  // value = "<expiry> <token>": expired (or '') sorts before now, so it can be taken over.
  return env.DB.prepare(
    `UPDATE app_settings SET value = datetime('now', ?) || ' ' || ?, updated_at = datetime('now')
     WHERE key = ? AND value < datetime('now') RETURNING value`,
  ).bind(`+${SAVE_LEASE_MINUTES} minutes`, token, SAVE_LEASE_KEY).first<string>("value");
}

async function releaseSaveLease(env: Env, lease: string) {
  await env.DB.prepare(`UPDATE app_settings SET value = '' WHERE key = ? AND value = ?`).bind(SAVE_LEASE_KEY, lease).run();
}

/** Counts a failed read of a batch; returns how many times it has failed (and forgets it on `clear`). */
async function chunkFailures(env: Env, id: string, op: "add" | "clear"): Promise<number> {
  const raw = await env.DB.prepare(`SELECT value FROM app_settings WHERE key = ?`).bind(CHUNK_FAILURES_KEY).first<string>("value");
  let map: Record<string, number> = {};
  try { map = raw ? (JSON.parse(raw) as Record<string, number>) : {}; } catch { map = {}; }
  if (op === "clear" && !(id in map)) return 0;
  const n = op === "add" ? (map[id] ?? 0) + 1 : 0;
  if (op === "add") map[id] = n; else delete map[id];
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).bind(CHUNK_FAILURES_KEY, JSON.stringify(map)).run();
  return n;
}

/** Today's allowance: how many more free businesses may be saved today (Infinity = no limit). */
async function allowanceLeft(env: Env): Promise<{ left: number; limit: number; today: string; saved: number }> {
  const rows = await env.DB.prepare(`SELECT key, value FROM app_settings WHERE key IN ('free_daily_limit', 'free_saved_today')`).all<{ key: string; value: string }>();
  const v = Object.fromEntries(rows.results.map((r) => [r.key, r.value]));
  const limit = Number(v.free_daily_limit ?? 5000);
  const today = new Date().toISOString().slice(0, 10);
  const [day, count] = String(v.free_saved_today ?? "").split(":");
  const saved = day === today ? Number(count) || 0 : 0;
  return { left: limit > 0 ? Math.max(0, limit - saved) : Infinity, limit, today, saved };
}

export async function freeSavingStatus(env: Env) {
  const a = await allowanceLeft(env);
  const waiting = await env.DB.prepare(
    `SELECT COALESCE(SUM(rows - saved_rows), 0) AS n FROM free_import_chunks WHERE done = 0`,
  ).first<number>("n");
  return { limit: a.limit, savedToday: a.saved, leftToday: a.left === Infinity ? null : a.left, waiting: waiting ?? 0 };
}

/**
 * Saves the next slice of collected businesses. Returns whether more is waiting (the caller
 * queues another { free: true } message), and 'paused' when today's allowance is used up.
 */
export async function freeSaveStep(env: FreeEnv): Promise<{ saved: number; more: boolean; paused: boolean }> {
  if (!env.BACKUPS) return { saved: 0, more: false, paused: false };
  // Only one step saves at a time (the cron and each step's follow-up could otherwise overlap);
  // a step that finds the lease taken just ends, and the holder's chain carries on.
  const lease = await claimSaveLease(env);
  if (!lease) return { saved: 0, more: false, paused: false };
  try {
    return await saveStep(env);
  } finally {
    await releaseSaveLease(env, lease);
  }
}

async function saveStep(env: FreeEnv): Promise<{ saved: number; more: boolean; paused: boolean }> {
  const allowance = await allowanceLeft(env);
  const chunk = await env.DB.prepare(
    `SELECT c.import_id, c.n, c.search_id, c.rows, c.r2_key, c.saved_rows, s.category, s.city, s.state, s.country_code,
            s.cancelled_at, s.check_phones, s.status
     FROM free_import_chunks c JOIN searches s ON s.id = c.search_id
     WHERE c.done = 0 ORDER BY c.import_id, c.n LIMIT 1`,
  ).first<{ import_id: string; n: number; search_id: string; rows: number; r2_key: string; saved_rows: number; category: string;
    city: string; state: string | null; country_code: string | null; cancelled_at: string | null; check_phones: number; status: string }>();
  if (!chunk) return { saved: 0, more: false, paused: false };

  // Stopped (or failed) searches: skip their batches.
  if (chunk.cancelled_at || chunk.status === "failed") {
    await env.DB.prepare(`UPDATE free_import_chunks SET done = 1 WHERE import_id = ? AND search_id = ?`).bind(chunk.import_id, chunk.search_id).run();
    await finishSearchIfSaved(env, chunk.search_id);
    return { saved: 0, more: true, paused: false };
  }
  if (allowance.left <= 0) {
    await markPaused(env, allowance.limit);
    return { saved: 0, more: false, paused: true };
  }

  // A batch that can't be read (missing from storage, damaged file) is tried again on the next
  // minutes, then skipped with a note, so it never holds up the batches after it.
  const chunkId = `${chunk.import_id}:${chunk.n}`;
  let lines: string[];
  try {
    lines = await readChunkLines(env, chunk.r2_key);
  } catch (err) {
    const fails = await chunkFailures(env, chunkId, "add");
    if (fails < MAX_CHUNK_FAILURES) return { saved: 0, more: false, paused: false }; // the minute cron retries
    await chunkFailures(env, chunkId, "clear");
    const message = `${Math.max(0, chunk.rows - chunk.saved_rows).toLocaleString("en-US")} collected businesses couldn’t be read and were skipped (${err instanceof Error ? err.message : String(err)}).`;
    await env.DB.batch([
      env.DB.prepare(`UPDATE free_import_chunks SET done = 1 WHERE import_id = ? AND n = ?`).bind(chunk.import_id, chunk.n),
      env.DB.prepare(`UPDATE searches SET error = ? WHERE id = ?`).bind(message.slice(0, 500), chunk.search_id),
    ]);
    await notify(env, { kind: "free_failed", level: "warn", message: `Free collection: ${message}`, dedupeKey: `free-chunk-${chunkId}` });
    await finishSearchIfSaved(env, chunk.search_id);
    return { saved: 0, more: true, paused: false };
  }
  const take = Math.max(0, Math.min(SAVE_ROWS_PER_STEP, allowance.left, lines.length - chunk.saved_rows));
  const slice = parseLines(lines.slice(chunk.saved_rows, chunk.saved_rows + take)).map(overtureToLead);
  const now = new Date();
  const ctx = {
    searchId: chunk.search_id, category: chunk.category, industry: industryOf(chunk.category),
    leadDate: formatLeadDate(now, env.LEAD_TIMEZONE), leadDateTime: formatLeadDateTime(now, env.LEAD_TIMEZONE),
    sourceCode: env.SOURCE_CODE_DEFAULT,
  };
  let linked = 0;
  for (let i = 0; i < slice.length; i += DB_BATCH) linked += await saveBatch(env, slice.slice(i, i + DB_BATCH), ctx);

  // Progress is counted in lines read (damaged lines are passed over too).
  const savedRows = chunk.saved_rows + take;
  await env.DB.batch([
    env.DB.prepare(`UPDATE free_import_chunks SET saved_rows = ?, done = ? WHERE import_id = ? AND n = ?`)
      .bind(savedRows, chunkFinished(savedRows, lines.length) ? 1 : 0, chunk.import_id, chunk.n),
    env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES ('free_saved_today', ?, datetime('now'))
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .bind(`${allowance.today}:${allowance.saved + slice.length}`),
    // Only the businesses newly linked in this step are added (no recount of the whole search).
    env.DB.prepare(`UPDATE searches SET leads_saved = leads_saved + ?, updated_at = datetime('now'),
                      error = CASE WHEN error LIKE 'Paused%' THEN NULL ELSE error END WHERE id = ?`)
      .bind(linked, chunk.search_id),
  ]);
  if (chunk.check_phones) await queuePhonesForSearches(env, [chunk.search_id]);
  await finishSearchIfSaved(env, chunk.search_id);
  return { saved: slice.length, more: true, paused: false };
}

async function markPaused(env: Env, limit: number) {
  await env.DB.prepare(
    `UPDATE searches SET error = ? WHERE source = 'free' AND status = 'ingesting' AND COALESCE(error, '') NOT LIKE 'Paused%'`,
  )
    .bind(`Paused: waiting for tomorrow’s free allowance (up to ${limit.toLocaleString("en-US")} free businesses are saved a day). It carries on by itself.`)
    .run();
}

/** A search is finished once the collector has said it's done and none of its batches are left. */
export function searchFinished(s: { status: string; leftChunks: number; importStatus: string | null }): boolean {
  return s.leftChunks === 0 && s.importStatus === "received" && (s.status === "ingesting" || s.status === "scraping");
}

async function finishSearchIfSaved(env: Env, searchId: string) {
  const s = await env.DB.prepare(
    `SELECT s.status, s.free_import_id,
            (SELECT COUNT(*) FROM free_import_chunks c WHERE c.import_id = s.free_import_id AND c.search_id = s.id AND c.done = 0) AS left_chunks,
            (SELECT status FROM free_imports i WHERE i.id = s.free_import_id) AS import_status
     FROM searches s WHERE s.id = ?`,
  )
    .bind(searchId)
    .first<{ status: string; free_import_id: string; left_chunks: number; import_status: string | null }>();
  if (!s || !searchFinished({ status: s.status, leftChunks: s.left_chunks, importStatus: s.import_status })) return;
  const r = await env.DB.prepare(
    `UPDATE searches SET status = 'done', finished_at = datetime('now'),
       error = CASE WHEN cancelled_at IS NOT NULL THEN 'Stopped early; kept the ' || leads_saved || ' businesses it had saved.'
                    WHEN error LIKE 'Paused%' THEN NULL ELSE error END
     WHERE id = ? AND status IN ('ingesting', 'scraping')`,
  )
    .bind(searchId)
    .run();
  if (r.meta.changes) await finishImportIfDone(env, s.free_import_id);
}

/** Marks a received collection done once none of its searches are open, and removes its parked batches. */
async function finishImportIfDone(env: Env, importId: string) {
  const open = await env.DB.prepare(
    `SELECT 1 AS x FROM searches WHERE status IN ('pending', 'scraping', 'ingesting') AND free_import_id = ? LIMIT 1`,
  )
    .bind(importId)
    .first();
  if (open) return;
  const r = await env.DB.prepare(`UPDATE free_imports SET status = 'done', finished_at = datetime('now') WHERE id = ? AND status = 'received'`)
    .bind(importId).run();
  if (!r.meta.changes) return;
  // Parked batches aren't needed any more.
  const { results } = await env.DB.prepare(`SELECT r2_key FROM free_import_chunks WHERE import_id = ?`).bind(importId).all<{ r2_key: string }>();
  const bucket = (env as FreeEnv).BACKUPS;
  for (let i = 0; i < results.length; i += 1000) {
    await bucket?.delete(results.slice(i, i + 1000).map((x) => x.r2_key)).catch(() => undefined);
  }
}

/**
 * Minute job: finishes free searches (and their collections) that are fully saved but were
 * left open, e.g. every batch was saved before the collector said it was done.
 */
export async function freeFinishSweep(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT s.id FROM searches s
     WHERE s.status = 'ingesting' AND s.source = 'free'
       AND NOT EXISTS (SELECT 1 FROM free_import_chunks c WHERE c.import_id = s.free_import_id AND c.search_id = s.id AND c.done = 0)
       AND (SELECT status FROM free_imports i WHERE i.id = s.free_import_id) = 'received'
     LIMIT 20`,
  ).all<{ id: string }>();
  for (const { id } of results) await finishSearchIfSaved(env, id);
  // Collections whose searches all finished some other way (e.g. none had any businesses).
  if (new Date().getUTCMinutes() % 10 === 0) {
    const { results: imports } = await env.DB.prepare(`SELECT id FROM free_imports WHERE status = 'received' LIMIT 20`).all<{ id: string }>();
    for (const { id } of imports) await finishImportIfDone(env, id);
  }
}

export interface KnownLead { id: string; google_place_id: string; phone: string | null; domain: string | null; city: string }

const cityKey = (c: string | null | undefined) => (c ?? "").trim().toLowerCase();

/**
 * A business we already have: same Overture id, or the same phone or website in the same city.
 * Toll-free numbers are shared by a chain's locations, so they never count as a match.
 */
export function findKnown(known: KnownLead[], l: Pick<FreeLead, "googlePlaceId" | "phone" | "domain" | "city">): KnownLead | undefined {
  const city = cityKey(l.city);
  return known.find((k) => k.google_place_id === l.googlePlaceId)
    ?? (l.phone && !isTollFree(l.phone) ? known.find((k) => k.phone === l.phone && cityKey(k.city) === city) : undefined)
    ?? (l.domain ? known.find((k) => k.domain === l.domain && cityKey(k.city) === city) : undefined);
}

/** Saves up to 50 free businesses: links the ones we already have, inserts the rest. Returns how many were newly linked to the search. */
async function saveBatch(
  env: Env,
  leads: FreeLead[],
  ctx: { searchId: string; category: string; industry: string | null; leadDate: string; leadDateTime: string; sourceCode: string },
): Promise<number> {
  if (!leads.length) return 0;
  const ids = leads.map((l) => sql(l.googlePlaceId));
  const phones = leads.map((l) => l.phone).filter((p): p is string => !!p && !isTollFree(p)).map(sql);
  const domains = leads.map((l) => l.domain).filter((d): d is string => !!d).map(sql);
  const { results: known } = await env.DB.prepare(
    `SELECT id, google_place_id, gbp_phone_formatted AS phone, website_domain AS domain, lower(trim(COALESCE(city, ''))) AS city FROM leads
     WHERE google_place_id IN (${ids.join(", ")})
        ${phones.length ? `OR gbp_phone_formatted IN (${phones.join(", ")})` : ""}
        ${domains.length ? `OR website_domain IN (${domains.join(", ")})` : ""}`,
  ).all<KnownLead>();

  const statements: D1PreparedStatement[] = [];
  const linkAt: number[] = [];
  const linked = new Set<string>();
  const gained: string[] = []; // businesses we already had that get a phone or website from this data
  for (const l of leads) {
    const match = findKnown(known, l);
    let leadId: string;
    if (match) {
      leadId = match.id;
      if ((!match.phone && l.phone) || (!match.domain && l.domain)) gained.push(leadId);
      // Fill gaps only; Google data (when present) is never overwritten.
      statements.push(env.DB.prepare(
        `UPDATE leads SET website = COALESCE(website, ?), website_domain = COALESCE(website_domain, ?),
           gbp_phone_raw = COALESCE(gbp_phone_raw, ?), gbp_phone_formatted = COALESCE(gbp_phone_formatted, ?),
           socials = COALESCE(socials, ?), postal_code = COALESCE(postal_code, ?) WHERE id = ?`,
      ).bind(l.website, l.domain, l.phoneRaw, l.phone, l.socials, l.postcode, leadId));
    } else {
      leadId = crypto.randomUUID();
      known.push({ id: leadId, google_place_id: l.googlePlaceId, phone: l.phone, domain: l.domain, city: cityKey(l.city) });
      statements.push(env.DB.prepare(
        `INSERT INTO leads (id, search_id, google_place_id, business_name, gbp_category, lead_category, sub_category,
           gbp_phone_raw, gbp_phone_formatted, phone_type, website, website_domain, address, city, state, postal_code, country,
           latitude, longitude, is_claimed, permanently_closed, temporarily_closed, business_status, has_street_address,
           industry, socials, source_code, lead_date, lead_datetime, raw, data_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'free')`,
      ).bind(
        leadId, ctx.searchId, l.googlePlaceId, l.name, ctx.category, ctx.category, l.subCategory,
        l.phoneRaw, l.phone, isTollFree(l.phone) ? "toll_free" : null, l.website, l.domain,
        [l.street, l.city, [l.state, l.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
        l.city, l.state, l.postcode, l.country, l.lat, l.lng,
        l.status === "permanently_closed" ? 1 : 0, l.status === "temporarily_closed" ? 1 : 0, l.status, l.street ? 1 : 0,
        ctx.industry, l.socials, ctx.sourceCode, ctx.leadDate, ctx.leadDateTime, l.raw,
      ));
      l.emails.forEach((email, position) =>
        statements.push(env.DB.prepare(`INSERT OR IGNORE INTO lead_emails (lead_id, email, position) VALUES (?, ?, ?)`).bind(leadId, email, position)));
    }
    if (!linked.has(leadId)) {
      linked.add(leadId);
      linkAt.push(statements.length);
      statements.push(env.DB.prepare(`INSERT OR IGNORE INTO search_leads (search_id, lead_id, rank) VALUES (?, ?, NULL)`).bind(ctx.searchId, leadId));
    }
  }
  // Count the links that were actually new (a business already in this search changes nothing).
  const links = new Set(linkAt);
  let added = 0;
  for (let i = 0; i < statements.length; i += 90) {
    const res = await env.DB.batch(statements.slice(i, i + 90));
    res.forEach((r, j) => { if (links.has(i + j)) added += r.meta?.changes ?? 0; });
  }
  // A new phone or website may be on the do-not-contact list.
  if (gained.length) await applyToLeads(env, gained);
  return added;
}

/** Collections stuck waiting (the collector never ran or died): fail them so nobody waits forever. */
export async function freeWatchdog(env: FreeEnv) {
  const { results } = await env.DB.prepare(
    `SELECT id FROM free_imports WHERE status IN ('queued', 'claimed', 'collecting') AND COALESCE(dispatched_at, created_at) < datetime('now', ?)`,
  )
    .bind(`-${STALE_IMPORT_HOURS} hours`)
    .all<{ id: string }>();
  for (const { id } of results) {
    await collectorFailed(env, id, `nothing came back within ${STALE_IMPORT_HOURS} hours. Press Search and collect again.`);
  }
  // Work is waiting but the collector hasn't checked in for over an hour: GitHub may have
  // switched the scheduled workflow off (it does that after 60 days without repository changes).
  const waiting = await env.DB.prepare(`SELECT 1 AS x FROM free_imports WHERE status = 'queued' AND created_at < datetime('now', '-60 minutes') LIMIT 1`).first();
  if (waiting) {
    const seen = await env.DB.prepare(`SELECT value FROM app_settings WHERE key = 'collector_seen_at'`).first<string>("value");
    if (!seen || seen < new Date(Date.now() - 3_600_000).toISOString().slice(0, 19).replace("T", " ")) {
      await notify(env, {
        kind: "free_collector", level: "warn",
        message: "The free collector hasn’t checked in for over an hour, so free collections are waiting. On GitHub, open the repository’s Actions tab and make sure the “Free collector” workflow is enabled.",
        dedupeKey: `free-collector-quiet-${new Date().toISOString().slice(0, 10)}`,
      });
    }
  }
}

export async function freeWaiting(env: Env): Promise<boolean> {
  return !!(await env.DB.prepare(`SELECT 1 AS x FROM free_import_chunks WHERE done = 0 LIMIT 1`).first());
}

/**
 * Whether the minute cron should start a saving chain: batches are waiting, today's allowance
 * isn't used up, and no step holds the lease (a running chain queues its own next step).
 */
export async function freeSaveDue(env: Env): Promise<boolean> {
  if (!(await freeWaiting(env))) return false;
  const live = await env.DB.prepare(`SELECT 1 AS x FROM app_settings WHERE key = ? AND value >= datetime('now')`).bind(SAVE_LEASE_KEY).first();
  if (live) return false;
  return (await allowanceLeft(env)).left > 0;
}
