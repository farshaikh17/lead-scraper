// Daily free collection ("keep building the database for free").
// An admin keeps a list of type x place; when switched on, the minute job starts the next
// batch of the list whenever the previous one has been saved, so about `harvest_daily_target`
// new businesses arrive a day (that number is also the free daily saving limit). Each item is
// collected again after REVISIT_DAYS.

import { overtureCategories, startFreeCollection } from "./free";
import type { ResolvedPlace } from "./find";
import { notify } from "./ops";

const REVISIT_DAYS = 30;
const ITEMS_PER_BATCH = 6;
/** Don't start batches more often than this (the collector needs time; saving is capped per day anyway). */
const MIN_HOURS_BETWEEN_BATCHES = 2;

export interface HarvestSettings { enabled: boolean; target: number }

async function settings(env: Env): Promise<HarvestSettings & { lastStart: string }> {
  const { results } = await env.DB.prepare(`SELECT key, value FROM app_settings WHERE key IN ('harvest_enabled', 'harvest_daily_target', 'harvest_last_start')`)
    .all<{ key: string; value: string }>();
  const v = Object.fromEntries(results.map((r) => [r.key, r.value]));
  return { enabled: v.harvest_enabled === "1", target: Number(v.harvest_daily_target) || 4000, lastStart: v.harvest_last_start ?? "" };
}

export async function setHarvestSettings(env: Env, s: HarvestSettings) {
  if (!Number.isInteger(s.target) || s.target < 100 || s.target > 50000) throw new Error("Pick between 100 and 50,000 businesses a day.");
  const up = (k: string, v: string) => env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).bind(k, v);
  // The target is also the free daily saving limit, so one number controls the pace.
  await env.DB.batch([up("harvest_enabled", s.enabled ? "1" : "0"), up("harvest_daily_target", String(s.target)), up("free_daily_limit", String(s.target))]);
}

export async function addToHarvest(env: Env, items: { category: string; place: ResolvedPlace }[], addedBy: string | null) {
  let added = 0;
  const skipped: string[] = [];
  for (const it of items) {
    const label = `${it.category} in ${it.place.label}`;
    if (!overtureCategories(it.category).length) { skipped.push(label); continue; }
    const r = await env.DB.prepare(`INSERT OR IGNORE INTO free_harvest (id, category, place, label, added_by) VALUES (?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), it.category, JSON.stringify(it.place), label, addedBy)
      .run();
    added += r.meta.changes ?? 0;
  }
  return { added, alreadyListed: items.length - added - skipped.length, notInFreeData: skipped };
}

export async function removeFromHarvest(env: Env, id: string) {
  await env.DB.prepare(`DELETE FROM free_harvest WHERE id = ?`).bind(id).run();
}

export async function listHarvest(env: Env) {
  const s = await settings(env);
  const { results } = await env.DB.prepare(
    `SELECT h.id, h.label, h.added_at, h.last_collected_at,
            (SELECT status FROM free_imports i WHERE i.id = h.last_import_id) AS last_status
     FROM free_harvest h ORDER BY h.last_collected_at IS NOT NULL, h.last_collected_at, h.added_at`,
  ).all();
  const due = await dueCount(env);
  return { enabled: s.enabled, target: s.target, items: results, due, revisitDays: REVISIT_DAYS };
}

async function dueCount(env: Env): Promise<number> {
  return (await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM free_harvest WHERE last_collected_at IS NULL OR last_collected_at < datetime('now', ?)`,
  ).bind(`-${REVISIT_DAYS} days`).first<number>("n")) ?? 0;
}

/** Minute job: start the next batch when switched on and the previous batch is saved. */
export async function harvestTick(env: Env): Promise<{ started: number } | null> {
  const s = await settings(env);
  if (!s.enabled) return null;
  if (s.lastStart && Date.parse(s.lastStart.replace(" ", "T") + "Z") > Date.now() - MIN_HOURS_BETWEEN_BATCHES * 3_600_000) return null;
  // Wait while a collection is in progress or saved businesses are still waiting.
  const busy = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM free_imports WHERE status IN ('queued', 'claimed', 'collecting')) AS running,
            (SELECT COALESCE(SUM(rows - saved_rows), 0) FROM free_import_chunks WHERE done = 0) AS waiting`,
  ).first<{ running: number; waiting: number }>();
  if ((busy?.running ?? 0) > 0 || (busy?.waiting ?? 0) >= s.target) return null;
  const { results } = await env.DB.prepare(
    `SELECT id, category, place FROM free_harvest
     WHERE last_collected_at IS NULL OR last_collected_at < datetime('now', ?)
     ORDER BY last_collected_at IS NOT NULL, last_collected_at, added_at LIMIT ?`,
  ).bind(`-${REVISIT_DAYS} days`, ITEMS_PER_BATCH).all<{ id: string; category: string; place: string }>();
  const stamp = await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('harvest_last_start', datetime('now'), datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  if (!results.length) {
    await stamp.run();
    const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM free_harvest`).first<number>("n");
    await notify(env, {
      kind: "harvest", level: "info",
      message: total
        ? `The daily free collection has covered everything on its list (it revisits each item after ${REVISIT_DAYS} days). Add more types or places to keep growing.`
        : "The daily free collection is switched on, but its list is empty. Add types and places from a free search.",
      dedupeKey: `harvest-idle-${new Date().toISOString().slice(0, 10)}`,
    });
    return { started: 0 };
  }
  // Claim this start in one step: minute jobs can overlap (a slow run, e.g. the midnight backup,
  // is still going when the next minute starts), and both would otherwise start the same batch.
  await env.DB.prepare(`INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('harvest_last_start', '', datetime('now'))`).run();
  const claim = await env.DB.prepare(
    `UPDATE app_settings SET value = datetime('now'), updated_at = datetime('now')
     WHERE key = 'harvest_last_start' AND (value IS NULL OR value = '' OR value < datetime('now', ?))`,
  ).bind(`-${MIN_HOURS_BETWEEN_BATCHES} hours`).run();
  if (!claim.meta.changes) return null;
  const items = results.map((r) => ({ category: r.category, place: JSON.parse(r.place) as ResolvedPlace }));
  const r = await startFreeCollection(env, items, { checkPhones: false, createdBy: null });
  await env.DB.batch([
    stamp,
    // The list has work again: earlier "covered everything" notices no longer hold.
    env.DB.prepare(`UPDATE notifications SET dismissed_at = datetime('now') WHERE kind = 'harvest' AND dismissed_at IS NULL`),
    ...results.map((it) => env.DB.prepare(`UPDATE free_harvest SET last_import_id = ?, last_collected_at = datetime('now') WHERE id = ?`).bind(r.importId, it.id)),
  ]);
  return { started: results.length };
}
