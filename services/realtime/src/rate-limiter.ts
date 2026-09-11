import { DurableObject } from "cloudflare:workers";

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
};

/**
 * A small, strongly-consistent limiter. Each object is addressed by a one-way
 * hash of the connecting IP, so the limiter never persists the source address.
 */
export class RequestRateLimiter extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS rate_buckets (
        scope TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        request_count INTEGER NOT NULL
      );
    `);
  }

  check(scope: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    let count = 0;

    this.ctx.storage.transactionSync(() => {
      const row = this.ctx.storage.sql
        .exec<{ window_start: number; request_count: number }>(
          "SELECT window_start, request_count FROM rate_buckets WHERE scope = ?",
          scope,
        )
        .toArray()[0];

      count = row?.window_start === windowStart ? row.request_count + 1 : 1;
      this.ctx.storage.sql.exec(
        `INSERT INTO rate_buckets (scope, window_start, request_count)
         VALUES (?, ?, ?)
         ON CONFLICT(scope) DO UPDATE SET
           window_start = excluded.window_start,
           request_count = excluded.request_count`,
        scope,
        windowStart,
        count,
      );
    });

    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      retryAfterMs: Math.max(1, windowStart + windowMs - now),
    };
  }
}
