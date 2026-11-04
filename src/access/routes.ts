// Routes for Google Business Profile access requests.
//   Team (signed in):   GET /access (page), /api/access/*
//   Clients (public):   /connect/:slug[/select|/done|/manual], /api/connect/*

import type { Context, Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { User } from "../auth";
import { requireAdmin } from "../auth";
import { audit } from "../ops";
import { agencySettings } from "../report";
import { agencyPageHtml } from "./agency-page";
import { brandFor, donePage, expiredPage, landingPage, manualPage, notFoundPage, selectPage } from "./client-pages";
import { gbpMode, signingSecret, type GbpEnv } from "./config";
import { cookieFor, requestIdFromCookie } from "./crypto";
import { AccessError, agencyOf, createLink, listLinks, listRequests, markLocationAccepted, requestDetail, updateLink, type AccessRequest, type LinkInput, type RequestLink } from "./db";
import { grantedFor, grantForRequest, linkBySlug, listForRequest, markManual, rateLimit, requestFor, startRequest, storedToken, takeToken } from "./flow";
import { GoogleError, mockProvider, NotApprovedError, type GbpProvider } from "./google";
import { emailOn } from "./mail";

type App = Hono<{ Bindings: Env; Variables: { user: User } }>;
type C = Context<{ Bindings: Env; Variables: { user: User } }>;

export const ACCESS_PUBLIC_PATHS = ["/connect/*", "/api/connect/*"];
const COOKIE = "gbp_req";
const ip = (c: C) => c.req.header("CF-Connecting-IP") ?? "local";

const json = async <T>(c: { req: { json: <U>() => Promise<U> } }): Promise<T> =>
  c.req.json<T>().catch(() => {
    throw new AccessError("Body must be JSON");
  });

/** Turns an AccessError into a JSON answer (other errors go to the app's own handler). */
export function accessErrorResponse(err: unknown): Response | null {
  if (!(err instanceof AccessError)) return null;
  return Response.json({ error: err.message }, { status: err.status });
}

/** The team's pages and API (mounted after the sign-in check). */
export function mountAgencyRoutes(app: App) {
  app.get("/access", (c) => (c.get("user").must_change_password ? c.redirect("/login") : c.html(agencyPageHtml)));

  app.get("/api/access/config", async (c) => {
    const env = c.env as GbpEnv;
    return c.json({ mode: gbpMode(env), emailOn: await emailOn(env) });
  });

  app.get("/api/access/links", async (c) => {
    const u = c.get("user");
    return c.json({ links: await listLinks(c.env, agencyOf(u)), canEdit: u.role === "admin" || u.role === "super_admin" });
  });
  app.post("/api/access/links", requireAdmin, async (c) => {
    const u = c.get("user");
    const link = await createLink(c.env, agencyOf(u), await json<LinkInput>(c), u.id);
    await audit(c.env, u, "access_link_created", { title: link.title, slug: link.slug });
    return c.json(link, 201);
  });
  app.patch("/api/access/links/:id", requireAdmin, async (c) => {
    const u = c.get("user");
    const link = await updateLink(c.env, agencyOf(u), c.req.param("id"), await json<LinkInput>(c));
    if (!link) return c.json({ error: "Not found" }, 404);
    await audit(c.env, u, "access_link_changed", { title: link.title, active: !!link.is_active });
    return c.json(link);
  });

  app.get("/api/access/requests", async (c) =>
    c.json(await listRequests(c.env, agencyOf(c.get("user")), { status: c.req.query("status"), linkId: c.req.query("link") })),
  );
  app.get("/api/access/requests/:id", async (c) => {
    const d = await requestDetail(c.env, agencyOf(c.get("user")), c.req.param("id"));
    return d ? c.json(d) : c.json({ error: "Not found" }, 404);
  });
  app.post("/api/access/requests/:id/locations/:loc/accepted", async (c) => {
    const ok = await markLocationAccepted(c.env, agencyOf(c.get("user")), c.req.param("id"), Number(c.req.param("loc")));
    return ok ? c.json({ ok: true }) : c.json({ error: "Not found, or not waiting for an invitation." }, 404);
  });
}

// --- Clients (public) -------------------------------------------------------------------------

/** The link, its brand and this browser's request (from the signed cookie). */
async function context(c: C) {
  const env = c.env as GbpEnv;
  const link = await linkBySlug(env, c.req.param("slug") ?? "");
  if (!link) return null;
  const brand = brandFor(link, (await agencySettings(env)).name);
  const id = await requestIdFromCookie(signingSecret(env), getCookie(c, COOKIE));
  const request = await requestFor(env, link, id);
  return { env, link, brand, request };
}

async function bindBrowser(c: C, env: GbpEnv, requestId: string) {
  setCookie(c, COOKIE, await cookieFor(signingSecret(env), requestId), {
    httpOnly: true, secure: new URL(c.req.url).protocol === "https:", sameSite: "Lax", path: "/", maxAge: 24 * 3600,
  });
}

/** Posts must come from our own pages (a missing Origin is allowed: some browsers leave it out on same-site posts). */
function sameOrigin(c: C) {
  const origin = c.req.header("Origin");
  return !origin || origin === new URL(c.req.url).origin;
}

const noStore = (c: C) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex, nofollow");
};

