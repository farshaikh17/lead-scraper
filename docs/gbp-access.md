# Client access (Google Business Profile access requests)

The team makes a link on **Client access** (`/access`, tab in the header). A client opens
`/connect/<link>`, signs in with Google, ticks the business profiles to share, and the link's Google
account is invited as a **Manager** (or **Owner**) on each one. The team sees each request on the same
page (filter by status, details per request), gets a line in the notification bell, and an email when
emails are set up. The client gets a short confirmation email.

## What Google does (checked against Google's reference on 2026-11-03)

| Step | Call |
| --- | --- |
| Accounts | `GET https://mybusinessaccountmanagement.googleapis.com/v1/accounts` (max 20 per page) |
| Profiles | `GET https://mybusinessbusinessinformation.googleapis.com/v1/{account}/locations?readMask=name,title,storefrontAddress` (max 100 per page) |
| Invite | `POST https://mybusinessaccountmanagement.googleapis.com/v1/{location}/admins` with `{ "admin": "<email>", "role": "MANAGER" or "OWNER" }` |

- `locations.admins.create` **sends an invitation**. The agency's Google account only has access after
  accepting it (from Google's email or at business.google.com). So a profile shows **Invitation waiting**
  (`pending_invite`) until someone on the team presses **I accepted it** on the request.
- A 409 (already invited / already an admin) is also shown as waiting, with a note.
- Only owners can invite people; a client who is only a manager gets a clear "ask the owner" failure per profile.
- Until Google approves the Cloud project for the Business Profile APIs, its quota is **0 requests a
  minute**. A 403 when listing, Google's "API not enabled" errors, or a zero-quota 429 send the client to the
  manual steps instead of an error. Other 429s are retried (Retry-After, else 1 s, 2 s, 4 s).

## Request statuses

| Status | Meaning |
| --- | --- |
| `opened` | The client pressed Continue but didn't finish signing in |
| `authorized` | Signed in with Google, choosing profiles |
| `granted` | Every chosen profile got an invitation (or already had access) |
| `partial` | Some did, some failed |
| `failed` | None went through |
| `manual_pending` | The client pressed "I've added you" on the manual guide: check Business Profile |

Each profile: `pending_invite` → `granted` (after "I accepted it"), or `failed` with the reason.

## Modes (`GBP_MODE`)

- `mock`: sample accounts and profiles, sample results (one already shared, one failure). Nothing is sent to Google. For trying the pages.
- `manual` (default): no Google sign-in; the client gets the step-by-step guide and an "I've added you" button.
- `live`: Google sign-in and automatic invitations. Needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `TOKEN_ENC_KEY` and `STATE_SIGNING_SECRET`; if any is missing it behaves as `manual`.

## Security

- The client's refresh token is stored AES-256-GCM encrypted (`TOKEN_ENC_KEY`), only while they choose
  profiles: it's deleted when they press Grant access (before anything is sent), revoked at Google
  afterwards, and any left over is deleted by the minute job after an hour.
- The OAuth state is signed (`STATE_SIGNING_SECRET`), expires after 10 minutes and must match the
  browser's signed cookie; PKCE (S256) on top. The Business Profile permission is checked on return.
- Tokens and secrets are never logged or sent to the browser. Client pages and API are rate-limited per
  network (start 20, list 30, grant 10, manual 10, callback 20 per 10 minutes) and refuse cross-site posts.
- Every query is scoped to one agency (`agency_id`, today always `main`).

## Where it runs

- **Lead Finder** (the team's app, behind its sign-in): the Client access page where links are made and
  requests are seen.
- **client-access** (`wrangler.access.jsonc`, `src/access/worker.ts`): a separate, public Worker with only
  the client pages (`/connect/...`, `/api/connect/...`), on its own address such as
  `https://access.mianrosystems.com`. Same database. It has no sign-in and nothing else of Lead Finder, so it
  needs no Cloudflare Access bypass. Released with the others by `.github/workflows/deploy.yml`.

Connect the two with `CLIENT_ACCESS_URL` on Lead Finder (links are shown with that address; its own
`/connect/...` redirects there; the Client access page shows the client app's mode) and `LEAD_FINDER_URL` on
client-access (the button in emails). The Google settings and `STATE_SIGNING_SECRET` go on **client-access**.
Without `CLIENT_ACCESS_URL`, Lead Finder serves the client pages itself, as before.

### The address on mianrosystems.com

A Worker custom domain needs the domain's DNS on Cloudflare. Pick one:

- **mianrosystems.com's DNS is already on Cloudflare**: Workers & Pages → client-access → Settings →
  Domains & Routes → Add → Custom domain → `access.mianrosystems.com`. Cloudflare makes the DNS record and
  the certificate. Nothing else on the domain changes.
- **DNS is somewhere else (registrar, GoHighLevel)**: add the domain to Cloudflare (Add a site, free plan),
  check that every existing record was copied (especially the GoHighLevel website and email records), then
  change the nameservers at the registrar. Then add the custom domain as above. The main website keeps
  pointing at GoHighLevel; only `access.` points at the Worker.

## Setup

1. Apply the migration: `npm run db:migrate:remote` (adds `migrations/0035_gbp_access.sql`).
2. Google Cloud (console.cloud.google.com), one project:
   1. **APIs & Services → Library**: enable **My Business Account Management API** and **My Business
      Business Information API** (the ones this feature calls). Google's setup guide also lists Google My
      Business API, My Business Notifications, Verifications, Lodging and Place Actions APIs; they aren't used here.
   2. **Request API access**: Google's form at https://support.google.com/business/contact/api_default
      ("Application for Basic API Access"). Until approved the quota is 0 and clients get the manual steps.
      Approval shows as a non-zero quota under APIs & Services → the API → Quotas.
   3. **OAuth consent screen** (Google Auth Platform → Branding / Audience / Data access): app name and
      support email, your domain under authorized domains, privacy policy link, user type **External**.
      Scopes: `openid`, `.../auth/userinfo.email` and `https://www.googleapis.com/auth/business.manage`.
      Publishing the app for any Google user can need Google's app verification for this scope (the console
      says so when you add it). While the app is in **Testing**, only the test users you add can sign in.
   4. **Credentials → Create credentials → OAuth client ID → Web application**. Authorized redirect URI:
      `https://access.mianrosystems.com/api/connect/oauth/callback` (the client-access address; and
      `http://localhost:8789/api/connect/oauth/callback` for local testing). Add `mianrosystems.com` under
      authorized domains on the consent screen.
3. Secrets on **client-access** (run each, paste the value when asked):

   ```bash
   npx wrangler secret put STATE_SIGNING_SECRET -c wrangler.access.jsonc  # any long random text (set this first, in every mode)
   npx wrangler secret put GBP_MODE -c wrangler.access.jsonc              # manual now; live once Google approves
   npx wrangler secret put LEAD_FINDER_URL -c wrangler.access.jsonc       # Lead Finder's https address
   npx wrangler secret put GOOGLE_CLIENT_ID -c wrangler.access.jsonc
   npx wrangler secret put GOOGLE_CLIENT_SECRET -c wrangler.access.jsonc
   npx wrangler secret put TOKEN_ENC_KEY -c wrangler.access.jsonc         # 64 hex characters: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   npx wrangler secret put RESEND_API_KEY -c wrangler.access.jsonc        # emails (optional)
   npx wrangler secret put GBP_EMAIL_FROM -c wrangler.access.jsonc        # e.g. Mianro Systems <hello@mianrosystems.com> (verified in Resend)
   ```

   And on Lead Finder: `npx wrangler secret put CLIENT_ACCESS_URL` → `https://access.mianrosystems.com`.
   Without it a fixed development value signs the cookies, so never skip `STATE_SIGNING_SECRET`.
4. Only if you serve the client pages from Lead Finder itself (no `CLIENT_ACCESS_URL`) and Lead Finder is
   behind Cloudflare Access: add a bypass for `/connect/*` and `/api/connect/*`.
5. Set the agency name (and email, for notifications) on the Admin page under "Your agency (shown on reports)"; links can
   override the notification email and add a logo (https) and colour.
