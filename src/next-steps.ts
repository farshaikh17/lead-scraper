// "What to do next": a short, plain-language to-do list at the top of Find leads, Database and
// Overview. A few cheap counts (the heavy ones kept for 10 minutes) turned into at most five steps,
// each with one button that does the whole job. Members see their own work; admins also see the
// team's (handing out new businesses, paid Google ratings).

import type { User } from "./auth";
import { cached } from "./cache";
import { aiHelperStatus } from "./ai-helper";
import { monthSpend } from "./ops";

/** Google details cost per business (src/google-details.ts) and how many one run looks up. */
export const GOOGLE_DETAIL_COST = 0.005;
export const GOOGLE_DETAILS_PER_RUN = 500;
/** How many new businesses "Hand out" gives one person at a time (a person can't call thousands). */
export const HAND_OUT = 50;
/** "New" businesses: added in the last this many days. */
export const NEW_DAYS = 14;
/** Free-data businesses worth a Google rating: added in the last this many days. */
export const RECENT_DAYS = 30;

export type StepAction = "assign_new" | "show_mine" | "google_ratings" | "check_sites" | "ai_setup" | "ai_enable" | "find_more" | "none";

export interface NextStep {
  key: string;
  text: string;
  detail?: string;
  /** The button's words; null for a line that only informs. */
  button: string | null;
  action: StepAction;
  count: number;
  costUsd?: number;
}

