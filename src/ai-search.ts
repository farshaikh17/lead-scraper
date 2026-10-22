// Plain-English search: "roofers in Tampa with no website and under 20 reviews" becomes the
// Database filters. Claude reads the sentence and returns filter settings in a fixed shape
// (structured output); the app checks them and the page applies them to the filter chips, so
// the team can see and adjust exactly what was understood. About 1-2 cents a search, counted
// toward the monthly budget. Needs ANTHROPIC_API_KEY (added in the final week).

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { monthSpend } from "./ops";
import { ValidationError } from "./pipeline";
import { SITE_PROBLEMS } from "./leads";

const MODEL = "claude-opus-5-5";
// Claude Opus 5.5 list prices, dollars per token (for the budget).
const INPUT_USD = 4 / 1_000_000;
const OUTPUT_USD = 20 / 1_000_000;

const Filters = z.object({
  categories: z.array(z.string()),
  states: z.array(z.string()),
  cities: z.array(z.object({ city: z.string(), state: z.string() })),
  near: z.object({ city: z.string(), state: z.string(), miles: z.number() }).nullable(),
  website: z.enum(["any", "yes", "no", "no_real", "social"]),
  phone: z.enum(["any", "yes", "no"]),
  phoneTypes: z.array(z.enum(["mobile", "landline", "voip", "toll_free"])),
  email: z.enum(["any", "yes", "no", "personal"]),
  owner: z.enum(["any", "yes", "no"]),
  chain: z.enum(["any", "hide", "only"]),
  minRating: z.number().nullable(),
  maxRating: z.number().nullable(),
  minReviews: z.number().nullable(),
  maxReviews: z.number().nullable(),
  scoreBands: z.array(z.enum(["weak", "basic", "good", "strong"])),
  siteChecks: z.array(z.enum(["works", "broken", "blocked", "not_checked"])),
  siteProblems: z.array(z.string()),
  ads: z.array(z.enum(["google_ads", "bing_ads", "meta_pixel", "call_tracking", "none"])),
  builders: z.array(z.enum(["wordpress", "wix", "squarespace", "shopify", "godaddy", "weebly", "duda", "webflow", "highlevel", "other"])),
  addedWithinDays: z.number().nullable(),
  nameContains: z.string().nullable(),
  summary: z.string(),
  notUnderstood: z.string().nullable(),
});
export type AiFilters = z.infer<typeof Filters>;

// JSON Schema for structured output (every field required; "any" / null / [] = no filter).
const str = { type: "string" };
const nullableNum = { type: ["number", "null"] };
const arr = (items: object) => ({ type: "array", items });
const en = (...values: string[]) => ({ type: "string", enum: values });
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["categories", "states", "cities", "near", "website", "phone", "phoneTypes", "email", "owner", "chain", "minRating", "maxRating",
    "minReviews", "maxReviews", "scoreBands", "siteChecks", "siteProblems", "ads", "builders", "addedWithinDays", "nameContains", "summary", "notUnderstood"],
  properties: {
    categories: arr(str),
    states: arr(str),
    cities: arr({ type: "object", additionalProperties: false, required: ["city", "state"], properties: { city: str, state: str } }),
    near: { anyOf: [{ type: "object", additionalProperties: false, required: ["city", "state", "miles"], properties: { city: str, state: str, miles: { type: "number" } } }, { type: "null" }] },
    website: en("any", "yes", "no", "no_real", "social"),
    phone: en("any", "yes", "no"),
    phoneTypes: arr(en("mobile", "landline", "voip", "toll_free")),
    email: en("any", "yes", "no", "personal"),
    owner: en("any", "yes", "no"),
    chain: en("any", "hide", "only"),
    minRating: nullableNum, maxRating: nullableNum, minReviews: nullableNum, maxReviews: nullableNum,
    scoreBands: arr(en("weak", "basic", "good", "strong")),
    siteChecks: arr(en("works", "broken", "blocked", "not_checked")),
    siteProblems: arr(en(...Object.keys(SITE_PROBLEMS))),
    ads: arr(en("google_ads", "bing_ads", "meta_pixel", "call_tracking", "none")),
    builders: arr(en("wordpress", "wix", "squarespace", "shopify", "godaddy", "weebly", "duda", "webflow", "highlevel", "other")),
    addedWithinDays: nullableNum,
    nameContains: { type: ["string", "null"] },
    summary: str,
    notUnderstood: { type: ["string", "null"] },
  },
};

