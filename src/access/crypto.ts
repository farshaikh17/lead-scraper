// Signing (HMAC-SHA256) for the OAuth state and the client's browser cookie, and AES-256-GCM for the
// client's Google refresh token while it's stored. Web Crypto only (Workers and Node).

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (ch) => ch.charCodeAt(0));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function sign(secret: string, data: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(data))));
}

/** Constant-time check (crypto.subtle.verify) of a signature made by sign(). */
export async function verify(secret: string, data: string, signature: string): Promise<boolean> {
  let sig: Uint8Array;
  try { sig = fromB64url(signature); } catch { return false; }
  return crypto.subtle.verify("HMAC", await hmacKey(secret), sig, enc.encode(data));
}

/** "<payload>.<signature>" with a JSON payload that carries its own expiry (`exp`, ms since epoch). */
export async function signState(secret: string, payload: Record<string, unknown>): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await sign(secret, `state:${body}`)}`;
}

export async function readState<T extends { exp: number }>(secret: string, state: string, now = Date.now()): Promise<T | null> {
  const [body, sig, extra] = String(state ?? "").split(".");
  if (!body || !sig || extra !== undefined || state.length > 2000) return null;
  if (!(await verify(secret, `state:${body}`, sig))) return null;
  try {
    const p = JSON.parse(dec.decode(fromB64url(body))) as T;
    return typeof p.exp === "number" && p.exp > now ? p : null;
  } catch {
    return null;
  }
}

/** The cookie that ties a browser to one access request: "<requestId>.<signature>". */
export async function cookieFor(secret: string, requestId: string) {
  return `${requestId}.${await sign(secret, `req:${requestId}`)}`;
}

export async function requestIdFromCookie(secret: string, value: string | undefined): Promise<string | null> {
  const [id, sig, extra] = String(value ?? "").split(".");
  if (!id || !sig || extra !== undefined || !/^[0-9a-f-]{36}$/.test(id)) return null;
  return (await verify(secret, `req:${id}`, sig)) ? id : null;
}

/** TOKEN_ENC_KEY: 32 bytes as 64 hex characters or base64. */
export function parseKey(raw: string): Uint8Array {
  const s = raw.trim();
  let bytes: Uint8Array;
  if (/^[0-9a-f]{64}$/i.test(s)) bytes = Uint8Array.from(s.match(/../g)!.map((h) => parseInt(h, 16)));
  else {
    try { bytes = fromB64url(s.replace(/=+$/, "")); } catch { throw new Error("TOKEN_ENC_KEY must be 32 bytes (64 hex characters or base64)"); }
  }
  if (bytes.length !== 32) throw new Error("TOKEN_ENC_KEY must be 32 bytes (64 hex characters or base64)");
  return bytes;
}

async function aesKey(raw: string) {
  return crypto.subtle.importKey("raw", parseKey(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** "v1.<iv>.<ciphertext+tag>" (base64url). A fresh 12-byte IV every time. */
export async function encryptSecret(keyRaw: string, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(keyRaw), enc.encode(plain)));
  return `v1.${b64url(iv)}.${b64url(ct)}`;
}

export async function decryptSecret(keyRaw: string, sealed: string): Promise<string> {
  const [v, iv, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("Unknown token format");
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(iv) }, await aesKey(keyRaw), fromB64url(ct)));
}
