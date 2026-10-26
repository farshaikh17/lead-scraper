// Lets the free collector (GitHub Actions) prove who it is without any stored secret.
// GitHub signs a short-lived token for each workflow run ("OpenID Connect"); we check the
// signature against GitHub's published keys and that it came from our repository's
// free-collect.yml on main.

const ISSUER = "https://token.actions.githubusercontent.com";
const JWKS_URL = `${ISSUER}/.well-known/jwks`;
export const OIDC_AUDIENCE = "lead-finder";

interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
let jwksCache: { keys: Jwk[]; at: number } | null = null;

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function keys(force = false): Promise<Jwk[]> {
  if (!force && jwksCache && Date.now() - jwksCache.at < 3_600_000) return jwksCache.keys;
  const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`GitHub keys unavailable (${res.status})`);
  jwksCache = { keys: ((await res.json()) as { keys: Jwk[] }).keys, at: Date.now() };
  return jwksCache.keys;
}

export interface OidcClaims {
  iss: string; aud: string | string[]; exp: number; nbf?: number; repository: string; ref: string;
  workflow_ref?: string; job_workflow_ref?: string; run_id?: string; repository_id?: string;
}

/** Pure checks on the claims (signature checked separately). Returns an error or null. */
export function checkClaims(c: OidcClaims, repo: string, nowSec = Math.floor(Date.now() / 1000), repoId?: string): string | null {
  if (c.iss !== ISSUER) return "wrong issuer";
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(OIDC_AUDIENCE)) return "wrong audience";
  if (!(c.exp > nowSec - 30)) return "expired";
  if (c.nbf && c.nbf > nowSec + 60) return "not yet valid";
  // GitHub's repository id never changes (a rename or a move to another account keeps it); the name does.
  if (repoId && c.repository_id) { if (String(c.repository_id) !== String(repoId)) return "wrong repository"; }
  else if (c.repository?.toLowerCase() !== repo.toLowerCase()) return "wrong repository";
  if (c.ref !== "refs/heads/main") return "not the main branch";
  const wf = c.workflow_ref ?? c.job_workflow_ref ?? "";
  if (!wf.includes("/.github/workflows/free-collect.yml@")) return "not the free collector workflow";
  return null;
}

/** Verifies a GitHub Actions OIDC token for our repository's free collector. */
export async function verifyGithubOidc(token: string, repo: string, repoId?: string): Promise<OidcClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0]))) as { kid?: string; alg?: string };
    // Why a pass is refused goes to the logs (never the pass itself), so a change on GitHub's side shows up.
    const no = (why: string) => { console.warn("github-oidc: refused:", why); return null; };
    if (header.alg !== "RS256" || !header.kid) return no(`header alg ${header.alg} kid ${header.kid ? "set" : "missing"}`);
    let jwk = (await keys()).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await keys(true)).find((k) => k.kid === header.kid); // keys rotated
    if (!jwk) return no(`no published key ${header.kid}`);
    const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return no("signature doesn't match");
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]))) as OidcClaims;
    const bad = checkClaims(claims, repo, undefined, repoId);
    if (bad) return no(`${bad} (repository ${claims.repository}, ref ${claims.ref}, workflow ${claims.workflow_ref ?? claims.job_workflow_ref}, aud ${String(claims.aud)}, iss ${claims.iss})`);
    return claims;
  } catch (err) {
    console.warn("github-oidc: refused: error", err instanceof Error ? err.message : String(err));
    return null;
  }
}
