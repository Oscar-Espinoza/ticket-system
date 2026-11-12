// The in-memory token bucket behind the /mcp limit (src/lib/server/rate-limit.ts):
// its key table is bounded by dropping the least recently used key. No database.
import { describe, expect, it } from 'vitest';

import { TokenBucketLimiter } from '@/lib/server/rate-limit';

describe('TokenBucketLimiter', () => {
  it('drops the least recently used key when full, keeping recently used ones', () => {
    const limiter = new TokenBucketLimiter(1, 60_000, 2);
    expect(limiter.take('a', 0)).toEqual({ ok: true });
    expect(limiter.take('b', 1)).toEqual({ ok: true });
    expect(limiter.take('a', 2).ok).toBe(false); // a is used again: now b is the oldest
    expect(limiter.take('c', 3)).toEqual({ ok: true }); // full: drops b
    expect(limiter.take('a', 4).ok).toBe(false); // a was kept, still empty
    expect(limiter.take('b', 5)).toEqual({ ok: true }); // b was forgotten: a fresh bucket
  });
});
