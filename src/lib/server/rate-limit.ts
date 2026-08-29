// 内存令牌桶限流（按 userId）。保护按量付费的 ASR/视觉/TTS 预算。
// 注意：内存态随进程重启清零，且仅对单实例有效；多实例部署（PM2 cluster）需换共享存储。

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** 返回 true 表示放行；false 表示超限。 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}
