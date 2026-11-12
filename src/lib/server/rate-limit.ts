// In-memory token buckets: `limit` calls per `windowMs` per key, refilled
// continuously, so a burst up to `limit` passes and then calls flow at the
// average rate. Counters live in this process only: on Vercel each function
// instance and in Docker each replica counts on its own, the same as Better
// Auth's sign-in and registration limits (memory storage). A speed bump
// against runaway loops and floods, not a guarantee: the key is chosen by the
// caller (for /mcp, one per API key or OAuth client), so one person with
// several keys or clients gets several allowances.

export type RateDecision = { ok: true } | { ok: false; retryAfterSeconds: number };

interface Bucket {
  tokens: number;
  at: number;
}

/** Most keys kept; past it the least recently used key is dropped (O(1)). */
const MAX_KEYS = 10_000;

export class TokenBucketLimiter {
  // Map order is use order: each take moves its key to the end, so the first
  // key is the least recently used. Dropping it forgets a bucket that, unless
  // 10,000 other keys were used since, has long refilled.
  private readonly buckets = new Map<string, Bucket>();
  private readonly perMs: number;

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly maxKeys = MAX_KEYS,
  ) {
    this.perMs = limit / windowMs;
  }

  private refilled(bucket: Bucket, now: number): number {
    return Math.min(this.limit, bucket.tokens + (now - bucket.at) * this.perMs);
  }

  /** Takes one call from `key`'s bucket, or says how long until one is available. */
  take(key: string, now = Date.now()): RateDecision {
    const bucket = this.buckets.get(key);
    // Refused calls count as use too: a key being throttled is the last one to forget.
    if (bucket) this.buckets.delete(key);
    else if (this.buckets.size >= this.maxKeys) this.buckets.delete(this.buckets.keys().next().value!);
    const tokens = bucket ? this.refilled(bucket, now) : this.limit;
    if (tokens < 1) {
      this.buckets.set(key, bucket!);
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / this.perMs / 1000)) };
    }
    this.buckets.set(key, { tokens: tokens - 1, at: now });
    return { ok: true };
  }
}
