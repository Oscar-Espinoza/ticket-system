// In-memory token buckets: `limit` calls per `windowMs` per key, refilled
// continuously, so a burst up to `limit` passes and then calls flow at the
// average rate. Counters live in this process only: on Vercel each function
// instance and in Docker each replica counts on its own, the same as Better
// Auth's sign-in and registration limits (memory storage). A speed bump
// against runaway loops and floods, not a guarantee.

export type RateDecision = { ok: true } | { ok: false; retryAfterSeconds: number };

interface Bucket {
  tokens: number;
  at: number;
}

/** Above this many keys, buckets that have refilled completely are dropped. */
const SWEEP_AT = 10_000;

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly perMs: number;

  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {
    this.perMs = limit / windowMs;
  }

  private refilled(bucket: Bucket, now: number): number {
    return Math.min(this.limit, bucket.tokens + (now - bucket.at) * this.perMs);
  }

  /** Takes one call from `key`'s bucket, or says how long until one is available. */
  take(key: string, now = Date.now()): RateDecision {
    const bucket = this.buckets.get(key);
    const tokens = bucket ? this.refilled(bucket, now) : this.limit;
    if (tokens < 1) {
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / this.perMs / 1000)) };
    }
    if (!bucket && this.buckets.size >= SWEEP_AT) this.sweep(now);
    this.buckets.set(key, { tokens: tokens - 1, at: now });
    return { ok: true };
  }

  private sweep(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (this.refilled(bucket, now) >= this.limit) this.buckets.delete(key);
    }
  }
}
