import { launchChecklist, saveLaunchSettings, storeRevenue } from "./store/launch";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import {
  allowSignInAttempt,
  recordFailedSignIn,
  AuthError,
  changeOwnPassword,
  clearSessionCookie,
  countUsers,
  createUser,
  emailHint,
  HIDDEN_EMAIL,
  listUsers,
  requireAdmin,
  requireSuperAdmin,
  requireUser,
  SESSION_COOKIE,
  setSessionCookie,
  signIn,
  signOut,
  updateUser,
  userForToken,
  type User,
} from "./auth";
import { dashboardHtml } from "./dashboard";
import { loginHtml } from "./login-page";
import { assertWithinBudget, audit, BudgetError, dailyChecks, dismissAllNotifications, dismissNotification, getBudget, listAudit, listNotifications, monthSpend, notify, retryRead, setBudget } from "./ops";
import { CSV_COLUMNS, exportCsv, exportFormat } from "./export";
import { DEFAULT_GHL_COLUMNS, GHL_SOURCES, loadGhlColumns, MAX_GHL_COLUMNS, MAX_GHL_NAME, saveGhlColumns } from "./ghl-columns";
import { findLeads, resolveRequest, type FindRequest } from "./find";
import { listCities, listCountries, listRegions } from "./geo";
import { US_STATES } from "./format";
import { buildLeadQuery, categoryTree, clearCountCaches, leadFacets, listLeads, listSearches, resolveFilters, sortOrder, sqlString } from "./leads";
import { backfillDerivedColumns, trimRawStep } from "./maintenance";
import { backupAsSql, backupStep, listBackups } from "./backup";
import { claimNextImport, requeueImport, collectorAuthorized, collectorChunk, collectorDone, collectorFailed, collectorSpec, collectorStarted, dispatchCollector, freeFinishSweep, freeSaveDue, freeSaveStep, freeSavingStatus, freeWatchdog } from "./free";
import { previewGoogleDetails, startGoogleDetails } from "./google-details";
import { addToHarvest, harvestTick, listHarvest, removeFromHarvest, setHarvestSettings } from "./harvest";
import { claimWebsites, nudgeChecker, queueNewWebsites, queueWebsiteChecks, saveWebsiteResults, setWebsiteCheckSettings, websiteCheckStatus, websitesWaiting, websiteWatchdog } from "./website-audit";
import { DEFAULT_WEIGHTS, loadWeights, saveWeights, scoreStep } from "./scoring";
import { pageSpeedStep } from "./pagespeed";
import { claimRegistry, registryStatus, registryWaiting, saveRegistryResults } from "./registry";
import { claimPpp, pppWaiting, savePppResults } from "./ppp";
import { addNote, deleteNote, leadDetail, leadStates, restoreLeadStates, teamList, updateLeads } from "./crm";
import { rowsFromCsv, saveUpload } from "./upload";
import { listEvents, logEvent, trackView } from "./events";
import { buildOpener, DEFAULT_TEMPLATES, loadTemplates, MERGE_FIELDS, saveTemplates } from "./openers";
import { demoLead, ensureDemoToken, renderDemo } from "./demo";
import { formKey, formPage, submitForm, thanksPage, type FormInput } from "./form";
import { overview } from "./overview";
import { refreshLocalAverages } from "./company-facts";
import { emailDomainStep, emailDomainsWaiting } from "./email-domains";
import { firstNameFrom } from "./emails";
import { aiSearch } from "./ai-search";
import { aiHelperDue, aiHelperRun, aiHelperStatus, aiHelperStep, releaseLater, setAiHelperSettings, type AiEnv } from "./ai-helper";
import { requestVerification, verifyStatus, verifyStep } from "./email-verify";
import { addSuppressions, listSuppressions, REASON_WORDS, removeSuppression, suppressLead, suppressStep } from "./suppress";
import { agencySettings, ensureReportToken, reportPage, saveAgencySettings, type AgencySettings } from "./report";
import { createApiKey, createWebhook, deleteWebhook, deliverWebhooks, emitEvent, emitFinishedSearches, listApiKeys, listWebhooks, revokeApiKey, WEBHOOK_EVENTS } from "./api-keys";
import { deleteSavedSearch, listSavedSearches, savedSearchAlerts, saveSearch, updateSavedSearch } from "./saved-searches";
import { checkPendingPhones, MAX_PHONE_REQUEST, phoneCheckPricing, phoneStatus, requestPhoneChecks } from "./phone";
import { changeStoreCredits, handleRemovalRequest, listRemovalRequests, listStoreAccounts, resetStorePassword, saveStoreSettings, setStoreAccountStatus, storeSettings, storeStats } from "./store/admin";
import {
  checkSearch,
  createSearch,
  getSearch,
  RepeatPullError,
  REPEAT_WINDOW_DAYS,
  syncActiveSearches,
  resumeSearch,
  cancelSearch,
  syncSearch,
  ValidationError,
  type SearchInput,
} from "./pipeline";

// Auth: team members sign in with email + password (src/auth.ts). Everything except the
// sign-in page and its API needs a signed-in user; user management needs an admin.

const app = new Hono<{ Bindings: Env; Variables: { user: User } }>();

app.onError((err, c) => {
  if (err instanceof AuthError) return c.json({ error: err.message }, err.status);
  if (err instanceof BudgetError) return c.json({ error: err.message, budget: true }, 409);
  if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
  if (err instanceof RepeatPullError) {
    return c.json({ error: err.message, repeat: true, windowDays: REPEAT_WINDOW_DAYS, previous: err.previous }, 409);
  }
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  // Cloudflare's free plan has a daily database allowance; say so plainly when it runs out.
  if (/exceeded.*(daily|free tier).*(limit|read|write)|daily .*limit/i.test(String((err as Error)?.message ?? err))) {
    const message = "The free daily database allowance is used up. Lead Finder works again after midnight UTC (8 pm New York). Nothing is lost.";
    if (!new URL(c.req.url).pathname.startsWith("/api/")) return c.html(`<!doctype html><meta charset="utf-8"><title>Lead Finder</title><p style="font:16px system-ui;margin:40px">${message}</p>`, 503);
    return c.json({ error: message, limit: true }, 503);
  }
  return c.json({ error: "Something went wrong on our side. Try again in a minute." }, 500);
});

// The pages are self-contained (inline script/style); only the map library comes from
// Cloudflare's CDN, and map tiles / logos are images. The app can't be embedded in another
// site, except the free-audit form (/f/...), which agencies put on their own website.
const strictHeaders = secureHeaders({
  xFrameOptions: "DENY",
  referrerPolicy: "same-origin",
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
    // Fonts (Fraunces + Inter) come from Google Fonts, the same as the customer store.
    styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
    fontSrc: ["https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    baseUri: ["'none'"],
    objectSrc: ["'none'"],
  },
});
const embeddableHeaders = secureHeaders({
  xFrameOptions: false,
  referrerPolicy: "strict-origin-when-cross-origin",
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:"],
    formAction: ["'self'"],
    frameAncestors: ["*"],
    baseUri: ["'none'"],
    objectSrc: ["'none'"],
  },
});
app.use("*", (c, next) => (new URL(c.req.url).pathname.startsWith("/f/") ? embeddableHeaders(c, next) : strictHeaders(c, next)));

// --- Sign-in (public) ---------------------------------------------------------

/** The request's filters; "assigned=me" becomes the signed-in user's id. */
function filterParams(c: { req: { url: string }; get: (key: "user") => { id: string } }): URLSearchParams {
  const p = new URL(c.req.url).searchParams;
  const assigned = p.getAll("assigned").flatMap((v) => v.split(","));
  if (assigned.includes("me")) {
    p.delete("assigned");
    for (const a of assigned) p.append("assigned", a === "me" ? c.get("user").id : a);
  }
  return p;
}