const FINISHED: AccessRequest["status"][] = ["granted", "partial", "failed", "manual_pending"];

async function formFields(c: C): Promise<{ name?: unknown; email?: unknown }> {
  const raw = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  return { name: raw.name, email: raw.email };
}

/** Mock requests get the sample profiles; live ones talk to Google with the client's sign-in. */
async function providerFor(_env: GbpEnv, request: AccessRequest, _sealedToken: string): Promise<GbpProvider> {
  if (request.mode === "mock") return mockProvider;
  throw new NotApprovedError("live mode isn't available yet");
}

export function mountPublicRoutes(app: App) {
  app.use("/connect/*", async (c, next) => { noStore(c); await next(); });
  app.use("/api/connect/*", async (c, next) => {
    noStore(c);
    if (c.req.method !== "GET" && !sameOrigin(c)) return c.json({ error: "Cross-site request refused" }, 403);
    await next();
  });

  app.get("/connect/:slug", async (c) => {
    const x = await context(c);
    if (!x) return c.html(notFoundPage(), 404);
    return c.html(landingPage(x.link, x.brand, gbpMode(x.env)));
  });

  // "Continue with Google" / "Show me how": a new request, then Google (live), the list (mock) or the guide (manual).
  app.post("/api/connect/:slug/start", async (c) => {
    const x = await context(c);
    if (!x) return c.html(notFoundPage(), 404);
    try {
      await rateLimit(x.env, `start:${ip(c)}`, 20, 10);
      const { request, mode } = await startRequest(x.env, x.link, await formFields(c));
      await bindBrowser(c, x.env, request.id);
      if (mode === "mock") return c.redirect(`/connect/${x.link.slug}/select`, 303);
      return c.redirect(`/connect/${x.link.slug}/manual`, 303);
    } catch (err) {
      if (err instanceof AccessError) return c.html(landingPage(x.link, x.brand, gbpMode(x.env), err.message), err.status);
      throw err;
    }
  });

  app.get("/connect/:slug/select", async (c) => {
    const x = await context(c);
    if (!x) return c.html(notFoundPage(), 404);
    if (x.request && FINISHED.includes(x.request.status)) return c.redirect(`/connect/${x.link.slug}/done`, 303);
    if (!x.request || x.request.status !== "authorized" || !(await storedToken(x.env, x.request.id))) {
      return c.html(expiredPage(x.link, x.brand, "Your Google sign-in for this page has expired (it only lasts an hour, for your safety). Please sign in again."), 410);
    }
    return c.html(selectPage(x.link, x.brand, x.request.client_google_email));
  });

  // The client's accounts and profiles (JSON for the select page).
  app.get("/api/connect/:slug/locations", async (c) => {
    const x = await context(c);
    if (!x) return c.json({ error: "This link isn't active." }, 404);
    await rateLimit(x.env, `list:${ip(c)}`, 30, 10);
    const sealed = x.request && x.request.status === "authorized" ? await storedToken(x.env, x.request.id) : null;
    if (!x.request || !sealed) return c.json({ error: "Your sign-in has expired. Please start again.", redirect: `/connect/${x.link.slug}` }, 410);
    try {
      const accounts = await listForRequest(x.env, x.request, await providerFor(x.env, x.request, sealed));
      return c.json({ accounts });
    } catch (err) {
      if (err instanceof NotApprovedError) {
        await x.env.DB.prepare(`UPDATE access_requests SET error_message = ?, updated_at = datetime('now') WHERE id = ?`)
          .bind("Google hasn't approved API access yet: the client was sent to the manual steps.", x.request.id).run();
        return c.json({ redirect: `/connect/${x.link.slug}/manual?why=api` });
      }
      if (err instanceof GoogleError) return c.json({ error: err.message }, 502);
      throw err;
    }
  });

  // "Grant access": body { locations: ["locations/123", ...] }.
  app.post("/api/connect/:slug/grant", async (c) => {
    const x = await context(c);
    if (!x) return c.json({ error: "This link isn't active." }, 404);
    await rateLimit(x.env, `grant:${ip(c)}`, 10, 10);
    if (x.request && FINISHED.includes(x.request.status)) return c.json({ redirect: `/connect/${x.link.slug}/done` });
    if (!x.request || x.request.status !== "authorized") return c.json({ error: "Your sign-in has expired. Please start again.", redirect: `/connect/${x.link.slug}` }, 410);
    const b = await c.req.json<{ locations?: unknown }>().catch(() => ({}) as { locations?: unknown });
    if (!Array.isArray(b.locations) || !b.locations.length) return c.json({ error: "Tick at least one business profile." }, 400);
    // The token is taken out here (deleted), so a second click can't send everything twice.
    const sealed = await takeToken(x.env, x.request.id);
    if (!sealed) return c.json({ error: "Your sign-in has expired. Please start again.", redirect: `/connect/${x.link.slug}` }, 410);
    try {
      await grantForRequest(x.env, x.link, x.request, b.locations, await providerFor(x.env, x.request, sealed));
    } catch (err) {
      if (err instanceof NotApprovedError) return c.json({ redirect: `/connect/${x.link.slug}/manual?why=api` });
      if (err instanceof AccessError) {
        // Nothing was sent: put the token back so the client can fix their choice.
        await x.env.DB.prepare(`INSERT OR IGNORE INTO oauth_tokens (request_id, refresh_token_encrypted, expires_at) VALUES (?, ?, datetime('now', '+15 minutes'))`)
          .bind(x.request.id, sealed).run();
        return c.json({ error: err.message }, err.status);
      }
      throw err;
    }
    return c.json({ redirect: `/connect/${x.link.slug}/done` });
  });

  app.get("/connect/:slug/done", async (c) => {
    const x = await context(c);
    if (!x) return c.html(notFoundPage(), 404);
    if (!x.request || !FINISHED.includes(x.request.status)) return c.redirect(`/connect/${x.link.slug}`, 303);
    return c.html(donePage(x.link, x.brand, await grantedFor(x.env, x.request.id), x.request.status === "manual_pending"));
  });

  app.get("/connect/:slug/manual", async (c) => {
    const x = await context(c);
    if (!x) return c.html(notFoundPage(), 404);
    return c.html(manualPage(x.link, x.brand, { hasRequest: !!x.request && !FINISHED.includes(x.request.status), reason: c.req.query("why") }));
  });

  // "I've added you".
  app.post("/api/connect/:slug/manual", async (c) => {
    const x = await context(c);
    if (!x) return c.html(notFoundPage(), 404);
    const current = x.request && !FINISHED.includes(x.request.status) ? x.request : null;
    try {
      await rateLimit(x.env, `manual:${ip(c)}`, 10, 10);
      const r = await markManual(x.env, x.link, current, await formFields(c));
      await bindBrowser(c, x.env, r.id);
      return c.redirect(`/connect/${x.link.slug}/done`, 303);
    } catch (err) {
      if (err instanceof AccessError) return c.html(manualPage(x.link, x.brand, { hasRequest: !!current, error: err.message }), err.status);
      throw err;
    }
  });
}
