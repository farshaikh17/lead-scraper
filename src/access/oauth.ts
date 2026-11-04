// Google sign-in for access requests (OAuth 2.0 authorization code flow, web server app).
// The state is signed and expires after 10 minutes, and it names the request this browser's cookie
// is tied to, so a callback can't be replayed or completed in another browser. PKCE (S256) on top:
// the verifier is derived from the signing secret, so nothing extra has to be stored.
// Tokens are never logged: errors log Google's status and error code only.

import { type GbpEnv, signingSecret } from "./config";
import { b64url, encryptSecret, fromB64url, readState, sign, signState } from "./crypto";

export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GBP_SCOPE = "https://www.googleapis.com/auth/business.manage";
export const CALLBACK_PATH = "/api/connect/oauth/callback";
const STATE_MINUTES = 10;

export interface OAuthState { r: string; s: string; n: string; exp: number }

export const redirectUri = (origin: string) => `${origin}${CALLBACK_PATH}`;

async function pkceVerifier(env: GbpEnv, state: Pick<OAuthState, "r" | "n">) {
  // 43+ characters from the unreserved set (base64url of a 32-byte HMAC).
  return sign(signingSecret(env), `pkce:${state.r}:${state.n}`);
}

async function pkceChallenge(verifier: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

/** Google's consent page for this request. */
export async function authorizationUrl(env: GbpEnv, origin: string, requestId: string, slug: string, loginHint?: string | null): Promise<string> {
  const st: OAuthState = { r: requestId, s: slug, n: b64url(crypto.getRandomValues(new Uint8Array(12))), exp: Date.now() + STATE_MINUTES * 60_000 };
  const u = new URL(AUTH_URL);
  u.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: `openid email ${GBP_SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    state: await signState(signingSecret(env), st as unknown as Record<string, unknown>),
    code_challenge: await pkceChallenge(await pkceVerifier(env, st)),
    code_challenge_method: "S256",
    ...(loginHint ? { login_hint: loginHint } : {}),
  }).toString();
  return u.toString();
}

export async function checkState(env: GbpEnv, raw: string | undefined): Promise<OAuthState | null> {
  const s = await readState<OAuthState>(signingSecret(env), String(raw ?? ""));
  return s && typeof s.r === "string" && typeof s.s === "string" && typeof s.n === "string" ? s : null;
}

export class OAuthError extends Error {
  constructor(message: string, public kind: "denied" | "scope" | "no_refresh" | "exchange") {
    super(message);
  }
}

/** The signed-in Google email from the ID token (it came straight from Google's token endpoint over TLS). */
export function emailFromIdToken(idToken: string | undefined): string | null {
  const part = String(idToken ?? "").split(".")[1];
  if (!part) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(part))) as { email?: string; email_verified?: boolean };
    return p.email && p.email_verified !== false ? p.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Swaps the code for tokens; returns the encrypted refresh token and the Google email. */
export async function exchangeCode(env: GbpEnv, origin: string, code: string, state: OAuthState, fetcher: typeof fetch = fetch) {
  const res = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri(origin),
      grant_type: "authorization_code", code_verifier: await pkceVerifier(env, state),
    }).toString(),
  }).catch(() => null);
  const body = (res ? await res.json().catch(() => ({})) : {}) as { refresh_token?: string; access_token?: string; scope?: string; id_token?: string; error?: string };
  if (!res || !res.ok) {
    console.error("gbp oauth: code exchange failed", res?.status ?? "unreachable", body.error ?? "");
    throw new OAuthError("Google sign-in didn't complete. Please try again.", "exchange");
  }
  // People can untick the Business Profile box on Google's consent screen.
  if (!String(body.scope ?? "").split(" ").includes(GBP_SCOPE)) {
    if (body.access_token) await revoke(body.access_token, fetcher);
    throw new OAuthError("Google sign-in worked, but the box allowing access to your business listings wasn't ticked. Please try again and leave it ticked.", "scope");
  }
  if (!body.refresh_token) {
    if (body.access_token) await revoke(body.access_token, fetcher);
    throw new OAuthError("Google didn't give us lasting access. Please try again.", "no_refresh");
  }
  return { sealed: await encryptSecret(env.TOKEN_ENC_KEY!, body.refresh_token), googleEmail: emailFromIdToken(body.id_token) };
}

/** A short-lived access token from the stored refresh token. */
export async function accessToken(env: GbpEnv, refreshToken: string, fetcher: typeof fetch = fetch): Promise<string> {
  const res = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, refresh_token: refreshToken, grant_type: "refresh_token" }).toString(),
  }).catch(() => null);
  const body = (res ? await res.json().catch(() => ({})) : {}) as { access_token?: string; error?: string };
  if (!res || !res.ok || !body.access_token) {
    console.error("gbp oauth: refresh failed", res?.status ?? "unreachable", body.error ?? "");
    throw new OAuthError("Your Google sign-in has expired. Please start again.", "exchange");
  }
  return body.access_token;
}

/** Ends our access to the client's Google account (best effort; the token is deleted here anyway). */
export async function revoke(token: string, fetcher: typeof fetch = fetch) {
  const res = await fetcher(REVOKE_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString() }).catch(() => null);
  if (!res || !res.ok) console.error("gbp oauth: revoke failed", res?.status ?? "unreachable");
}
