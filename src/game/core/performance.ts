export interface PerfMetric {
  count: number;
  last: number;
  max: number;
  total: number;
}

export type PerfSnapshot = Record<string, PerfMetric>;

const perfMetrics: PerfSnapshot = {};

export function perfNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function metricFor(name: string): PerfMetric {
  return (perfMetrics[name] ??= {
    count: 0,
    last: 0,
    max: 0,
    total: 0
  });
}

export function recordPerfDuration(name: string, milliseconds: number): void {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return;
  }

  const metric = metricFor(name);
  metric.count += 1;
  metric.last = milliseconds;
  metric.total += milliseconds;
  metric.max = Math.max(metric.max, milliseconds);
}

export function recordPerfCount(name: string, amount = 1): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const metric = metricFor(name);
  metric.count += amount;
  metric.last = amount;
  metric.total += amount;
  metric.max = Math.max(metric.max, amount);
}

export function recordPerfGauge(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    return;
  }

  const metric = metricFor(name);
  metric.count += 1;
  metric.last = value;
  metric.total = value;
  metric.max = Math.max(metric.max, value);
}

export function getPerfSnapshot(): PerfSnapshot {
  return Object.fromEntries(Object.entries(perfMetrics).map(([name, metric]) => [name, { ...metric }]));
}