// The free collector (GitHub Actions / a computer) has its own secret instead of a sign-in.
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/setup", "/api/auth/status", "/api/free/collector/*", "/r/*", "/d/*", "/f/*"];

const body = async <T>(c: { req: { json: <U>() => Promise<U> } }) =>
  c.req.json<T>().catch(() => {
    throw new ValidationError("Body must be JSON");
  });

app.get("/login", (c) => c.html(loginHtml));

// A business's audit report (public link; the token is random and unguessable).
app.get("/r/:token", async (c) => {
  const page = await reportPage(c.env, c.req.param("token"));
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("Cache-Control", "private, max-age=0");
  if (!page) return c.html(`<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Not found</title><p style="font-family:system-ui;padding:40px">This report link isn't valid (it may have been mistyped).</p>`, 404);
  c.executionCtx.waitUntil(viewed(c.env, "report", page.id, getCookie(c, SESSION_COOKIE), c.req.header("User-Agent")));
  return c.html(page.html);
});

// Opens by the prospect are tracked; opens by a signed-in team member (checking the link) aren't.
async function viewed(env: Env, kind: "report" | "demo", id: string, session: string | undefined, userAgent: string | undefined) {
  try {
    const team = !!(session && (await userForToken(env, session)));
    await trackView(env, kind, id, userAgent, team);
  } catch (err) { console.error("view tracking", err); }
}

// A demo website for a business without a good one (public link, random token).
app.get("/d/:token", async (c) => {
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("Cache-Control", "private, max-age=0");
  const l = await demoLead(c.env, c.req.param("token"));
  if (!l) return c.html(`<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Not found</title><p style="font-family:system-ui;padding:40px">This preview link isn't valid.</p>`, 404);
  c.executionCtx.waitUntil(viewed(c.env, "demo", l.id, getCookie(c, SESSION_COOKIE), c.req.header("User-Agent")));
  return c.html(renderDemo(l, await agencySettings(c.env)));
});

// The free-check form for the agency's own website (embeddable in an iframe).
const formKeyOk = async (env: Env, key: string) => /^[0-9a-f]{24}$/.test(key) && key === (await formKey(env));
app.get("/f/:key", async (c) => {
  c.header("X-Robots-Tag", "noindex");
  if (!(await formKeyOk(c.env, c.req.param("key")))) return c.text("This form link isn't valid.", 404);
  return c.html(formPage(c.req.param("key"), await agencySettings(c.env)));
});
app.post("/f/:key", async (c) => {
  c.header("X-Robots-Tag", "noindex");
  const key = c.req.param("key");
  if (!(await formKeyOk(c.env, key))) return c.text("This form link isn't valid.", 404);
  const agency = await agencySettings(c.env);
  const raw = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const input = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string")) as FormInput;
  const r = await submitForm(c.env, input, clientIp(c));
  if (r?.error) return c.html(formPage(key, agency, r.error), 400);
  return c.html(thanksPage(agency)); // also for the trap / too many tries, so bots learn nothing
});

const clientIp = (c: { req: { header: (n: string) => string | undefined } }) => c.req.header("CF-Connecting-IP") ?? "local";

app.get("/api/auth/status", async (c) => {
  const user = await userForToken(c.env, getCookie(c, SESSION_COOKIE));
  return c.json({ needsSetup: (await countUsers(c.env)) === 0, signedIn: !!user, mustChangePassword: !!user?.must_change_password });
});

app.post("/api/auth/login", async (c) => {
  const { email, password } = await body<{ email: string; password: string }>(c);
  await allowSignInAttempt(c.env, clientIp(c));
  let result;
  try {
    result = await signIn(c.env, email, password, clientIp(c));
  } catch (err) {
    await recordFailedSignIn(c.env, clientIp(c));
    // Failed sign-ins are recorded against the account they tried. Attempts on the super admin's
    // account also go to the notification bell (once a day).
    const target = await c.env.DB.prepare(`SELECT id, name, role FROM users WHERE email = ?`)
      .bind(String(email ?? "").trim().toLowerCase())
      .first<Pick<User, "id" | "name" | "role">>();
    if (target?.role === "super_admin") {
      await notify(c.env, {
        kind: "security", level: "warn",
        message: "Someone tried to sign in to the super admin account with a wrong password today. If it wasn't you, consider changing your password.",
        dedupeKey: `sa-signin-failed-${new Date().toISOString().slice(0, 10)}`,
      });
    }
    if (target) await audit(c.env, target, "sign_in_failed", { reason: "wrong password" });
    throw err;
  }
  const { token, user } = result;
  setSessionCookie(c, token);
  await audit(c.env, user, "signed_in");
  return c.json({ ok: true, mustChangePassword: !!user.must_change_password });
});

// First admin: only while there are no users, and only with the SETUP_CODE secret.
app.post("/api/auth/setup", async (c) => {
  const { code, email, name, password } = await body<{ code: string; email: string; name?: string; password: string }>(c);
  await allowSignInAttempt(c.env, clientIp(c));
  if ((await countUsers(c.env)) > 0) throw new AuthError("Setup is already done. Sign in instead.", 403);
  const expected = c.env.SETUP_CODE;
  if (!expected || typeof code !== "string" || code.length !== expected.length || code !== expected) {
    await recordFailedSignIn(c.env, clientIp(c));
    throw new AuthError("That setup code isn't right.", 403);
  }
  await createUser(c.env, { email, name, password, role: "super_admin" });
  const { token } = await signIn(c.env, email, password, clientIp(c));
  setSessionCookie(c, token);
  return c.json({ ok: true, mustChangePassword: false });
});

// --- Free collector (scripts/overture_collect.py), authorised by FREE_COLLECTOR_SECRET ------------
app.use("/api/free/collector/*", async (c, next) => {
  if (!(await collectorAuthorized(c.env, c.req.header("Authorization")))) return c.json({ error: "Not allowed" }, 401);
  return next();
});
// Website check (scripts/website_check.py): is anything waiting, take a batch, send findings.
app.post("/api/free/collector/websites/waiting", async (c) => c.json({ waiting: await websitesWaiting(c.env) }));
app.post("/api/free/collector/websites/claim", async (c) => c.json({ items: await claimWebsites(c.env) }));
app.post("/api/free/collector/websites/results", async (c) => {
  const b = await body<{ results?: unknown[] }>(c);
  return c.json(await saveWebsiteResults(c.env, Array.isArray(b.results) ? b.results : []));
});
// Owners from state registries (scripts/registry_owners.py).
app.post("/api/free/collector/registry/waiting", async (c) => c.json({ states: await registryWaiting(c.env) }));
app.post("/api/free/collector/registry/claim", async (c) => {
  const b = await body<{ state?: string; after?: number; limit?: number }>(c);
  await c.env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES ('registry_seen_at', datetime('now'), datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run();
  return c.json(await claimRegistry(c.env, String(b.state ?? ""), Number(b.after) || 0, Number(b.limit) || 0));
});
app.post("/api/free/collector/registry/failed", async (c) => {
  const b = await body<{ state?: string; error?: string }>(c);
  const msg = String(b.error ?? "unknown error").slice(0, 400);
  await c.env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES ('registry_last_error', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(msg).run();
  // Florida retries after its usual wait; the others on the next run.
  return c.json({ ok: true });
});
app.post("/api/free/collector/registry/results", async (c) => {
  const b = await body<{ results?: unknown[] }>(c);
  return c.json(await saveRegistryResults(c.env, Array.isArray(b.results) ? b.results : []));
});
// Company size from SBA PPP loan records (scripts/ppp_match.py).
app.post("/api/free/collector/ppp/waiting", async (c) => c.json({ states: await pppWaiting(c.env) }));
app.post("/api/free/collector/ppp/claim", async (c) => {
  const b = await body<{ state?: string; after?: number; limit?: number }>(c);
  return c.json(await claimPpp(c.env, String(b.state ?? ""), Number(b.after) || 0, Number(b.limit) || 0));
});
app.post("/api/free/collector/ppp/results", async (c) => {
  const b = await body<{ results?: unknown[] }>(c);
  return c.json(await savePppResults(c.env, Array.isArray(b.results) ? b.results : []));
});
// The scheduled collector asks for the next waiting collection (or nothing).
app.post("/api/free/collector/next", async (c) => c.json({ importId: await claimNextImport(c.env) }));
app.get("/api/free/collector/:id/spec", async (c) => {
  const spec = await collectorSpec(c.env, c.req.param("id"));
  return spec ? c.json(spec) : c.json({ error: "Unknown collection" }, 404);
});
app.post("/api/free/collector/:id/started", async (c) => {
  const b = await c.req.json<{ release?: string; runner?: string }>().catch(() => ({}) as { release?: string; runner?: string });
  await collectorStarted(c.env, c.req.param("id"), b.release ?? null, b.runner ?? null);
  return c.json({ ok: true });
});
app.post("/api/free/collector/:id/chunk", async (c) => {
  const n = Number(c.req.query("n")), rows = Number(c.req.query("rows")), searchId = c.req.query("search_id") ?? "";
  if (!Number.isInteger(n) || !Number.isInteger(rows) || rows < 0 || !searchId) throw new ValidationError("Bad chunk");
  const body = await c.req.arrayBuffer();
  if (body.byteLength > 20_000_000) throw new ValidationError("Chunk too big");
  await collectorChunk(c.env, c.req.param("id"), searchId, n, rows, body);
  return c.json({ ok: true });
});
app.post("/api/free/collector/:id/done", async (c) => {
  const b = await body<{ perSearch?: Record<string, number>; release?: string | null }>(c);
  await collectorDone(c.env, c.req.param("id"), b.perSearch ?? {}, b.release ?? null);
  return c.json({ ok: true });
});
app.post("/api/free/collector/:id/failed", async (c) => {
  const b = await body<{ error?: string }>(c);
  await collectorFailed(c.env, c.req.param("id"), String(b.error ?? "unknown error"));
  return c.json({ ok: true });
});

// --- Everything below needs a signed-in user -------------------------------------

app.use("*", requireUser(PUBLIC_PATHS));

app.post("/api/auth/logout", async (c) => {
  await audit(c.env, c.get("user"), "signed_out");
  await signOut(c.env, getCookie(c, SESSION_COOKIE));
  clearSessionCookie(c);
  return c.json({ ok: true });
});

app.get("/api/me", (c) => {
  const u = c.get("user");
  return c.json({ id: u.id, email: HIDDEN_EMAIL, name: u.name, role: u.role, mustChangePassword: !!u.must_change_password });
});

app.post("/api/me/password", async (c) => {
  const { current, next } = await body<{ current: string; next: string }>(c);
  await changeOwnPassword(c.env, c.get("user"), current, next, getCookie(c, SESSION_COOKIE));
  await audit(c.env, c.get("user"), "password_changed");
  return c.json({ ok: true });
});

// Team management (admins only).
app.get("/api/admin/users", requireAdmin, async (c) => c.json(await listUsers(c.env)));
app.post("/api/admin/users", requireAdmin, async (c) => {
  const { email, name, password, role } = await body<{ email: string; name?: string; password: string; role?: "admin" | "member" }>(c);
  const user = await createUser(c.env, { email, name, password, role: role === "admin" ? "admin" : "member", mustChange: true });
  await audit(c.env, c.get("user"), "team_member_added", { name: user.name, role: user.role });
  return c.json({ ...user, email: HIDDEN_EMAIL, emailHint: emailHint(user.email) }, 201);
});
app.patch("/api/admin/users/:id", requireAdmin, async (c) => {
  const changes = await body<{ active?: boolean; role?: "admin" | "member"; password?: string; name?: string }>(c);
  const before = await c.env.DB.prepare(`SELECT name FROM users WHERE id = ?`).bind(c.req.param("id")).first<string>("name");
  await updateUser(c.env, c.get("user"), c.req.param("id"), changes);
  const target = await c.env.DB.prepare(`SELECT name FROM users WHERE id = ?`).bind(c.req.param("id")).first<string>("name");
  await audit(c.env, c.get("user"), "team_member_changed", {
    name: before ?? target,
    ...(changes.active != null ? { active: changes.active } : {}),
    ...(changes.role ? { role: changes.role } : {}),
    ...(changes.password ? { passwordReset: true } : {}),
    ...(typeof changes.name === "string" && changes.name.trim() && changes.name.trim() !== before ? { newName: changes.name.trim() } : {}),
  });
  return c.json({ ok: true });
});

app.get("/", (c) => (c.get("user").must_change_password ? c.redirect("/login") : c.html(dashboardHtml)));

// Before running a search: has this category + city + state been pulled recently?
app.get("/api/search/check", async (c) =>
  c.json(await checkSearch(c.env, c.req.query("category") ?? "", c.req.query("city") ?? "")),
);

// Older single-search route. Refuses (409) to repeat a recent pull unless the body has "force": true.
// Only the basic fields are accepted: the cost the budget relies on is worked out here, not sent in.
app.post("/api/search", async (c) => {
  const raw = await body<SearchInput>(c);
  const input: SearchInput = {
    category: String(raw.category ?? ""), city: String(raw.city ?? ""), state: raw.state ?? null,
    countryCode: raw.countryCode ?? null, maxResults: raw.maxResults ?? null, force: raw.force === true,
  };
  const max = input.maxResults ?? Number(c.env.MAX_RESULTS_DEFAULT);
  if (max <= 0 || max > Number(c.env.MAX_RESULTS_DEFAULT)) throw new ValidationError(`Up to ${c.env.MAX_RESULTS_DEFAULT} businesses here; use "Find leads" for bigger searches.`);
  await assertWithinBudget(c.env, max * 0.005, "this search");
  const search = await createSearch(c.env, { ...input, estimatedCost: max * 0.005, createdBy: c.get("user").id });
  await audit(c.env, c.get("user"), "pull_started", { category: search.category, city: search.city, state: search.state, maxResults: search.max_results });
  return c.json(search, search.status === "failed" ? 502 : 201);
});

// Pull history, with filters: category, city, state, status, from, to (YYYY-MM-DD; with tzo =
// the browser's getTimezoneOffset() they are the viewer's local days), id (the ones being followed).
app.get("/api/searches", async (c) => {
  const rows = await retryRead("searches", () => listSearches(c.env, new URL(c.req.url).searchParams));
  // Free searches waiting for the daily free limit: about how many days until everything waiting is saved.
  if (rows.some((r) => r.paused)) {
    const s = await freeSavingStatus(c.env).catch(() => null);
    if (s && s.limit > 0) {
      const days = Math.max(1, Math.ceil(s.waiting / s.limit));
      for (const r of rows) if (r.paused) (r as Record<string, unknown>).waitDays = days;
    }
  }
  return c.json(rows);
});

app.get("/api/searches/:id", async (c) => {
  const search = await getSearch(c.env, c.req.param("id"));
  if (!search) return c.json({ error: "Not found" }, 404);
  return c.json(search);
});

// Resume a failed pull without paying again (continues saving what the scraper collected).
app.post("/api/searches/:id/resume", async (c) => {
  const search = await resumeSearch(c.env, c.req.param("id"));
  if (!search) return c.json({ error: "Not found" }, 404);
  await audit(c.env, c.get("user"), "pull_resumed", { category: search.category, city: search.city, state: search.state });
  return c.json(search);
});

// Stop a pull that is still collecting; what it already collected is saved.
app.post("/api/searches/:id/cancel", async (c) => {
  const search = await cancelSearch(c.env, c.req.param("id"), c.get("user").id);
  if (!search) return c.json({ error: "Not found" }, 404);
  await audit(c.env, c.get("user"), "pull_cancelled", { category: search.category, city: search.city, state: search.state });
  return c.json(search);
});

// Manual poke, so you don't have to wait for the next cron tick.
app.post("/api/searches/:id/sync", async (c) => {
  const search = await syncSearch(c.env, c.req.param("id"));
  if (!search) return c.json({ error: "Not found" }, 404);
  return c.json(search);
});

app.get("/api/leads", async (c) => c.json(await retryRead("leads list", () => listLeads(c.env, filterParams(c)))));

// How phone checks are going: waiting count and a plain-language line (cheap; no checks run).
// The price per check comes along, so the page labels phone checks the same before and after a price check.
app.get("/api/phones/status", async (c) => c.json({ ...(await phoneStatus(c.env)), pricing: phoneCheckPricing(c.env) }));

app.get("/api/leads/facets", async (c) => c.json(await retryRead("filter counts", () => leadFacets(c.env, filterParams(c)))));

// "Find leads": body { categories[], locations[{city?, state}], maxResults?, sourceCode?, mode }.
// mode "plan" only reports what we have vs what would be pulled (and the cost); it never spends.
app.post("/api/find", async (c) => {
  const input = await body<FindRequest>(c);
  // Only the plan (an answer, nothing started or paid) is tried again after a database hiccup.
  const run = () => findLeads(c.env, { ...input, createdBy: c.get("user").id });
  const result = (input.mode ?? "plan") === "plan" && !input.withCounts ? await retryRead("find plan", run) : await run();
  const user = c.get("user");
  const what = { types: [...new Set(result.combinations.map((x) => x.category))], places: [...new Set(result.combinations.map((x) => x.place.label))] };
  if (result.countCost > 0) await audit(c.env, user, "counts_checked", { ...what, costUsd: Math.round(result.countCost * 1000) / 1000 });
  if (result.mode === "pull_missing" || result.mode === "refresh_all") {
    const started = result.combinations.filter((x) => x.started);
    if (started.length) {
      await audit(c.env, user, "pull_started", {
        ...what, mode: result.mode, searches: started.length, maxResults: result.maxResults || "no limit",
        estimatedCostUsd: result.mode === "pull_missing" ? result.estimatedCostMissing : result.estimatedCostAll, checkPhones: result.checkPhones,
      });
    }
  }
  if (result.mode === "use_existing" && result.checkPhones) await audit(c.env, user, "phone_checks_started", { ...what, estimatedCostUsd: result.estimatedCostExisting });
  return c.json(result);
});

// Country -> state/province -> city pickers (GeoNames: cities with 15,000+ people).
app.get("/api/geo/countries", async (c) => c.json(await listCountries(c.env)));
app.get("/api/geo/regions", async (c) => c.json(await listRegions(c.env, c.req.queries("country") ?? [])));
app.get("/api/geo/cities", async (c) =>
  c.json(
    await listCities(c.env, {
      countries: c.req.queries("country") ?? [],
      regions: c.req.queries("region") ?? [],
      q: c.req.query("q"),
      limit: Number(c.req.query("limit")) || undefined,
    }),
  ),
);

// CSV in the GHL upload format, for every lead matching the given filters (same params as /api/leads).
app.get("/api/export", async (c) => {
  const params = filterParams(c);
  const stream = await exportCsv(c.env, params, { origin: new URL(c.req.url).origin });
  await audit(c.env, c.get("user"), "csv_downloaded", { filters: Object.fromEntries([...new Set(params.keys())].map((k) => [k, params.getAll(k).join(", ")])) });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${{ ghl: "", cold_email: "cold-email-", simple: "simple-" }[exportFormat(params.get("format"))]}${date}.csv"`,
    },
  });
});

// States for the "Where" picker, plus cities we already have businesses in.
app.get("/api/places", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT city, state, COUNT(*) AS n FROM leads WHERE city IS NOT NULL AND city <> '' AND state IS NOT NULL
     GROUP BY city, state ORDER BY city`,
  ).all<{ city: string; state: string; n: number }>();
  return c.json({ states: US_STATES, knownCities: results });
});

// Industry -> category list (for the picker and the search box), with stored counts.
app.get("/api/categories", async (c) => c.json(await categoryTree(c.env)));

// Runs the phone check on demand (the cron does this every minute anyway).
app.post("/api/phones/check", async (c) =>
  c.json(await checkPendingPhones(c.env, Number(c.req.query("limit")) || undefined, { force: true })),
);

// Check (or re-check) phone types for chosen businesses, verified or not: body { ids } for
// specific ones, or no ids to use every business matching the filters in the query string.
// dryRun: true only counts and prices it. The minute timer / open page then does the checks.
app.post("/api/phones/request", async (c) => {
  const { ids, recheck, dryRun } = await body<{ ids?: string[]; recheck?: boolean; dryRun?: boolean }>(c);
  let leadIds = Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
  let capped = false;
  if (!leadIds.length && !Array.isArray(ids)) {
    // Every business in the list (with or without a phone), so the answer can say exactly why
    // nothing needs checking: no phone, already checked, or already waiting.
    const q = buildLeadQuery(await resolveFilters(c.env, filterParams(c)));
    const { results } = await c.env.DB.prepare(
      `${q.with} SELECT id FROM ${q.source} ORDER BY (gbp_phone_formatted IS NULL), (phone_type IS NOT NULL) LIMIT ${MAX_PHONE_REQUEST + 1}`,
    )
      .bind(...q.binds)
      .all<{ id: string }>();
    capped = results.length > MAX_PHONE_REQUEST;
    leadIds = results.map((r) => r.id);
  }
  const preview = await requestPhoneChecks(c.env, leadIds, { recheck: !!recheck, dryRun: true });
  const budget = await monthSpend(c.env);
  // Paid checks must fit the budget, unless a free service is set up to do them.
  const paidOnly = preview.maxPerCheck > 0 && !preview.hasFreeService;
  if (dryRun || !preview.queued) return c.json({ ...preview, capped, limit: MAX_PHONE_REQUEST, budgetLeft: budget.left, fits: !paidOnly || preview.maxCostUsd <= budget.left });
  if (paidOnly) await assertWithinBudget(c.env, preview.maxCostUsd, "these phone checks");
  const result = await requestPhoneChecks(c.env, leadIds, { recheck: !!recheck });
  await audit(c.env, c.get("user"), "phone_checks_requested", { count: result.queued, recheck: !!recheck, maxCostUsd: result.maxCostUsd });
  await c.env.INGEST_QUEUE?.send({ phones: true, force: true }).catch(() => undefined);
  return c.json({ ...result, capped, limit: MAX_PHONE_REQUEST, budgetLeft: budget.left, fits: true });
});

// Free tier: saving progress and the daily limit; recent collections; start a collector again.
app.get("/api/free/status", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, created_at, status, runner, release, rows_received, error, finished_at FROM free_imports ORDER BY created_at DESC LIMIT 10`,
  ).all();
  const seen = await c.env.DB.prepare(`SELECT value FROM app_settings WHERE key = 'collector_seen_at'`).first<string>("value");
  return c.json({ ...(await freeSavingStatus(c.env)), collectorSeenAt: seen, imports: results });
});
app.put("/api/free/settings", requireSuperAdmin, async (c) => {
  const { dailyLimit } = await body<{ dailyLimit: number }>(c);
  if (!Number.isInteger(dailyLimit) || dailyLimit < 0 || dailyLimit > 1_000_000) throw new ValidationError("Daily limit must be 0 (no limit) or a whole number.");
  await c.env.DB.prepare(`UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE key = 'free_daily_limit'`).bind(String(dailyLimit)).run();
  await audit(c.env, c.get("user"), "free_limit_changed", { dailyLimit });
  return c.json(await freeSavingStatus(c.env));
});
// Put a waiting or failed collection back in line (and nudge GitHub straight away when a token is set).
app.post("/api/free/imports/:id/dispatch", requireAdmin, async (c) => {
  const ok = await requeueImport(c.env, c.req.param("id"));
  if (!ok) return c.json({ ok: false, error: "That collection is already running or finished." });
  const d = await dispatchCollector(c.env, c.req.param("id"));
  return c.json({ ok: true, error: d.error, note: d.ok ? "Started." : "Queued: the free collector picks it up within about 10 minutes." });
});

// Daily free collection: the list (admins), switching it on and the pace (super admin).
app.get("/api/harvest", requireAdmin, async (c) => c.json(await listHarvest(c.env)));
app.post("/api/harvest", requireAdmin, async (c) => {
  const b = await body<Pick<FindRequest, "categories" | "locations" | "radiusMiles">>(c);
  const { categories, places } = await resolveRequest(c.env, b);
  const r = await addToHarvest(c.env, categories.flatMap((category) => places.map((place) => ({ category, place }))), c.get("user").id);
  await audit(c.env, c.get("user"), "harvest_added", { added: r.added });
  return c.json(r);
});
app.delete("/api/harvest/:id", requireAdmin, async (c) => {
  await removeFromHarvest(c.env, c.req.param("id"));
  await audit(c.env, c.get("user"), "harvest_removed", {});
  return c.json({ ok: true });
});
app.put("/api/harvest/settings", requireSuperAdmin, async (c) => {
  const b = await body<{ enabled: boolean; target: number }>(c);
  try { await setHarvestSettings(c.env, { enabled: b.enabled === true, target: Number(b.target) }); } catch (err) { throw new ValidationError((err as Error).message); }
  await audit(c.env, c.get("user"), "harvest_settings_changed", { enabled: b.enabled === true, target: Number(b.target) });
  return c.json(await listHarvest(c.env));
});

// Paid tier: "Get Google details" for free businesses (ids, or every business matching the filters).
app.post("/api/google-details", async (c) => {
  const { ids, dryRun, retryNotFound } = await body<{ ids?: string[]; dryRun?: boolean; retryNotFound?: boolean }>(c);
  let leadIds = Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
  if (!Array.isArray(ids)) {
    const q = buildLeadQuery(await resolveFilters(c.env, filterParams(c)));
    const { results } = await c.env.DB.prepare(`${q.with} SELECT id FROM ${q.source} WHERE data_source IN ('free', 'upload') LIMIT 5000`).bind(...q.binds).all<{ id: string }>();
    leadIds = results.map((r) => r.id);
  }
  if (dryRun) {
    const { ids: _ids, ...preview } = await previewGoogleDetails(c.env, leadIds, { retryNotFound: !!retryNotFound });
    return c.json({ ...preview, budget: await monthSpend(c.env) });
  }
  const { search, preview } = await startGoogleDetails(c.env, leadIds, { createdBy: c.get("user").id, retryNotFound: !!retryNotFound });
  await audit(c.env, c.get("user"), "google_details_started", { count: preview.eligible, estimatedCostUsd: preview.costUsd });
  return c.json({ search, preview });
});

// Working the leads: stage, assignment, notes (single business or a whole filtered list).
app.get("/api/team", async (c) => c.json(await teamList(c.env)));
app.get("/api/leads/:id/detail", async (c) => {
  const d = await leadDetail(c.env, c.req.param("id"));
  return d ? c.json(d) : c.json({ error: "Not found" }, 404);
});
app.patch("/api/leads/:id", async (c) => {
  const b = await body<{ status?: string; assignedTo?: string | null }>(c);
  return c.json(await updateLeads(c.env, [c.req.param("id")], b, c.get("user").id));
});
app.post("/api/leads/bulk", async (c) => {
  const b = await body<{ ids?: string[]; status?: string; assignedTo?: string | null; dryRun?: boolean }>(c);
  let ids = Array.isArray(b.ids) ? b.ids.filter((x) => typeof x === "string") : [];
  // ?take=N: only the first N in the list's order ("Hand out 50"), not the whole list.
  const take = Math.min(Math.max(Math.floor(Number(c.req.query("take")) || 0), 0), 5000);
  let listTotal: number | undefined;
  if (!Array.isArray(b.ids)) {
    const params = filterParams(c);
    const q = buildLeadQuery(await resolveFilters(c.env, params));
    ids = (await c.env.DB.prepare(`${q.with} SELECT id FROM ${q.source} AS x ${take ? `ORDER BY ${sortOrder(params)}` : ""} LIMIT ?`)
      .bind(...q.binds, take || 5000).all<{ id: string }>()).results.map((r) => r.id);
    // The preview of a hand-out says "the newest 50 of N": N straight from the same filters.
    if (take && b.dryRun) listTotal = Number(await c.env.DB.prepare(`${q.with} SELECT COUNT(*) AS n FROM ${q.source}`).bind(...q.binds).first("n")) || 0;
  }
  if (b.dryRun) return c.json({ count: ids.length, capped: !take && ids.length >= 5000, ...(listTotal !== undefined ? { total: listTotal } : {}) });
  // What they were before, so the page can offer "Undo" for a few seconds.
  const previous = await leadStates(c.env, ids);
  const r = await updateLeads(c.env, ids, b, c.get("user").id);
  await audit(c.env, c.get("user"), "leads_updated", { count: r.updated, status: b.status ?? null, ...("assignedName" in r ? { assigned: b.assignedTo ?? null, assignedName: r.assignedName } : {}) });
  return c.json({ ...r, previous });
});
app.post("/api/leads/bulk/undo", async (c) => {
  const b = await body<{ previous?: unknown }>(c);
  const r = await restoreLeadStates(c.env, b.previous, c.get("user").id);
  await audit(c.env, c.get("user"), "leads_updated", { count: r.restored, undo: true });
  return c.json(r);
});
app.post("/api/leads/:id/notes", async (c) => {
  const b = await body<{ body: string }>(c);
  await addNote(c.env, c.req.param("id"), b.body, c.get("user").id);
  return c.json({ ok: true });
});
app.delete("/api/notes/:id", async (c) => {
  await deleteNote(c.env, Number(c.req.param("id")), c.get("user"));
  return c.json({ ok: true });
});

// Upload a list (CSV) of businesses the team already has.
app.post("/api/uploads", async (c) => {
  const b = await body<{ name?: string; csv: string; preview?: boolean }>(c);
  if (b.preview) {
    // Check the file before saving: which columns were understood, how many businesses.
    const p = rowsFromCsv(String(b.csv ?? ""));
    return c.json({ rows: p.rows.length, skipped: p.skipped, columns: p.columns, sample: p.rows.slice(0, 3).map((r) => ({ name: r.name, city: r.city, phone: r.phone, website: r.website })) });
  }
  const r = await saveUpload(c.env, b.name ?? "", b.csv, c.get("user").id);
  await audit(c.env, c.get("user"), "list_uploaded", { name: r.name, rows: r.rows, added: r.added });
  await emitEvent(c.env, "list.uploaded", { searchId: r.searchId, name: r.name, rows: r.rows, added: r.added, matched: r.matched });
  return c.json(r);
});

// API keys and webhooks (super admin), and how the state-registry owner look-ups are going.
app.get("/api/admin/api-keys", requireSuperAdmin, async (c) => c.json(await listApiKeys(c.env)));
app.post("/api/admin/api-keys", requireSuperAdmin, async (c) => {
  const b = await body<{ name: string; canCollect?: boolean }>(c);
  const r = await createApiKey(c.env, b.name, b.canCollect === true, c.get("user").id);
  await audit(c.env, c.get("user"), "api_key_created", { name: b.name, canCollect: b.canCollect === true });
  return c.json(r);
});
app.delete("/api/admin/api-keys/:id", requireSuperAdmin, async (c) => {
  await revokeApiKey(c.env, c.req.param("id"));
  await audit(c.env, c.get("user"), "api_key_revoked", {});
  return c.json({ ok: true });
});
app.get("/api/admin/webhooks", requireSuperAdmin, async (c) => c.json({ webhooks: await listWebhooks(c.env), events: WEBHOOK_EVENTS }));
app.post("/api/admin/webhooks", requireSuperAdmin, async (c) => {
  const b = await body<{ url: string; events: string[] }>(c);
  const r = await createWebhook(c.env, b.url, Array.isArray(b.events) ? b.events : [], c.get("user").id);
  await audit(c.env, c.get("user"), "webhook_added", { url: (() => { try { return new URL(String(b.url)).host; } catch { return null; } })() });
  return c.json(r);
});
app.delete("/api/admin/webhooks/:id", requireSuperAdmin, async (c) => {
  await deleteWebhook(c.env, c.req.param("id"));
  await audit(c.env, c.get("user"), "webhook_deleted", {});
  return c.json({ ok: true });
});
app.post("/api/admin/webhooks/:id/test", requireSuperAdmin, async (c) => {
  const w = await c.env.DB.prepare(`SELECT id FROM webhooks WHERE id = ?`).bind(c.req.param("id")).first<string>("id");
  if (!w) return c.json({ error: "Not found" }, 404);
  await c.env.DB.prepare(`INSERT INTO webhook_outbox (webhook_id, event, payload) VALUES (?, 'test', ?)`)
    .bind(w, JSON.stringify({ event: "test", sentAt: new Date().toISOString(), data: { message: "Hello from Lead Finder" } })).run();
  return c.json({ ok: true, note: "Sent within a minute." });
});

// Online store owner console (super admin): settings, customer accounts, credits, sales.
app.get("/api/store/settings", requireSuperAdmin, async (c) => c.json(await storeSettings(c.env)));
app.put("/api/store/settings", requireSuperAdmin, async (c) => {
  const s = await saveStoreSettings(c.env, await body<Record<string, unknown>>(c));
  await audit(c.env, c.get("user"), "store_settings_changed", { priceFree: s.priceFree, priceGoogle: s.priceGoogle, signupOpen: s.signupOpen, welcomeCredits: s.welcomeCredits, signupMode: s.signupMode, freePerMonth: s.freePerMonth, publicPages: s.publicPages });
  return c.json(s);
});
app.get("/api/store/accounts", requireSuperAdmin, async (c) => c.json(await listStoreAccounts(c.env)));
app.post("/api/store/accounts/:id/status", requireSuperAdmin, async (c) => {
  const b = await body<{ status: string }>(c);
  const r = await setStoreAccountStatus(c.env, c.req.param("id"), b.status, c.get("user").id);
  if (!r) return c.json({ error: "Not found" }, 404);
  await audit(c.env, c.get("user"), "store_account_status", { account: c.req.param("id"), status: r.status, previous: r.previous, welcomeCredits: r.welcomeGiven });
  return c.json(r);
});
app.post("/api/store/accounts/:id/credits", requireSuperAdmin, async (c) => {
  const b = await body<{ delta: number; note?: string }>(c);
  const r = await changeStoreCredits(c.env, c.req.param("id"), b.delta, b.note, c.get("user").id);
  if (!r) return c.json({ error: "Not found" }, 404);
  await audit(c.env, c.get("user"), "store_credits_changed", { account: c.req.param("id"), delta: Number(b.delta), balance: r.balance });
  return c.json(r);
});
app.post("/api/store/accounts/:id/reset-password", requireSuperAdmin, async (c) => {
  const b = await body<{ email: string }>(c);
  const r = await resetStorePassword(c.env, c.req.param("id"), b.email);
  if (!r) return c.json({ error: "Not found" }, 404);
  await audit(c.env, c.get("user"), "store_password_reset", { account: c.req.param("id") });
  return c.json({ password: r.password });
});
app.get("/api/store/stats", requireSuperAdmin, async (c) => c.json(await storeStats(c.env)));
// Getting the store ready to sell: checklist, credit packs, email sender, card sales.
app.get("/api/store/launch", requireSuperAdmin, async (c) => c.json({ ...(await launchChecklist(c.env.DB)), revenue: await storeRevenue(c.env.DB) }));
app.put("/api/store/launch", requireSuperAdmin, async (c) => {
  const s = await saveLaunchSettings(c.env.DB, await body<Record<string, unknown>>(c));
  await audit(c.env, c.get("user"), "store_settings_changed", { launch: true });
  return c.json(s);
});
app.get("/api/store/removals", requireSuperAdmin, async (c) => c.json(await listRemovalRequests(c.env)));
app.post("/api/store/removals/:id", requireSuperAdmin, async (c) => {
  const b = await body<{ action: string }>(c);
  const r = await handleRemovalRequest(c.env, c.req.param("id"), b.action, c.get("user").id);
  if (!r) return c.json({ error: "Not found" }, 404);
  await audit(c.env, c.get("user"), "store_removal_request", { request: r.id, action: b.action, business: r.business, added: r.suppressed?.added ?? 0 });
  return c.json(r);
});

// Email verification (MillionVerifier): preview / queue the best email of each business in a list.
app.post("/api/emails/verify", async (c) => {
  const b = await body<{ ids?: string[]; dryRun?: boolean }>(c);
  let ids = Array.isArray(b.ids) ? b.ids.filter((x) => typeof x === "string") : [];
  if (!Array.isArray(b.ids)) {
    const q = buildLeadQuery(await resolveFilters(c.env, filterParams(c)));
    ids = (await c.env.DB.prepare(`${q.with} SELECT id FROM ${q.source} WHERE EXISTS (SELECT 1 FROM lead_emails e WHERE e.lead_id = ${q.source}.id) LIMIT 5000`)
      .bind(...q.binds).all<{ id: string }>()).results.map((r) => r.id);
  }
  const r = await requestVerification(c.env as Env & { MILLIONVERIFIER_API_KEY?: string }, ids, { dryRun: b.dryRun === true });
  if (!b.dryRun && r.queued) await audit(c.env, c.get("user"), "emails_verification_started", { count: r.queued });
  return c.json(r);
});
app.get("/api/emails/status", async (c) => c.json(await verifyStatus(c.env as Env & { MILLIONVERIFIER_API_KEY?: string })));

// Do-not-contact list.
app.get("/api/dnc", async (c) => {
  const p = new URL(c.req.url).searchParams;
  return c.json({ ...(await listSuppressions(c.env, p.get("search") ?? "", Number(p.get("page")) || 1)), reasons: REASON_WORDS });
});
app.post("/api/dnc", async (c) => {
  const b = await body<{ text: string; reason: string; note?: string }>(c);
  const r = await addSuppressions(c.env, b.text, b.reason, b.note ?? null, c.get("user").id);
  await audit(c.env, c.get("user"), "dnc_added", { entries: r.added, reason: b.reason });
  return c.json(r);
});
// Admins take any entry off; anyone can undo an entry they added themselves in the last 15 minutes.
app.delete("/api/dnc/:id", async (c) => {
  const user = c.get("user");
  if (user.role !== "admin" && user.role !== "super_admin") {
    const own = await c.env.DB.prepare(`SELECT 1 AS x FROM suppressions WHERE id = ? AND added_by = ? AND created_at >= datetime('now', '-15 minutes')`)
      .bind(Number(c.req.param("id")), user.id).first();
    if (!own) return c.json({ error: "Only admins can do that." }, 403);
  }
  const s = await removeSuppression(c.env, Number(c.req.param("id")));
  await audit(c.env, c.get("user"), "dnc_removed", s ? { kind: s.kind, value: s.value } : {});
  return c.json({ ok: true });
});
// Response: { entryIds: number[] (the list entries created, for Undo via DELETE /api/dnc/:id), added, found, business, ... }.
app.post("/api/leads/:id/dnc", async (c) => {
  const b = await body<{ reason?: string }>(c);
  const r = await suppressLead(c.env, c.req.param("id"), b.reason ?? "other", c.get("user").id);
  await audit(c.env, c.get("user"), "dnc_added", { entries: r.added, reason: b.reason ?? "other", business: r.business });
  return c.json(r);
});

// Audit report: the agency's details, and a share link per business.
app.get("/api/agency", async (c) => c.json(await agencySettings(c.env)));
app.put("/api/agency", requireAdmin, async (c) => {
  await saveAgencySettings(c.env, await body<Partial<AgencySettings>>(c));
  await audit(c.env, c.get("user"), "agency_settings_changed", {});
  return c.json(await agencySettings(c.env));
});
// Extra columns in the "For GoHighLevel" download (to fill the agency's GHL custom fields).
app.get("/api/ghl-columns", async (c) => {
  const { columns, saved } = await loadGhlColumns(c.env);
  return c.json({ columns, saved, defaults: DEFAULT_GHL_COLUMNS, sources: GHL_SOURCES, max: MAX_GHL_COLUMNS, maxName: MAX_GHL_NAME });
});
app.put("/api/ghl-columns", requireAdmin, async (c) => {
  const columns = await saveGhlColumns(c.env, await body<unknown>(c), CSV_COLUMNS);
  await audit(c.env, c.get("user"), "ghl_columns_changed", { count: columns.length });
  return c.json({ columns, saved: true });
});
app.post("/api/leads/:id/report", async (c) => {
  const t = await ensureReportToken(c.env, c.req.param("id"));
  if (!t) return c.json({ error: "Not found" }, 404);
  await logEvent(c.env, c.req.param("id"), "report_shared", "Made the report link", c.get("user").id);
  return c.json({ url: `${new URL(c.req.url).origin}/r/${t}` });
});
app.post("/api/leads/:id/demo", async (c) => {
  const t = await ensureDemoToken(c.env, c.req.param("id"));
  if (!t) return c.json({ error: "Not found" }, 404);
  await logEvent(c.env, c.req.param("id"), "demo_shared", "Made the demo website link", c.get("user").id);
  return c.json({ url: `${new URL(c.req.url).origin}/d/${t}` });
});

// Activity timeline for one business.
app.get("/api/leads/:id/events", async (c) => c.json(await listEvents(c.env, c.req.param("id"))));

// Ready-made openers (email, text, call script) for one business, and the wording (admins edit).
app.get("/api/leads/:id/opener", async (c) => {
  const l = await c.env.DB.prepare(
    `SELECT business_name, owner_name, city, gbp_category, score_notes, ai_opener, (SELECT email FROM lead_emails e WHERE e.lead_id = leads.id ORDER BY position LIMIT 1) AS email
     FROM leads WHERE id = ?`,
  ).bind(c.req.param("id")).first<{ business_name: string | null; owner_name: string | null; city: string | null; gbp_category: string | null; score_notes: string | null; ai_opener: string | null; email: string | null }>();
  if (!l) return c.json({ error: "Not found" }, 404);
  let suggestions: string[] = [];
  try { suggestions = (l.score_notes ? JSON.parse(l.score_notes).suggestions : []) ?? []; } catch { suggestions = []; }
  const agency = await agencySettings(c.env);
  return c.json(buildOpener({
    business: l.business_name, ownerName: l.owner_name, firstNameFromEmail: l.email ? firstNameFrom(l.email) : "", city: l.city, category: l.gbp_category, suggestions, agency, aiOpener: l.ai_opener,
  }, await loadTemplates(c.env)));
});
app.get("/api/openers/templates", async (c) => c.json({ templates: await loadTemplates(c.env), defaults: DEFAULT_TEMPLATES, fields: MERGE_FIELDS }));
app.put("/api/openers/templates", requireAdmin, async (c) => {
  const t = await saveTemplates(c.env, await body<unknown>(c));
  await audit(c.env, c.get("user"), "opener_templates_changed", {});
  return c.json({ templates: t });
});

// The free-check form: its link and embed code (admins), and a new link if the old one leaks.
app.get("/api/form", requireAdmin, async (c) => {
  const key = await formKey(c.env);
  const url = `${new URL(c.req.url).origin}/f/${key}`;
  return c.json({ url, embed: `<iframe src="${url}" style="width:100%;max-width:560px;height:720px;border:0" title="Free online presence check" loading="lazy"></iframe>` });
});
app.post("/api/form/new-link", requireAdmin, async (c) => {
  await c.env.DB.prepare(`UPDATE app_settings SET value = lower(hex(randomblob(12))), updated_at = datetime('now') WHERE key = 'form_key'`).run();
  await audit(c.env, c.get("user"), "form_link_changed", {});
  return c.json({ ok: true });
});

// Map: businesses with a position (matching the filters), at most 3,000 dots.
app.get("/api/leads/map", async (c) => {
  const q = buildLeadQuery(await resolveFilters(c.env, filterParams(c)));
  const [pts, cnt] = await c.env.DB.batch([
    c.env.DB.prepare(`${q.with} SELECT id, business_name AS n, latitude AS lat, longitude AS lng, presence_score AS s, COALESCE(lead_status, 'Untouched') AS st, gbp_category AS cat
      FROM ${q.source} WHERE latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY presence_score IS NULL, presence_score LIMIT 3000`).bind(...q.binds),
    c.env.DB.prepare(`${q.with} SELECT COUNT(*) AS n, SUM(latitude IS NULL) AS nopos FROM ${q.source}`).bind(...q.binds),
  ]);
  const n = cnt.results[0] as { n: number; nopos: number | null };
  return c.json({ points: pts.results, total: n.n, withoutPosition: n.nopos ?? 0, capped: n.n - (n.nopos ?? 0) > 3000 });
});

// Overview page numbers.
app.get("/api/overview", async (c) => c.json(await retryRead("overview", () => overview(c.env))));

// Which optional (paid) features are switched on, so the page only shows what works.
app.get("/api/features", (c) => {
  const e = c.env as AiEnv & { ANTHROPIC_API_KEY?: string; MILLIONVERIFIER_API_KEY?: string };
  return c.json({
    aiSearch: !!e.ANTHROPIC_API_KEY, emailVerify: !!e.MILLIONVERIFIER_API_KEY, speedCheck: !!e.PAGESPEED_API_KEY,
    // Free Gemini key (or the local test mode, GEMINI_MOCK=1).
    aiHelper: !!e.GEMINI_API_KEY || e.GEMINI_MOCK === "1" || e.GEMINI_MOCK === "true",
  });
});
// "What to do next": a few plain to-dos for the signed-in person (src/next-steps.ts).
app.get("/api/next-steps", async (c) => c.json(await retryRead("next-steps", async () => (await import("./next-steps")).nextSteps(c.env, c.get("user")))));

// Plain-English search: the AI turns a sentence into Database filters.
app.post("/api/ai-search", async (c) => {
  const b = await body<{ text: string }>(c);
  return c.json(await aiSearch(c.env as Env & { ANTHROPIC_API_KEY?: string }, b.text, c.get("user").id));
});

// AI helper (free Gemini key): reads each business's website and fills in what's missing.
app.get("/api/ai-helper", async (c) => c.json(await aiHelperStatus(c.env as AiEnv)));
app.put("/api/ai-helper", requireAdmin, async (c) => {
  const b = await body<{ enabled?: boolean; dailyLimit?: number }>(c);
  try { await setAiHelperSettings(c.env, b); } catch (err) { throw new ValidationError((err as Error).message); }
  await audit(c.env, c.get("user"), "ai_helper_settings", { enabled: b.enabled, dailyLimit: b.dailyLimit });
  return c.json(await aiHelperStatus(c.env as AiEnv));
});
app.post("/api/ai-helper/run", async (c) => {
  const b = await body<{ ids?: string[] }>(c);
  let r: { queued: number };
  try { r = await aiHelperRun(c.env, b.ids); } catch (err) { throw new ValidationError((err as Error).message); }
  // Start straight away rather than waiting for the minute job (when allowed right now).
  if (r.queued && c.env.INGEST_QUEUE && (await aiHelperDue(c.env as AiEnv))) await c.env.INGEST_QUEUE.send({ ai: true }).catch(() => undefined);
  return c.json({ ...r, status: await aiHelperStatus(c.env as AiEnv) });
});

// How much each thing counts in the scores (super admin changes; everyone can read).
app.get("/api/scoring/weights", async (c) => c.json({ weights: await loadWeights(c.env), defaults: DEFAULT_WEIGHTS }));
app.put("/api/scoring/weights", requireSuperAdmin, async (c) => {
  const w = await saveWeights(c.env, await body<unknown>(c));
  await audit(c.env, c.get("user"), "score_weights_changed", {});
  return c.json({ weights: w, note: "Saved. Every business is re-scored over the next hour or so." });
});
app.get("/api/registry/status", requireAdmin, async (c) => c.json(await registryStatus(c.env)));

// Saved searches (shared by the team) with free "new businesses" alerts.
app.get("/api/saved-searches", async (c) => c.json(await listSavedSearches(c.env)));
app.post("/api/saved-searches", async (c) => {
  const b = await body<{ name: string; request: FindRequest }>(c);
  const r = await saveSearch(c.env, b.name, b.request, c.get("user").id);
  await audit(c.env, c.get("user"), "saved_search_added", { name: b.name });
  return c.json(r);
});
app.patch("/api/saved-searches/:id", async (c) => {
  await updateSavedSearch(c.env, c.req.param("id"), await body<{ name?: string; alert?: boolean; seen?: boolean; ran?: boolean }>(c));
  return c.json({ ok: true });
});
app.delete("/api/saved-searches/:id", async (c) => {
  const name = await c.env.DB.prepare(`SELECT name FROM saved_searches WHERE id = ?`).bind(c.req.param("id")).first<string>("name").catch(() => null);
  await deleteSavedSearch(c.env, c.req.param("id"));
  await audit(c.env, c.get("user"), "saved_search_deleted", name ? { name } : {});
  return c.json({ ok: true });
});

// Website check: status, settings, and "Check websites" for chosen businesses (ids or filters).
app.get("/api/websites/status", async (c) => c.json({ ...(await websiteCheckStatus(c.env)), speedKey: !!c.env.PAGESPEED_API_KEY }));
app.put("/api/websites/settings", requireSuperAdmin, async (c) => {
  const b = await body<{ enabled: boolean; limit: number }>(c);
  try { await setWebsiteCheckSettings(c.env, { enabled: b.enabled === true, limit: Number(b.limit) }); } catch (err) { throw new ValidationError((err as Error).message); }
  await audit(c.env, c.get("user"), "website_check_settings", { enabled: b.enabled === true, limit: Number(b.limit) });
  return c.json({ ok: true });
});
app.post("/api/websites/check", async (c) => {
  const { ids, dryRun, recheck } = await body<{ ids?: string[]; dryRun?: boolean; recheck?: boolean }>(c);
  let leadIds = Array.isArray(ids) ? ids.filter((x) => typeof x === "string").slice(0, 5000) : [];
  if (!Array.isArray(ids)) {
    const q = buildLeadQuery(await resolveFilters(c.env, filterParams(c)));
    const { results } = await c.env.DB.prepare(`${q.with} SELECT id FROM ${q.source} WHERE website_domain IS NOT NULL LIMIT 5000`).bind(...q.binds).all<{ id: string }>();
    leadIds = results.map((r) => r.id);
  }
  if (dryRun) {
    let done = 0, waiting = 0;
    for (let i = 0; i < leadIds.length; i += 90) {
      const list = leadIds.slice(i, i + 90).map(sqlString).join(", ");
      const r = await c.env.DB.prepare(
        `SELECT SUM(website_audit_status IN ('done', 'failed')) AS done, SUM(website_audit_status IN ('queued', 'checking')) AS waiting
         FROM leads WHERE id IN (${list}) AND website_domain IS NOT NULL`,
      ).first<{ done: number | null; waiting: number | null }>();
      done += r?.done ?? 0; waiting += r?.waiting ?? 0;
    }
    return c.json({ withWebsite: leadIds.length, done, waiting, notChecked: leadIds.length - done - waiting, status: await websiteCheckStatus(c.env) });
  }
  const r = await queueWebsiteChecks(c.env, leadIds, { recheck: recheck === true });
  await audit(c.env, c.get("user"), "website_check_started", { count: r.queued, recheck: recheck === true });
  return c.json(r);
});

// Recompute derived columns (website domain, street address, status) for stored leads.
app.post("/api/admin/backfill", requireAdmin, async (c) => {
  await audit(c.env, c.get("user"), "maintenance_backfill");
  return c.json(await backfillDerivedColumns(c.env));
});

// Notifications: problems worth knowing about (failed pulls, paused phone checks, low credit, budget).
app.get("/api/notifications", async (c) => c.json(await listNotifications(c.env)));
app.post("/api/notifications/dismiss-all", async (c) => {
  const n = await dismissAllNotifications(c.env, c.get("user").id);
  if (n) await audit(c.env, c.get("user"), "notifications_dismissed_all", { count: n });
  return c.json({ ok: true, dismissed: n });
});
app.post("/api/notifications/:id/dismiss", async (c) => {
  await dismissNotification(c.env, Number(c.req.param("id")), c.get("user").id);
  await audit(c.env, c.get("user"), "notification_dismissed", { id: Number(c.req.param("id")) });
  return c.json({ ok: true });
});

// Monthly spending limit: everyone can see it, only the super admin can change it.
app.get("/api/budget", async (c) => c.json(await retryRead("budget", () => monthSpend(c.env))));
app.put("/api/budget", requireSuperAdmin, async (c) => {
  const { amount } = await body<{ amount: number }>(c);
  const previous = await getBudget(c.env);
  await setBudget(c.env, Number(amount));
  await audit(c.env, c.get("user"), "budget_changed", { amount: Math.round(Number(amount) * 100) / 100, previous });
  return c.json(await monthSpend(c.env));
});

// Backups (super admin only): list, start one now, download one as a restore file.
app.get("/api/admin/backups", requireSuperAdmin, async (c) => c.json(await listBackups(c.env)));
app.post("/api/admin/backups/run", requireSuperAdmin, async (c) => {
  const backup = await backupStep(c.env, new Date(), true);
  if (backup?.status === "running" && c.env.INGEST_QUEUE) { await markBackupChain(c.env); await c.env.INGEST_QUEUE.send({ backup: true }); }
  if (!backup) return c.json({ error: "Backups are paused until production." }, 400);
  await audit(c.env, c.get("user"), "backup_started", {});
  return c.json(backup);
});
app.get("/api/admin/backups/:id/sql", requireSuperAdmin, async (c) => {
  const id = c.req.param("id");
  if (!/^[\w-]+$/.test(id)) return c.json({ error: "Not found" }, 404);
  const stream = await backupAsSql(c.env, id);
  if (!stream) return c.json({ error: "That backup isn't finished or no longer exists." }, 404);
  return new Response(stream, {
    headers: { "Content-Type": "application/sql; charset=utf-8", "Content-Disposition": `attachment; filename="lead-finder-backup-${id}.sql"` },
  });
});

// Activity log (super admin only; their own actions are in it too). Each row has `summary`, a plain
// sentence. from / to (YYYY-MM-DD) with tzo (the browser's getTimezoneOffset) are local days.
app.get("/api/admin/audit", requireSuperAdmin, async (c) => c.json(await listAudit(c.env, new URL(c.req.url).searchParams)));

/** Free tier housekeeping each minute: fail stuck collections, finish saved ones, keep saving going. */
async function freeTick(env: Env) {
  await freeWatchdog(env);
  await freeFinishSweep(env);
  await harvestTick(env);
  // Only when there's something to save today and no saving chain is already running.
  if (await freeSaveDue(env)) await env.INGEST_QUEUE.send({ free: true });
}

