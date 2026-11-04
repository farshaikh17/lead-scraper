// Client access app: only the public pages clients open (/connect/...), on its own address
// (e.g. https://access.mianrosystems.com). Separate Worker, deployed with
//   npx wrangler deploy -c wrangler.access.jsonc
// It shares the database with Lead Finder, where the team makes links and sees requests.
// Nothing else of Lead Finder is reachable here: no sign-in, no leads, no team pages.

import { Hono } from "hono";
import type { User } from "../auth";
import { dropExpiredTokens } from "./flow";
import { accessErrorResponse, connectHeaders, mountPublicRoutes } from "./routes";
import { notFoundPage } from "./client-pages";

const app = new Hono<{ Bindings: Env; Variables: { user: User } }>();

app.onError((err, c) => {
  const accessErr = accessErrorResponse(err);
  if (accessErr) return accessErr;
  console.error("client access error", err instanceof Error ? err.message : "unknown");
  if (new URL(c.req.url).pathname.startsWith("/api/")) return c.json({ error: "Something went wrong on our side. Try again in a minute." }, 500);
  return c.html(notFoundPage("Something went wrong on our side. Please try again in a minute."), 500);
});

app.use("*", connectHeaders);
mountPublicRoutes(app);

app.get("/robots.txt", (c) => c.text("User-agent: *\nDisallow: /\n"));
app.all("*", (c) => {
  c.header("X-Robots-Tag", "noindex, nofollow");
  return c.html(notFoundPage(), 404);
});

export default {
  fetch: app.fetch,
  // Sign-ins nobody finished: their stored token is deleted after an hour (Lead Finder does this too).
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(dropExpiredTokens(env).catch(() => console.error("client access: token clean-up failed")));
  },
} satisfies ExportedHandler<Env>;
