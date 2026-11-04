// Settings for Google Business Profile access requests. All optional; without them the feature runs
// in "manual" mode (the client gets a guide to add the agency by hand).
//   GBP_MODE              live | manual | mock (default manual)
//   GOOGLE_CLIENT_ID      OAuth client (Web application) from Google Cloud
//   GOOGLE_CLIENT_SECRET  its secret (a Worker secret, never sent to the browser)
//   TOKEN_ENC_KEY         32 random bytes, base64 or hex: encrypts the client's refresh token while it's stored
//   STATE_SIGNING_SECRET  random text: signs the OAuth state and the client's browser cookie
//   RESEND_API_KEY        emails (with GBP_EMAIL_FROM, or the store's "Send emails from" address)

export type GbpMode = "live" | "manual" | "mock";

export type GbpEnv = Env & {
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

export const liveReady = (env: GbpEnv) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_ENC_KEY && env.STATE_SIGNING_SECRET);

/**
 * The secret that signs the client's cookie and the OAuth state. Mock and manual mode work without
 * STATE_SIGNING_SECRET locally; then a fixed development value is used (never in live mode, which needs the real one).
 */
export function signingSecret(env: GbpEnv): string {
  if (env.STATE_SIGNING_SECRET) return env.STATE_SIGNING_SECRET;
  if (gbpMode(env) === "live") throw new Error("STATE_SIGNING_SECRET is not set");
  return "gbp-access-development-only";
}
