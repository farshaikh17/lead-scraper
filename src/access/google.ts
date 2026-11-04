// Talking to Google Business Profile (or pretending to, in mock mode).
//
// From Google's reference (checked 2026-11-03):
//   accounts.list            GET  https://mybusinessaccountmanagement.googleapis.com/v1/accounts          (pageSize max 20)
//   accounts.locations.list  GET  https://mybusinessbusinessinformation.googleapis.com/v1/{account}/locations
//                                 (readMask required, pageSize max 100)
//   locations.admins.create  POST https://mybusinessaccountmanagement.googleapis.com/v1/{location}/admins
//                                 body { admin: "<email>", role: "MANAGER" | "OWNER" }
// admins.create *invites* the person: they get access only after accepting, so a successful call is
// "pending_invite" (Admin.pendingInvitation = true), not "granted". Until Google approves the Cloud
// project for the Business Profile APIs its quota is 0 requests a minute, so calls are refused.

import type { GbpEnv } from "./config";
import type { AccessLevel, LocationStatus } from "./db";
import { accessToken } from "./oauth";

export const ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
export const LOCATIONS_URL = (account: string) => `https://mybusinessbusinessinformation.googleapis.com/v1/${account}/locations`;
export const ADMINS_URL = (location: string) => `https://mybusinessaccountmanagement.googleapis.com/v1/${location}/admins`;
const READ_MASK = "name,title,storefrontAddress";
// Bounds, so one client with a huge account can't run the Worker out of outside requests.
const MAX_ACCOUNTS = 100, MAX_LOCATIONS = 1000, MAX_PAGES = 60;

export interface GbpLocation { name: string; title: string; address: string }
export interface GbpAccount { name: string; accountName: string; type: string; locations: GbpLocation[] }
export interface InviteResult { status: LocationStatus; error?: string }

/** Google refused because the project isn't approved / the API isn't switched on: use the manual guide. */
export class NotApprovedError extends Error {}
/** Any other problem reading from Google (shown to the client in plain words). */
export class GoogleError extends Error {
  constructor(message: string, public httpStatus = 0) {
    super(message);
  }
}

export interface GbpProvider {
  listAccounts(): Promise<GbpAccount[]>;
  invite(locationName: string, email: string, level: AccessLevel): Promise<InviteResult>;
}

export const roleFor = (level: AccessLevel) => (level === "owner" ? "OWNER" : "MANAGER");

// --- Mock mode: sample profiles, and a sample of each kind of result -----------------------------

export const MOCK_GOOGLE_EMAIL = "sample.client@example.com";

export const MOCK_ACCOUNTS: GbpAccount[] = [
  {
    name: "accounts/1000001", accountName: "Sample Bakery (personal account)", type: "PERSONAL",
    locations: [
      { name: "locations/2000001", title: "Sample Bakery – Main Street", address: "12 Main St, Springfield, IL 62701" },
      { name: "locations/2000002", title: "Sample Bakery – Riverside (already shared)", address: "88 River Rd, Springfield, IL 62702" },
    ],
  },
  {
    name: "accounts/1000002", accountName: "Sample Group (business account)", type: "LOCATION_GROUP",
    locations: [
      { name: "locations/2000003", title: "Sample Catering", address: "5 Market Sq, Springfield, IL 62703" },
      { name: "locations/2000004", title: "Sample Pop-up (fails in test mode)", address: "" },
    ],
  },
];

export const mockProvider: GbpProvider = {
  async listAccounts() {
    return structuredClone(MOCK_ACCOUNTS);
  },
  async invite(locationName) {
    if (locationName === "locations/2000002") return { status: "granted" };
    if (locationName === "locations/2000004") return { status: "failed", error: "Google refused this one (a sample failure in test mode)." };
    return { status: "pending_invite" };
  },
};

// --- Live mode -------------------------------------------------------------------------------

type Fetcher = typeof fetch;
type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

interface GoogleErrorBody { error?: { code?: number; message?: string; status?: string; details?: { reason?: string; metadata?: Record<string, string> }[] } }

/** True when Google says the project can't use this API yet (not approved, not switched on, or 0 quota). */
export function looksNotApproved(status: number, body: GoogleErrorBody): boolean {
  const e = body.error ?? {};
  const text = `${e.status ?? ""} ${e.message ?? ""} ${(e.details ?? []).map((d) => `${d.reason ?? ""} ${Object.values(d.metadata ?? {}).join(" ")}`).join(" ")}`;
  if (status === 403) return true; // listing your own accounts is only refused at project level
  // Before approval the quota is 0 a minute: Google's error says so in its quota details.
  if (status === 429) return (e.details ?? []).some((d) => d.metadata?.quota_limit_value === "0");
  return /SERVICE_DISABLED|accessNotConfigured|has not been used in project|is disabled/i.test(text);
}

