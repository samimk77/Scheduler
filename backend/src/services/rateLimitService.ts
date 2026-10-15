import redisClient from '../config/redis';

/** Atomically reserve one recipient send in a UTC hour window. */
export async function checkAndIncrementRateLimit(
  senderId: string,
  maxPerHour: number
): Promise<{ allowed: boolean; currentCount: number; resetAt: number }> {
  const now = new Date();
  const hourWindow = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}-${String(now.getUTCHours()).padStart(2, '0')}`;
  const key = `rate_limit:${senderId}:${hourWindow}`;

  // Start of next hour
  const nextHour = new Date(now);
  nextHour.setUTCHours(nextHour.getUTCHours() + 1, 0, 0, 0);
  const resetAt = nextHour.getTime();
  const ttlSeconds = Math.ceil((resetAt - now.getTime()) / 1000);

  // Atomic increment
  // Keep the counter within the configured limit; rejected jobs don't consume
  // a slot. Lua makes the check and increment one operation across workers.
  const currentCount = Number(await redisClient.eval(
    `local n = tonumber(redis.call('GET', KEYS[1]) or '0')\n` +
    `if n >= tonumber(ARGV[1]) then return n end\n` +
    `n = redis.call('INCR', KEYS[1])\n` +
    `if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end\n` +
    `return n`,
    1,
    key,
    maxPerHour,
    ttlSeconds
  ));
  return { allowed: currentCount <= maxPerHour, currentCount, resetAt };
}

/**
 * Check current rate limit count without incrementing (read-only)
 */
export async function getRateLimitCount(senderId: string): Promise<number> {
  const now = new Date();
  const hourWindow = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}-${String(now.getUTCHours()).padStart(2, '0')}`;
  const key = `rate_limit:${senderId}:${hourWindow}`;
  const count = await redisClient.get(key);
  return parseInt(count || '0');
}
