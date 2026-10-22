# Lead Scraper / Lead Finder

**A company-owned lead operations platform: collection, enrichment, qualification, CRM handoff, and a separate customer-facing Lead Store.**

Developed for Mianro Systems and maintained in its repository. This overview describes the system; repository account activity alone does not establish any individual’s authorship or delivery role.

## Problem and product

Lead collection produces operational work beyond a list of businesses: duplicate records, incomplete contact details, changing source data, enrichment costs, and handoffs into a CRM. This project brings those steps into a shared workflow with search history, team access, lead scoring, exports, and suppression controls.

The original Apify-based Google Business Profile scraper has expanded into Lead Finder and Lead Store. Recent repository history includes free-data collection, website checks, registry lookups, saved searches, API/webhook integrations, and a credit-based customer interface. Code availability does not certify that every integration is enabled in production.

## Architecture

```text
Team users -> Lead Finder Worker (Hono / TypeScript)
                         |
           collection / enrichment / scoring
                         |
                     Shared D1
                         |
Customers -> separate Lead Store Worker

Scheduled and queued jobs support background work
GitHub Actions supports collection and website checks
```

**Stack:** TypeScript, Hono, Zod, Cloudflare Workers and D1, Apify, provider integrations, Python collection scripts, Vitest, and Wrangler.

## Selected decisions

- **Separate source refresh from CRM state:** the Google ingestion flow updates source fields without replacing enrichment and operational status.
- **Track work and spend:** searches, budget controls, resumable processing, and background jobs make collection an operational process rather than a one-off download.
- **Separate internal and customer interfaces:** Lead Store has its own Worker configuration while sharing the lead database.
- **Control eligibility:** suppression and customer-unlock logic distinguish usable leads from records that should not be exposed or contacted. These controls need validation against the intended operating policy.
- **Authenticate team access:** `src/auth.ts` implements password hashing, cookie sessions, roles, and sign-in limits; the original no-login description is obsolete.

## Repository guide

| Location | Responsibility |
| --- | --- |
| `src/index.ts` | Internal application routing and orchestration |
| `src/pipeline.ts`, `src/apify.ts`, `src/free.ts` | Collection and ingestion |
| `src/website-audit.ts`, `src/registry.ts`, `src/phone.ts`, `src/email-verify.ts` | Enrichment and checks |
| `src/scoring.ts`, `src/crm.ts`, `src/suppress.ts` | Qualification, CRM state and suppression |
| `src/auth.ts` | Team authentication and roles |
| `src/store/` | Customer-facing Lead Store |
| `migrations/`, `test/`, `docs/` | Schema changes, tests and operational documentation |
| `wrangler.jsonc`, `wrangler.store.jsonc` | Separate Worker configurations |

## Status, outcomes and demo scope

The repository demonstrates a progression from scraper to lead operations platform. Revenue, conversion lift, hours saved, and current production reliability have not been established by this documentation review, so no such outcomes are claimed. Recent commit history describes card payments as later work and legal pages as drafts; confirm readiness before presenting the store as a completed commercial service.

For a walkthrough, use synthetic leads to show search → enrichment status → qualification → CRM handoff, then explain the separate customer unlock flow. Do not export real leads, customer records, internal credentials, or company datasets for a portfolio. Screenshots should use an approved test environment.

## Local development


```bash
npm install
cp .dev.vars.example .dev.vars      # add APIFY_API_TOKEN, or set APIFY_MOCK=1 to use the fixture dataset
npm run db:migrate:local
npm run dev                          # http://127.0.0.1:8787
```


The following examples document the original Google ingestion API. Current routes require authorized authentication; unauthenticated requests are not a complete smoke test. Use a local mock dataset and test account. After starting a search, synchronize it (or exercise the scheduled handler):


```bash
curl -X POST localhost:8787/api/search -H "content-type: application/json" \
  -d '{"category":"plumbers","city":"Orlando, FL"}'
curl -X POST localhost:8787/api/searches/<id>/sync
curl "localhost:8787/api/leads?search_id=<id>"
```


`POST /api/search` body: `category`, `city` (e.g. `"Orlando, FL"`), optional `state`, `maxResults`
(default 500; above that needs `"allowLarge": true`, hard ceiling 10,000), `sourceCode` (default `ILS`),
`skipPhoneLookup`.


## How a search flows


1. `POST /api/search` inserts a `searches` row and starts the Apify actor run (`status = scraping`).
2. A cron trigger every minute (or `POST /api/searches/:id/sync`) polls the run. On success it
   ingests the dataset: only claimed/verified, not-permanently-closed places are kept, upserted
   into `leads` on `google_place_id`. Re-scrapes refresh Google fields but never touch enrichment,
   status, source code or first-seen dates. `search_leads` records which searches surfaced each lead.
3. Apify spend for the run is stored in `searches.cost_apify`.


## Deploy


```bash
npx wrangler d1 create lead-scraper-db   # put the id into wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put APIFY_API_TOKEN
npm run deploy
```


The current internal Worker includes team sign-in and role checks (`src/auth.ts`, `src/index.ts`). Cloudflare Access can be an additional perimeter control; it is not a substitute for testing application authorization. The commands above cover the original internal Worker only. Lead Store uses `wrangler.store.jsonc`; review its configuration, migrations, customer access, and provider settings separately before deploying.


## Tests


```bash
npm test
npm run typecheck
```

