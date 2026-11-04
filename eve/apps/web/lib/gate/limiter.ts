// The login limiter (KTD11): a token bucket per address and one bucket every caller shares,
// both checked before the code is compared. The buckets live in one server instance's memory,
// so on Vercel each warm instance counts on its own; the WAF rate-limit rule on the login path
// is the durable layer in front of it.

export const LOGIN_PER_ADDRESS = { capacity: 10, windowMs: 60_000 } as const;
export const LOGIN_GLOBAL = { capacity: 100, windowMs: 60_000 } as const;

export type LimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const STALE_MS = 15 * 60_000;
const SWEEP_AT = 500;

export class LoginLimiter {
  private readonly perAddress = new Map<string, Bucket>();
  private global: Bucket | undefined;
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** Takes one attempt for the address, and one from the shared bucket. */
  take(address: string): LimitResult {
    const now = this.now();
    if (this.perAddress.size > SWEEP_AT) {
      for (const [key, bucket] of this.perAddress) if (now - bucket.updatedAt > STALE_MS) this.perAddress.delete(key);
    }
    const own = consume(this.perAddress.get(address), LOGIN_PER_ADDRESS, now);
    this.perAddress.set(address, own.bucket);
    if (!own.result.ok) return own.result;
    const shared = consume(this.global, LOGIN_GLOBAL, now);
    this.global = shared.bucket;
    return shared.result;
  }
}

function consume(existing: Bucket | undefined, limit: { capacity: number; windowMs: number }, now: number) {
  const refillMs = limit.windowMs / limit.capacity;
  const elapsed = existing ? Math.max(0, now - existing.updatedAt) : 0;
  const tokens = Math.min(limit.capacity, existing ? existing.tokens + elapsed / refillMs : limit.capacity);
  if (tokens >= 1) return { bucket: { tokens: tokens - 1, updatedAt: now }, result: { ok: true } as LimitResult };
  const retryAfterSeconds = Math.max(1, Math.ceil(((1 - tokens) * refillMs) / 1000));
  return { bucket: { tokens, updatedAt: now }, result: { ok: false, retryAfterSeconds } as LimitResult };
}

/** The limiter every login request in this instance shares. */
export const loginLimiter = new LoginLimiter();