/** Website checks, scores and speed each minute (each step does a small slice). */
async function websiteTick(env: Env) {
  await queueNewWebsites(env);
  await scoreStep(env);
  if (new Date().getUTCMinutes() % 10 === 0) await websiteWatchdog(env);
  if (new Date().getUTCMinutes() === 17) await releaseLater(env).catch((err) => console.error("ai-helper: releasing retries failed", err));
  if (new Date().getUTCMinutes() % 5 === 0) await nudgeChecker(env);
  await pageSpeedStep(env);
  await savedSearchAlerts(env);
  await suppressStep(env);
  await emitFinishedSearches(env);
  await deliverWebhooks(env);
  // Once a day: average rating / reviews per business type and city ("above local average").
  await refreshLocalAverages(env);
  // Free email pre-check (domains that can't take mail) in its own queue run: it asks public DNS.
  if (env.INGEST_QUEUE && (await emailDomainsWaiting(env))) await env.INGEST_QUEUE.send({ domains: true }).catch(() => undefined);
  // Email checks run in their own queue run (their own allowance of outside requests).
  // While MillionVerifier refuses (out of credits, bad key), only try again every 30 minutes.
  if ((env as Env & { MILLIONVERIFIER_API_KEY?: string }).MILLIONVERIFIER_API_KEY
    && (await env.DB.prepare(`SELECT 1 AS x FROM email_checks WHERE result = 'queued' LIMIT 1`).first())
    && !(await env.DB.prepare(
      `SELECT 1 AS x FROM app_settings WHERE key = 'millionverifier_problem' AND value <> '' AND updated_at >= datetime('now', '-30 minutes')`,
    ).first())) {
    await env.INGEST_QUEUE.send({ verify: true });
  }
  // AI helper (free Gemini key): a few websites a minute in their own queue run, while switched
  // on, under today's limit, not paused, and businesses are waiting.
  if (env.INGEST_QUEUE && (await aiHelperDue(env as AiEnv))) await env.INGEST_QUEUE.send({ ai: true }).catch(() => undefined);
}