export interface NextStepCounts {
  /** Untouched, nobody assigned, added in the last NEW_DAYS days (usual view). */
  unassignedNew: number;
  /** Assigned to this person and still Untouched (usual view). */
  myWaiting: number;
  /** Free data with no Google details yet, added in the last RECENT_DAYS days (usual view). */
  noGoogle: number;
  /** Real websites not checked or queued yet (the person's own for members). */
  sitesUnchecked: number;
  /** Dollars left of this month’s paid budget (admins; undefined = not looked up). */
  budgetLeft?: number;
  /** The AI helper: keyed = GEMINI_API_KEY is set; null status when it couldn't be read. */
  ai: { keyed: boolean; enabled?: boolean; doneToday?: number; waiting?: number; waitingMore?: boolean; problem?: string | null; pausedUntil?: string | null } | null;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const money = (n: number) => "$" + n.toFixed(2);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Turns the counts into the ordered steps (at most 5). Pure: no database, easy to test. */
export function planNextSteps(c: NextStepCounts, role: User["role"]): NextStep[] {
  const admin = role === "admin" || role === "super_admin";
  const steps: NextStep[] = [];
  if (admin && c.unassignedNew > 0) {
    steps.push({
      key: "assign_new", action: "assign_new", count: c.unassignedNew,
      button: c.unassignedNew > HAND_OUT ? "Hand out " + HAND_OUT : "Give them to someone",
      text: fmt(c.unassignedNew) + " new " + plural(c.unassignedNew, "business", "businesses") + " nobody is working yet",
      detail: "Added in the last " + NEW_DAYS + " days. " + (c.unassignedNew > HAND_OUT
        ? "Pick a team member and the newest " + HAND_OUT + " go to them. Do more any time."
        : "Pick a team member and they all go to them."),
    });
  }
  if (c.myWaiting > 0) {
    steps.push({
      key: "show_mine", action: "show_mine", count: c.myWaiting, button: "Show them",
      text: fmt(c.myWaiting) + " of your leads " + plural(c.myWaiting, "is", "are") + " waiting for a first call or email",
    });
  }
  // Paid: only offered while this month’s budget has room (a $0 budget pauses paid services).
  if (admin && c.noGoogle > 0 && (c.budgetLeft ?? Infinity) >= GOOGLE_DETAIL_COST) {
    const now = Math.min(c.noGoogle, GOOGLE_DETAILS_PER_RUN);
    const cost = Math.round(now * GOOGLE_DETAIL_COST * 100) / 100;
    steps.push({
      key: "google_ratings", action: "google_ratings", count: c.noGoogle, costUsd: cost, button: "Add Google ratings · about " + money(cost),
      text: fmt(c.noGoogle) + " " + plural(c.noGoogle, "business has", "businesses have") + " no Google rating yet",
      detail: "From the free data, added in the last " + RECENT_DAYS + " days. Adds rating, reviews and verified." +
        (c.noGoogle > GOOGLE_DETAILS_PER_RUN ? " The first " + fmt(GOOGLE_DETAILS_PER_RUN) + " now; the rest after." : "") + " You see the price first.",
    });
  }
  if (c.sitesUnchecked > 0) {
    steps.push({
      key: "check_sites", action: "check_sites", count: c.sitesUnchecked, button: "Check them (free)",
      text: fmt(c.sitesUnchecked) + " " + plural(c.sitesUnchecked, "website hasn’t", "websites haven’t") + " been checked yet",
      detail: "Finds booking, contact forms, ads, emails and owner names.",
    });
  }
  const actionable = steps.length > 0;
  if (c.ai) {
    if (!c.ai.keyed) {
      if (admin) steps.push({ key: "ai_setup", action: "ai_setup", count: 0, button: "Turn on the free AI helper",
        text: "The free AI helper isn’t on yet", detail: "It reads each business’s website and writes what they do, their services and an opener." });
    } else if (c.ai.enabled === false) {
      if (admin) steps.push({ key: "ai_enable", action: "ai_enable", count: 0, button: "Switch it on",
        text: "The free AI helper is switched off", detail: "It reads each business’s website and writes what they do, their services and an opener." });
    } else if (c.ai.problem) {
      steps.push({ key: "ai_problem", action: "none", count: 0, button: null, text: "AI helper: " + c.ai.problem });
    } else {
      const done = c.ai.doneToday || 0, waiting = c.ai.waiting || 0;
      if (done || waiting) steps.push({ key: "ai_status", action: "none", count: waiting, button: null,
        text: "AI helper is reading websites: " + fmt(done) + " done today, " + fmt(waiting) + (c.ai.waitingMore ? "+" : "") + " waiting" });
    }
  }
  if (!actionable) {
    steps.unshift({ key: "caught_up", action: "find_more", count: 0, button: "Find more businesses", text: "You’re all caught up",
      detail: "Nothing is waiting for you right now." });
  }
  return steps.slice(0, 5);
}

const USUAL = "suppressed IS NULL AND business_status = 'operational' AND COALESCE(is_claimed, 1) = 1";

/** The counts (heavy, team-wide ones kept for 10 minutes) and the steps for this person. */
export async function nextSteps(env: Env, user: Pick<User, "id" | "role">) {
  const admin = user.role === "admin" || user.role === "super_admin";
  const team = admin
    ? await cached(env, "next-steps:team", 600, async () => {
      const [a, b, s] = await env.DB.batch([
        env.DB.prepare(`SELECT COUNT(*) AS n FROM leads WHERE created_at > datetime('now', ?) AND assigned_to IS NULL AND COALESCE(lead_status, 'Untouched') = 'Untouched' AND ${USUAL}`).bind(`-${NEW_DAYS} days`),
        env.DB.prepare(`SELECT COUNT(*) AS n FROM leads WHERE created_at > datetime('now', ?) AND data_source = 'free' AND google_match IS NULL AND ${USUAL}`).bind(`-${RECENT_DAYS} days`),
        env.DB.prepare(`SELECT COUNT(*) AS n FROM leads WHERE website_domain IS NOT NULL AND website_audit_status IS NULL AND ${USUAL}`),
      ]);
      const n = (r: D1Result) => Number((r.results[0] as { n: number } | undefined)?.n ?? 0);
      return { unassignedNew: n(a), noGoogle: n(b), sitesUnchecked: n(s) };
    })
    : { unassignedNew: 0, noGoogle: 0, sitesUnchecked: 0 };
  // The person's own leads: small (indexed on assigned_to), always fresh.
  const mine = await env.DB.prepare(
    `SELECT SUM(COALESCE(lead_status, 'Untouched') = 'Untouched') AS waiting,
            SUM(website_domain IS NOT NULL AND website_audit_status IS NULL) AS sites
     FROM leads WHERE assigned_to = ? AND ${USUAL}`,
  ).bind(user.id).first<{ waiting: number | null; sites: number | null }>();
  // The helper itself says whether a key is set (it also counts the local practice mode).
  let ai: NextStepCounts["ai"] = { keyed: !!(env as Env & { GEMINI_API_KEY?: string }).GEMINI_API_KEY };
  try {
    const s = await aiHelperStatus(env);
    ai = { keyed: s.keySet, enabled: s.switchedOn, doneToday: s.doneToday, waiting: s.waiting, waitingMore: s.waitingMore, problem: s.problem, pausedUntil: s.pausedUntil };
  } catch { /* keep the key-only answer */ }
  const counts: NextStepCounts = {
    unassignedNew: team.unassignedNew,
    myWaiting: Number(mine?.waiting ?? 0),
    noGoogle: team.noGoogle,
    sitesUnchecked: admin ? team.sitesUnchecked : Number(mine?.sites ?? 0),
    ai,
    ...(admin ? { budgetLeft: await monthSpend(env).then((m) => m.left).catch(() => undefined) } : {}),
  };
  return {
    steps: planNextSteps(counts, user.role),
    // What each button's list is, so the page sets the same filters the counts used.
    newDays: NEW_DAYS, recentDays: RECENT_DAYS,
  };
}
