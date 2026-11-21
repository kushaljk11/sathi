export const METRICS = ['mood', 'stress', 'sleep', 'energy', 'social', 'functioning'] as const;
export type Metric = (typeof METRICS)[number];
type Row = Record<Metric, number> & { createdAt: string | Date };

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/**
 * "What changed?" — compares mean self-reported values between two periods.
 * Returns null (not 0) where a period has no data so missing data is never shown as a low score.
 */
export function whatChanged(current: Row[], previous: Row[]) {
  return METRICS.map((m) => {
    const now = avg(current.map((r) => r[m]));
    const before = avg(previous.map((r) => r[m]));
    return {
      metric: m,
      current: now,
      previous: before,
      change: now != null && before != null ? Math.round((now - before) * 10) / 10 : null,
      currentCount: current.length,
      previousCount: previous.length,
    };
  });
}

/** Lower is better for stress; higher is better for everything else. */
export const isImprovement = (metric: Metric, change: number) => (metric === 'stress' ? change < 0 : change > 0);