/** Back-off before retry `attempt` (1, 2, 3): Retry-After when Google gives one (at most 10 s), else 1 s, 2 s, 4 s. */
export function backoffMs(attempt: number, retryAfter: string | null): number {
  const s = Number(retryAfter);
  if (retryAfter && Number.isFinite(s) && s >= 0) return Math.min(s, 10) * 1000;
  return 1000 * 2 ** (attempt - 1);
}

/**
 * One call to Google with the client's access token. 429 and 503 are retried up to 3 times with
 * back-off. Returns the status and the parsed body; never logs tokens.
 */
export async function googleCall(url: string, init: RequestInit, token: string, fetcher: Fetcher = fetch, sleep: Sleep = realSleep): Promise<{ status: number; body: unknown }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetcher(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, Accept: "application/json" } }).catch(() => null);
    if (!res) {
      if (attempt < 3) { await sleep(backoffMs(attempt + 1, null)); continue; }
      return { status: 0, body: {} };
    }
    const body = await res.json().catch(() => ({}));
    if ((res.status === 429 || res.status === 503) && attempt < 3 && !looksNotApproved(res.status, body as GoogleErrorBody)) {
      await sleep(backoffMs(attempt + 1, res.headers.get("Retry-After")));
      continue;
    }
    return { status: res.status, body };
  }
}

const googleMessage = (body: unknown) => String((body as GoogleErrorBody)?.error?.message ?? "").slice(0, 200);

function listError(what: string, status: number, body: unknown): Error {
  console.error(`gbp google: ${what} failed`, status, (body as GoogleErrorBody)?.error?.status ?? "");
  if (looksNotApproved(status, body as GoogleErrorBody)) return new NotApprovedError(`${what}: ${status}`);
  if (status === 401) return new GoogleError("Your Google sign-in has expired. Please start again.", 401);
  if (status === 429) return new GoogleError("Google is busy right now. Please wait a minute and reload the page.", 429);
  return new GoogleError(`Google couldn't list your business profiles just now (error ${status || "no answer"}). Please reload the page to try again.`, status);
}

export function formatAddress(a: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string } | undefined): string {
  if (!a) return "";
  const cityLine = [a.locality, [a.administrativeArea, a.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [...(a.addressLines ?? []), cityLine].filter(Boolean).join(", ");
}

/** Every page of a Google list, up to the bounds above. */
async function allPages<T>(base: string, key: string, token: string, what: string, fetcher: Fetcher, sleep: Sleep, cap: number): Promise<T[]> {
  const out: T[] = [];
  let pageToken = "";
  for (let page = 0; page < MAX_PAGES && out.length < cap; page++) {
    const u = new URL(base);
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const { status, body } = await googleCall(u.toString(), { method: "GET" }, token, fetcher, sleep);
    if (status !== 200) throw listError(what, status, body);
    const b = body as Record<string, unknown>;
    out.push(...((b[key] as T[] | undefined) ?? []));
    pageToken = String(b.nextPageToken ?? "");
    if (!pageToken) break;
  }
  return out.slice(0, cap);
}

/** The live provider for one client, from their (decrypted) refresh token. */
export function liveProvider(env: GbpEnv, refreshToken: string, fetcher: Fetcher = fetch, sleep: Sleep = realSleep): GbpProvider & { token(): Promise<string> } {
  let token: Promise<string> | null = null;
  const getToken = () => (token ??= accessToken(env, refreshToken, fetcher));
  return {
    token: getToken,
    async listAccounts() {
      const t = await getToken();
      const accounts = await allPages<{ name: string; accountName?: string; type?: string }>(`${ACCOUNTS_URL}?pageSize=20`, "accounts", t, "accounts.list", fetcher, sleep, MAX_ACCOUNTS);
      const out: GbpAccount[] = [];
      let total = 0;
      for (const a of accounts) {
        if (total >= MAX_LOCATIONS) break;
        const u = `${LOCATIONS_URL(a.name)}?pageSize=100&readMask=${encodeURIComponent(READ_MASK)}`;
        const locs = await allPages<{ name: string; title?: string; storefrontAddress?: Parameters<typeof formatAddress>[0] }>(u, "locations", t, "locations.list", fetcher, sleep, MAX_LOCATIONS - total);
        total += locs.length;
        out.push({
          name: a.name, accountName: a.accountName || a.name, type: a.type ?? "",
          locations: locs.map((l) => ({ name: l.name, title: l.title || l.name, address: formatAddress(l.storefrontAddress) })),
        });
      }
      return out;
    },
    async invite() {
      throw new NotApprovedError("sending invitations isn't set up yet");
    },
  };
}
