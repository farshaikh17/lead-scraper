// Routes for Google Business Profile access requests.
//   Team (signed in):   GET /access (page), /api/access/*
//   Clients (public):   /connect/:slug[/select|/done|/manual], /api/connect/*

import type { Hono } from "hono";
import type { User } from "../auth";
import { requireAdmin } from "../auth";
import { audit } from "../ops";
import { agencyPageHtml } from "./agency-page";
import { gbpMode, type GbpEnv } from "./config";
import { AccessError, agencyOf, createLink, listLinks, listRequests, markLocationAccepted, requestDetail, updateLink, type LinkInput } from "./db";
import { emailOn } from "./mail";

type App = Hono<{ Bindings: Env; Variables: { user: User } }>;

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