const INSTRUCTIONS = `You turn a sales rep's request into filters for a database of US local businesses (collected from Google Maps and open map data) that a marketing agency sells websites, ads and online-presence services to.

Fill every field. Use "any", null or an empty list for anything the request doesn't ask about; don't add filters the rep didn't ask for.
- categories: business types, copied exactly from the list below (pick every type that fits, e.g. "HVAC" means all the heating / air conditioning types in the list). Empty when no type is named.
- states: two-letter US codes. cities: the city name as people write it, with its two-letter state. For "near X" / "within N miles of X" use near (miles defaults to 10) instead of cities.
- website: "no" = no website at all; "no_real" = no real website (none, or only a Facebook / directory page) - use "no_real" when someone says "no website" or "needs a website"; "social" = only a Facebook / directory page; "yes" = has a real website.
- scoreBands: the overall online-presence score (weak 0-39 = the most to fix, basic 40-59, good 60-79, strong 80+). "Bad online presence" / "needs help" = ["weak"] or ["weak","basic"].
- siteProblems (checked websites only): no_booking, no_form, no_tracking (no Meta pixel or Google tag), no_meta_pixel, no_https, not_mobile, outdated (copyright 3+ years old), no_chat, slow.
- siteChecks: "broken" = website doesn't load; "works"; "blocked"; "not_checked".
- ads: google_ads / bing_ads / meta_pixel / call_tracking = signs they pay for ads; "none" = no advertising signs.
- email "personal" = a person's own email, not info@ or Gmail. owner "yes" = we know the owner's name. chain "hide" = independent businesses only.
- minReviews / maxReviews: whole numbers ("under 20 reviews" = maxReviews 19). addedWithinDays: "new this week" = 7.
- summary: one short plain sentence of what you applied, e.g. "Roofers in Tampa, FL with no real website and fewer than 20 reviews."
- notUnderstood: anything in the request you couldn't turn into a filter (null if everything was used).`;

export interface AiSearchResult {
  params: Record<string, string | string[]>;
  summary: string;
  notUnderstood: string | null;
  costUsd: number;
}

