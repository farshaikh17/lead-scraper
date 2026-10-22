// Nightly backup of the database to R2 (Cloudflare file storage), a copy kept outside
// the database itself. Runs from the cron in small steps: each call writes at most one file
// (a few hundred rows), because the Workers free plan allows 10 ms of work per run. The
// position is kept in the backups row, so the next call carries on from there:
//   backups/<date>/<table>/<part>.ndjson.gz   and   backups/<date>/manifest.json
// To restore, the super admin downloads a backup as one .sql file (backupAsSql below).
//
// Needs the BACKUPS R2 binding (see wrangler.jsonc). Without it, backups are skipped.

import { notify } from "./ops";

/** Tables copied, in restore order (a table comes after the ones it points to). Left out:
 *  sessions, sign-in counters and form_hits (short-lived), count_cache (re-fetchable), geo_*
 *  (seeded by migrations), lead_attributes (rebuilt from each lead's saved listing, POST
 *  /api/admin/backfill), work queues (free_import_chunks, google_detail_items, webhook_outbox,
 *  ghl_*) and the backups list itself. */
export const BACKUP_TABLES = [
  "users", "app_settings", "api_keys", "webhooks", "saved_searches", "free_harvest", "free_imports", "searches",
  "leads", "search_leads", "lead_emails", "lead_phones", "website_audits", "lead_notes", "lead_events",
  "email_checks", "suppressions", "spend_log", "audit_log", "notifications",
] as const;

/** Nightly copies kept; older ones are deleted. */
export const KEEP_BACKUPS = 14;
/** Start after this hour (UTC): 07:00 UTC = 3 am New York, when nobody is pulling. */
const START_HOUR_UTC = 7;
/** Rows per file (= per step). Businesses carry their saved listing, so they go in smaller files. */
const ROWS_PER_FILE: Record<string, number> = { leads: 100, website_audits: 250, audit_log: 250, searches: 250 };
export const rowsPerFile = (table: string) => ROWS_PER_FILE[table] ?? 500;
/** A step that keeps dying at the same place (e.g. cut off by the time limit) fails the backup. Six, not three:
 * a slow, busy database can stop a step a few times without anything being wrong. */
const MAX_STEP_TRIES = 6;
/** A backup still 'running' after this long is given up, so the next night's can start. */
const STALE_HOURS = 20;
/** Columns the database computes itself (can't be inserted on restore). */
const COMPUTED_COLUMNS: Record<string, string[]> = { searches: ["cost_estimate"] };

/**
 * Tries of the step at this position, kept in the (otherwise empty) error while running:
 * "Copying leads from row 1200 (try 2)". A different position starts again at 1.
 */
export function stepTries(error: string | null, table: string, lastRowid: number): number {
  const m = /^Copying (\w+) from row (\d+) \(try (\d+)\)$/.exec(error ?? "");
  return m && m[1] === table && Number(m[2]) === lastRowid ? Number(m[3]) : 0;
}
const triesText = (table: string, lastRowid: number, n: number) => `Copying ${table} from row ${lastRowid} (try ${n})`;

interface BackupRow {
  id: string;
  status: string;
  table_index: number;
  last_rowid: number;
  part: number;
  rows_copied: number;
  bytes: number;
  started_at: string;
  error: string | null;
}

type BackupEnv = Env & { BACKUPS?: R2Bucket };

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Starts tonight's backup if it's due, or continues a running one by one step (at most one
 * file). Called every cron minute (and by "Back up now").
 */
