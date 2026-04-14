import "server-only";

type PerfValue = string | number | boolean | null | undefined;

function cleanMetrics(metrics: Record<string, PerfValue>) {
  return Object.fromEntries(Object.entries(metrics).filter(([, value]) => value !== undefined));
}

export function createRequestProfiler(name: string, initialMetrics: Record<string, PerfValue> = {}) {
  const enabled = process.env.LMS_PERF_LOG === "1";
  const startedAt = Date.now();
  let lastMarkAt = startedAt;
  const metrics: Record<string, PerfValue> = { ...initialMetrics };

  return {
    mark(label: string) {
      if (!enabled) return;

      const now = Date.now();
      metrics[`ms.${label}`] = now - lastMarkAt;
      lastMarkAt = now;
    },
    record(label: string, value: PerfValue) {
      metrics[label] = value;
    },
    flush() {
      if (!enabled) return;

      console.info(
        `[perf] ${name} ${JSON.stringify({
          durationMs: Date.now() - startedAt,
          ...cleanMetrics(metrics),
        })}`
      );
    },
  };
}
