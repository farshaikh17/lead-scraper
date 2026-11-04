// Settings for Google Business Profile access requests. All optional; without them the feature runs
// in "manual" mode (the client gets a guide to add the agency by hand).
//   GBP_MODE              live | manual | mock (default manual)
//   GOOGLE_CLIENT_ID      OAuth client (Web application) from Google Cloud
//   GOOGLE_CLIENT_SECRET  its secret (a Worker secret, never sent to the browser)
//   TOKEN_ENC_KEY         32 random bytes, base64 or hex: encrypts the client's refresh token while it's stored
//   STATE_SIGNING_SECRET  random text: signs the OAuth state and the client's browser cookie
//   RESEND_API_KEY        emails (with GBP_EMAIL_FROM, or the store's "Send emails from" address)
//   CLIENT_ACCESS_URL     Lead Finder only: where the separate client-access app runs (e.g.
//                         https://access.mianrosystems.com). Links are shown with it and /connect/... here sends clients there.
//   LEAD_FINDER_URL       client-access app only: Lead Finder's address, for the "Open Client access" button in emails

export type GbpMode = "live" | "manual" | "mock";

export type GbpEnv = Env & {
  CLIENT_ACCESS_URL?: string;
  LEAD_FINDER_URL?: string;
  GBP_MODE?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TOKEN_ENC_KEY?: string;
  STATE_SIGNING_SECRET?: string;
  RESEND_API_KEY?: string;
  GBP_EMAIL_FROM?: string;
};

/** The mode actually in use: "live" needs every Google setting, else it falls back to "manual". */
export function gbpMode(env: GbpEnv): GbpMode {
  const want = String(env.GBP_MODE ?? "").trim().toLowerCase();
  if (want === "mock") return "mock";
  if (want === "live") return liveReady(env) ? "live" : "manual";
  return "manual";
}

/** An https address with nothing after the host ("" when unset or not valid). http only for localhost. */
export function baseUrl(value: unknown): string {
  try {
    const u = new URL(String(value ?? "").trim());
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return "";
    return u.origin;
  } catch {
    return "";
  }
}

export const liveReady =(env: GbpEnv) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_ENC_KEY && env.STATE_SIGNING_SECRET);

/**
 * The secret that signs the client's cookie and the OAuth state. Mock and manual mode work without
 * STATE_SIGNING_SECRET locally; then a fixed development value is used (never in live mode, which needs the real one).
 */
export function signingSecret(env: GbpEnv): string {
  if (env.STATE_SIGNING_SECRET) return env.STATE_SIGNING_SECRET;
  if (gbpMode(env) === "live") throw new Error("STATE_SIGNING_SECRET is not set");
  return "gbp-access-development-only";
}