/**
 * Starts a phone-check run when numbers are due (queue message; runs inline if there's no queue).
 * Nothing is sent while retries aren't due yet, checks are paused (retried every 30 minutes),
 * there's no phone-check service, or a run is already going: each message counts against the
 * free plan's daily queue allowance.
 */
async function startPhoneRun(env: Env) {
  const waiting = await env.DB.prepare(
    `SELECT 1 AS x FROM leads WHERE phone_check_requested > 0 AND gbp_phone_formatted IS NOT NULL
       AND (phone_check_requested_at IS NULL OR phone_check_requested_at <= datetime('now')) LIMIT 1`,
  ).first();
  if (!waiting) return;
  const { results } = await env.DB.prepare(
    `SELECT key, value, updated_at >= datetime('now', '-30 minutes') AS recent, updated_at >= datetime('now', '-3 minutes') AS fresh
     FROM app_settings WHERE key IN ('phone_check_status', 'phone_check_lock')`,
  ).all<{ key: string; value: string; recent: number; fresh: number }>();
  const status = results.find((r) => r.key === "phone_check_status");
  const lock = results.find((r) => r.key === "phone_check_lock");
  if (lock?.value && lock.fresh) return; // a run is checking right now
  let state: string | undefined;
  try { state = status?.value ? (JSON.parse(status.value) as { state?: string }).state : undefined; } catch { state = undefined; }
  if (status?.recent && (state === "paused_refused" || state === "paused_budget")) return;
  if (state === "no_service" && !phoneCheckPricing(env).hasService) return;
  if (env.INGEST_QUEUE) await env.INGEST_QUEUE.send({ phones: true });
  else await checkPendingPhones(env);
}