export async function backupStep(env: BackupEnv, now = new Date(), force = false): Promise<BackupRow | null> {
  const bucket = env.BACKUPS;
  if (!bucket || String(env.BACKUPS_ENABLED) !== "1") return null;

  const running = await env.DB.prepare(`SELECT * FROM backups WHERE status = 'running' ORDER BY started_at LIMIT 1`).first<BackupRow>();
  if (running && Date.parse(running.started_at.replace(" ", "T") + "Z") < now.getTime() - STALE_HOURS * 3_600_000) {
    // Never finished (stopped for a long time): give it up so tonight's can run.
    return fail(env, running, `It didn't finish within ${STALE_HOURS} hours.`);
  }
  let backup: BackupRow;
  if (running) backup = running;
  else {
    const today = now.toISOString().slice(0, 10);
    if (!force && now.getUTCHours() < START_HOUR_UTC) return null;
    const id = force ? `${today}-manual-${now.toISOString().slice(11, 16).replace(":", "")}` : today;
    const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO backups (id) VALUES (?)`).bind(id).run();
    if (inserted.meta.changes === 0) return null; // tonight's is already done (or another run just started it)
    backup = (await env.DB.prepare(`SELECT * FROM backups WHERE id = ?`).bind(id).first<BackupRow>())!;
  }

  try {
    // Empty tables cost nothing, so the step moves past them to the next file to write.
    while (backup.table_index < BACKUP_TABLES.length) {
      const table: string = BACKUP_TABLES[backup.table_index];
      const limit = rowsPerFile(table);
      // Counted before the work: a step that is cut off (time limit) never reaches the catch below.
      const tries = stepTries(backup.error, table, backup.last_rowid) + 1;
      if (tries > MAX_STEP_TRIES) throw new Error(`Copying ${table} keeps stopping at row ${backup.last_rowid}.`);
      await env.DB.prepare(`UPDATE backups SET error = ? WHERE id = ?`).bind(triesText(table, backup.last_rowid, tries), backup.id).run();

      const { results }: D1Result<Record<string, unknown> & { __rowid: number }> = await env.DB.prepare(`SELECT rowid AS __rowid, * FROM ${table} WHERE rowid > ? ORDER BY rowid LIMIT ?`)
        .bind(backup.last_rowid, limit)
        .all<Record<string, unknown> & { __rowid: number }>();
      let bytes = 0;
      if (results.length) {
        const skip = COMPUTED_COLUMNS[table] ?? [];
        const body = await gzip(results.map(({ __rowid: _, ...row }: Record<string, unknown>) => {
          for (const c of skip) delete row[c];
          return JSON.stringify(row);
        }).join("\n") + "\n");
        bytes = body.byteLength;
        const key = `backups/${backup.id}/${table}/${String(backup.part).padStart(5, "0")}.ndjson.gz`;
        await bucket.put(key, body, { httpMetadata: { contentType: "application/x-ndjson", contentEncoding: "gzip" } });
      }
      const nextTable: boolean = results.length < limit;
      const next: BackupRow = {
        ...backup,
        table_index: nextTable ? backup.table_index + 1 : backup.table_index,
        last_rowid: nextTable ? 0 : results[results.length - 1].__rowid,
        part: results.length ? backup.part + 1 : backup.part,
        rows_copied: backup.rows_copied + results.length,
        bytes: backup.bytes + bytes,
        error: null,
      };
      // Only from where this step started (two overlapping calls can't count a file twice).
      const moved = await env.DB.prepare(
        `UPDATE backups SET table_index = ?, last_rowid = ?, part = ?, rows_copied = ?, bytes = ?, error = NULL
         WHERE id = ? AND status = 'running' AND table_index = ? AND last_rowid = ?`,
      )
        .bind(next.table_index, next.last_rowid, next.part, next.rows_copied, next.bytes, backup.id, backup.table_index, backup.last_rowid)
        .run();
      if (moved.meta.changes === 0) return backup; // another call got there first
      backup = next;
      if (results.length) break; // one file per call
    }

    if (backup.table_index >= BACKUP_TABLES.length) {
      await bucket.put(
        `backups/${backup.id}/manifest.json`,
        JSON.stringify({ id: backup.id, tables: BACKUP_TABLES, rows: backup.rows_copied, bytes: backup.bytes, finishedAt: new Date().toISOString() }),
        { httpMetadata: { contentType: "application/json" } },
      );
      await env.DB.prepare(`UPDATE backups SET status = 'done', error = NULL, finished_at = datetime('now') WHERE id = ?`).bind(backup.id).run();
      await pruneOldBackups(env, bucket);
      backup.status = "done";
    }
  } catch (err) {
    return fail(env, backup, err instanceof Error ? err.message : String(err));
  }
  return backup;
}

async function fail(env: Env, backup: BackupRow, message: string): Promise<BackupRow> {
  console.error(`backup ${backup.id} failed:`, message);
  await env.DB.prepare(`UPDATE backups SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?`)
    .bind(message.slice(0, 1000), backup.id)
    .run();
  await notify(env, {
    kind: "backup_failed",
    level: "error",
    message: `Last night's backup failed: ${message.slice(0, 200)}. It will try again tomorrow night, or use "Back up now".`,
    dedupeKey: `backup-failed-${backup.id}`,
  });
  return { ...backup, status: "failed", error: message };
}