/** Turns the model's filters into the same query parameters the Database page uses. */
export function filtersToParams(f: AiFilters, knownCategories: string[], today = new Date()): { params: Record<string, string | string[]>; dropped: string[] } {
  const byLower = new Map(knownCategories.map((c) => [c.toLowerCase(), c]));
  const cats = f.categories.map((c) => byLower.get(c.trim().toLowerCase())).filter((c): c is string => !!c);
  const dropped = f.categories.filter((c) => !byLower.has(c.trim().toLowerCase()));
  const st = (s: string) => s.trim().toUpperCase().slice(0, 2);
  const p: Record<string, string | string[]> = {};
  const list = (key: string, values: string[]) => { if (values.length) p[key] = [...new Set(values)]; };
  list("category", cats);
  list("state", f.states.map(st).filter((s) => /^[A-Z]{2}$/.test(s)));
  list("city", f.cities.filter((c) => c.city.trim()).map((c) => `${c.city.trim()}|${st(c.state)}`));
  if (f.near && f.near.city.trim()) {
    p.near = `${f.near.city.trim()}|${st(f.near.state)}`;
    p.radius_miles = String([1, 5, 10, 25, 50].reduce((best, m) => (Math.abs(m - f.near!.miles) < Math.abs(best - f.near!.miles) ? m : best), 10));
  }
  if (f.website !== "any") p.website = f.website;
  if (f.phone !== "any") p.phone = f.phone;
  list("phone_type", f.phoneTypes);
  if (f.email !== "any") p.email = f.email;
  if (f.owner !== "any") p.owner = f.owner;
  if (f.chain !== "any") p.chain = f.chain;
  const num = (v: number | null, lo: number, hi: number) => (v != null && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
  const minR = num(f.minRating, 1, 5), maxR = num(f.maxRating, 1, 5), minRev = num(f.minReviews, 0, 1e6), maxRev = num(f.maxReviews, 0, 1e6);
  if (minR != null) p.min_rating = String(minR);
  if (maxR != null) p.max_rating = String(maxR);
  if (minRev != null) p.min_reviews = String(Math.round(minRev));
  if (maxRev != null) p.max_reviews = String(Math.round(maxRev));
  list("score", f.scoreBands);
  list("site_check", f.siteChecks);
  list("site_problem", f.siteProblems.filter((x) => x in SITE_PROBLEMS));
  list("ads", f.ads);
  list("builder", f.builders);
  const days = num(f.addedWithinDays, 1, 3650);
  if (days != null) p.added_from = new Date(today.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  if (f.nameContains?.trim()) p.q = f.nameContains.trim().slice(0, 80);
  return { params: p, dropped };
}

export async function aiSearch(env: Env & { ANTHROPIC_API_KEY?: string }, text: string, userId: string | null): Promise<AiSearchResult> {
  const request = (text ?? "").trim().slice(0, 500);
  if (!request) throw new ValidationError("Describe what you're looking for first.");
  if (!env.ANTHROPIC_API_KEY) throw new ValidationError("Plain-English search needs the AI key (ANTHROPIC_API_KEY). It's added with the other keys in the final week.");
  if ((await monthSpend(env)).left < 0.05) throw new ValidationError("This month’s budget for paid services is used up or set to $0, so plain-English search is paused. The super admin can change it on the Admin page.");

  const { results } = await env.DB.prepare(
    `SELECT gbp_category AS c FROM leads WHERE gbp_category IS NOT NULL GROUP BY gbp_category ORDER BY COUNT(*) DESC LIMIT 400`,
  ).all<{ c: string }>();
  const categories = results.map((r) => r.c);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // If a safety check declines the request, Anthropic re-runs it on its recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: `${INSTRUCTIONS}\n\nBusiness types in the database:\n${categories.join("\n")}`,
      messages: [{ role: "user", content: request }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new ValidationError("The AI is busy right now. Try again in a minute.");
    if (err instanceof Anthropic.AuthenticationError) throw new ValidationError("The AI key isn't valid. Check ANTHROPIC_API_KEY.");
    if (err instanceof Anthropic.APIError) throw new ValidationError(`The AI couldn't answer (${err.status ?? "error"}). Try again, or use the filters.`);
    throw err;
  }

  const u = response.usage;
  const costUsd = ((u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1) * INPUT_USD + (u.output_tokens ?? 0) * OUTPUT_USD;
  await env.DB.prepare(`INSERT INTO spend_log (kind, amount_usd, user_id) VALUES ('ai_search', ?, ?)`).bind(costUsd, userId).run();

  if (response.stop_reason === "refusal") throw new ValidationError("The AI declined that request. Try wording it as business types, places and filters.");
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new ValidationError("The AI didn't return filters. Try again, or use the filters.");
  let parsed: AiFilters;
  try {
    parsed = Filters.parse(JSON.parse(textBlock.text));
  } catch {
    throw new ValidationError("The AI's answer couldn't be read. Try again, or use the filters.");
  }
  const { params, dropped } = filtersToParams(parsed, categories);
  const notes = [parsed.notUnderstood, dropped.length ? `No businesses of type ${dropped.join(", ")} in the database yet` : null].filter(Boolean);
  return { params, summary: parsed.summary, notUnderstood: notes.length ? notes.join(". ") : null, costUsd };
}