/**
 * Nightly backup: one small file per step (the free plan allows milliseconds of work per run).
 * The minute job starts it; while it's running, each queue step queues the next, so it takes
 * minutes rather than hours. backup_chain_at stops the minute job starting a second chain.
 */
async function backupTick(env: Env) {
  // While the queue is moving the backup along, the minute job leaves it alone: two callers on the same
  // step each count a try, and on a busy night that used up the tries without anything going wrong.
  const last = await env.DB.prepare(`SELECT value FROM app_settings WHERE key = 'backup_chain_at'`).first<string>("value");
  const chainBusy = !!last && Date.parse(last.replace(" ", "T") + "Z") > Date.now() - 3 * 60_000;
  if (chainBusy && env.INGEST_QUEUE) return;
  const b = await backupStep(env);
  if (b?.status !== "running" || !env.INGEST_QUEUE) return;
  await markBackupChain(env);
  await env.INGEST_QUEUE.send({ backup: true });
}
async function markBackupChain(env: Env) {
  await env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES ('backup_chain_at', datetime('now'), datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run();
}

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    // Independent jobs: one failing doesn't skip the others.
    // Phone checks run in their own invocation (a queue message), so they never share this
    // run's allowance of outside requests with pull syncing.
    ctx.waitUntil(
      Promise.allSettled([syncActiveSearches(env), startPhoneRun(env), dailyChecks(env), backupTick(env), trimRawStep(env), freeTick(env), websiteTick(env)]),
    );
  },
  // Queue messages: { searchId } = one saving step of a pull (each step queues the next);
  // { phones: true } = one run of phone checks.
  async queue(batch, env) {
    for (const message of batch.messages) {
      const body = message.body as { searchId?: string; phones?: boolean; force?: boolean; free?: boolean; verify?: boolean; backup?: boolean; domains?: boolean; ai?: boolean };
      try {
        if (body.free) {
          // One slice of free businesses; queue the next straight away while there's more.
          const r = await freeSaveStep(env);
          if (r.more && !r.paused) await env.INGEST_QUEUE.send({ free: true });
        }
        if (body.searchId) await syncSearch(env, body.searchId); // errors are counted on the pull
        if (body.phones) await checkPendingPhones(env, undefined, { force: body.force === true });
        if (body.verify) await verifyStep(env as Env & { MILLIONVERIFIER_API_KEY?: string });
        if (body.domains) await emailDomainStep(env);
        if (body.ai) await aiHelperStep(env as AiEnv);
        if (body.backup) {
          const b = await backupStep(env);
          if (b?.status === "running") { await markBackupChain(env); await env.INGEST_QUEUE.send({ backup: true }); }
        }
      } catch (err) {
        console.error("queue message failed", err);
      }
      message.ack();
    }
  },
} satisfies ExportedHandler<Env>;