/** Keeps the newest KEEP_BACKUPS finished copies; deletes older files and failed attempts. */
async function pruneOldBackups(env: Env, bucket: R2Bucket): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id FROM backups WHERE status IN ('done', 'failed') ORDER BY started_at DESC LIMIT -1 OFFSET ?`,
  )
    .bind(KEEP_BACKUPS)
    .all<{ id: string }>();
  for (const { id } of results) {
    let cursor: string | undefined;
    do {
      const listed = await bucket.list({ prefix: `backups/${id}/`, cursor });
      if (listed.objects.length) await bucket.delete(listed.objects.map((o) => o.key));
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
    await env.DB.prepare(`DELETE FROM backups WHERE id = ?`).bind(id).run();
  }
}

export async function listBackups(env: BackupEnv) {
  const { results } = await env.DB.prepare(
    `SELECT id, status, started_at, finished_at, rows_copied, bytes, error FROM backups ORDER BY started_at DESC LIMIT 30`,
  ).all();
  const lastGood = (results as { status: string; finished_at: string | null }[]).find((b) => b.status === "done") ?? null;
  return {
    enabled: !!env.BACKUPS && String(env.BACKUPS_ENABLED) === "1", paused: !!env.BACKUPS && String(env.BACKUPS_ENABLED) !== "1",
    // Storage connected (a backup can be downloaded), and when the newest finished one ended.
    storage: !!env.BACKUPS, lastGoodAt: lastGood?.finished_at ?? null, keep: KEEP_BACKUPS, backups: results,
  };
}

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replace(/'/g, "''")}'`;
}

/**
 * One backup as a single SQL file, for restoring with
 *   npx wrangler d1 execute lead-scraper-db --remote --file <file>.sql
 * Rows are INSERT OR REPLACE, so it restores over a partly damaged database too.
 */
export async function backupAsSql(env: BackupEnv, id: string): Promise<ReadableStream<Uint8Array> | null> {
  const bucket = env.BACKUPS;
  if (!bucket || !(await bucket.head(`backups/${id}/manifest.json`))) return null;
  const encoder = new TextEncoder();
  const tables = [...BACKUP_TABLES];
  let tableIndex = 0;
  let files: string[] | null = null;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`-- Lead Finder backup ${id}\nPRAGMA defer_foreign_keys = true;\n`));
    },
    async pull(controller) {
      try {
        while (tableIndex < tables.length) {
          const table = tables[tableIndex];
          if (!files) {
            files = [];
            let cursor: string | undefined;
            do {
              const listed = await bucket.list({ prefix: `backups/${id}/${table}/`, cursor });
              files.push(...listed.objects.map((o) => o.key));
              cursor = listed.truncated ? listed.cursor : undefined;
            } while (cursor);
            files.sort();
          }
          const key = files.shift();
          if (!key) {
            files = null;
            tableIndex++;
            continue;
          }
          const object = await bucket.get(key);
          if (!object) continue;
          const text = await new Response(object.body.pipeThrough(new DecompressionStream("gzip"))).text();
          const lines = text.split("\n").filter(Boolean).map((line) => {
            const row = JSON.parse(line) as Record<string, unknown>;
            const cols = Object.keys(row).filter((c) => !(COMPUTED_COLUMNS[table] ?? []).includes(c));
            return `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => sqlValue(row[c])).join(", ")});`;
          });
          controller.enqueue(encoder.encode(lines.join("\n") + "\n"));
          return;
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
