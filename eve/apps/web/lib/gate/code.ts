import { createHash, createHmac, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

// The shared code and the session cookie (KTD11). A copy sets the code as EVE_CHAT_PASSWORD,
// the template's plaintext form, or as EVE_CHAT_PASSWORD_DIGEST, the salted digest the demo
// uses. The compare reads the stored value's prefix, so either form works wherever it is set:
//   scrypt$<salt, base64url>$<scrypt of the code with that salt, 32 bytes, base64url>
// The cookie is signed with a key derived from the stored value, so rotating the code
// revokes every cookie issued under the old one.

export const COOKIE_NAME = "eve_chat_session";
export const COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;
const DIGEST_PREFIX = "scrypt$";
const TOKEN_VERSION = "v2";

/** The configured secret: the digest when set, otherwise the plaintext code. Empty when neither is set. */
export function configuredSecret(env: NodeJS.ProcessEnv = process.env): string {
  return env.EVE_CHAT_PASSWORD_DIGEST?.trim() || env.EVE_CHAT_PASSWORD?.trim() || "";
}

/** The digest form of a code, as the README's one-liner writes it. */
export function digestCode(code: string, salt: Buffer): string {
  return `${DIGEST_PREFIX}${salt.toString("base64url")}$${scryptSync(code, salt, 32).toString("base64url")}`;
}

/** Whether the candidate matches the configured secret, in either form. */
export function verifyCode(candidate: string, secret: string): boolean {
  if (!secret || !candidate) return false;
  if (secret.startsWith(DIGEST_PREFIX)) {
    const [salt, hash, ...extra] = secret.slice(DIGEST_PREFIX.length).split("$");
    if (!salt || !hash || extra.length) return false;
    const expected = Buffer.from(hash, "base64url");
    const actual = scryptSync(candidate, Buffer.from(salt, "base64url"), expected.length || 32);
    return expected.length > 0 && timingSafeEqual(actual, expected);
  }
  return timingSafeEqual(sha256(candidate), sha256(secret));
}

export interface CookieSession {
  /** A random id per issued cookie: the concurrency rule counts sessions per cookie id. */
  readonly cookieId: string;
  readonly expiresAt: number;
}

/** A signed cookie value: v2.<cookie id>.<expiry in unix seconds>.<signature>. */
export function issueCookie(secret: string, now = Date.now()): { value: string; session: CookieSession } {
  const cookieId = randomUUID().replaceAll("-", "");
  const expiresAt = Math.floor(now / 1000) + COOKIE_MAX_AGE_SECONDS;
  const payload = `${TOKEN_VERSION}.${cookieId}.${expiresAt}`;
  return { value: `${payload}.${sign(secret, payload)}`, session: { cookieId, expiresAt } };
}

export function verifyCookie(value: string | undefined, secret: string, now = Date.now()): CookieSession | null {
  if (!value || !secret) return null;
  const [version, cookieId, expiresRaw, signature, ...extra] = value.split(".");
  const expiresAt = Number(expiresRaw);
  if (
    version !== TOKEN_VERSION ||
    !cookieId ||
    !/^[0-9a-f]{32}$/.test(cookieId) ||
    !signature ||
    extra.length ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(now / 1000) ||
    expiresAt > Math.floor(now / 1000) + COOKIE_MAX_AGE_SECONDS
  ) {
    return null;
  }
  const expected = sign(secret, `${version}.${cookieId}.${expiresAt}`);
  return timingSafeEqual(sha256(signature), sha256(expected)) ? { cookieId, expiresAt } : null;
}

/** The session cookie from a Cookie header. */
export function cookieFromHeaders(headers: Headers, secret: string, now = Date.now()): CookieSession | null {
  const raw = headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  return verifyCookie(raw ? decodeURIComponent(raw) : undefined, secret, now);
}

/** HttpOnly, Secure outside local development, SameSite=Lax, host-only (no Domain), at most 12 hours. */
export function cookieAttributes(maxAge: number, env: NodeJS.ProcessEnv = process.env) {
  return {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax" as const,
    secure: env.NODE_ENV !== "development",
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}

function sign(secret: string, payload: string) {
  const key = createHmac("sha256", "agent-blueprint chat cookie").update(secret).digest();
  return createHmac("sha256", key).update(payload).digest("base64url");
}
