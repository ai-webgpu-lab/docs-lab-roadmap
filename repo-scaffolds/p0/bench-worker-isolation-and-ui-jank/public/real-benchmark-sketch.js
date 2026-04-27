// Real worker-isolation benchmark sketch for bench-worker-isolation-and-ui-jank.
//
// Gated by ?mode=real-worker-bench. Default deterministic harness path is
// untouched. `loadBenchmarkAndRuntime` is parameterized so tests can inject stubs.
// Adapter compares main-thread burn vs worker burn and records frame pacing
// jitter via requestAnimationFrame timing samples.

const DEFAULT_BENCHMARK_VERSION = "2.1.4";
const DEFAULT_BENCHMARK_CDN = (version) => `https://esm.sh/benchmark@${version}`;

export async function loadBenchmarkAndRuntime({
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  rafImpl = (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function" ? window.requestAnimationFrame.bind(window) : null)
} = {}) {
  const benchmarkModule = await import(/* @vite-ignore */ DEFAULT_BENCHMARK_CDN(benchmarkVersion));
  const Benchmark = benchmarkModule.default || benchmarkModule.Benchmark || benchmarkModule;
  if (!Benchmark) throw new Error("benchmark module missing Benchmark export");
  return { Benchmark, raf: rafImpl };
}

function burnMainThread(durationMs) {
  const startedAt = performance.now();
  let acc = 0;
  while (performance.now() - startedAt < durationMs) {
    acc += Math.sin(acc + Math.random()) * Math.cos(acc);
  }
  return acc;
}

async function captureFrameSamples(rafImpl, sampleCount) {
  if (typeof rafImpl !== "function") return [];
  const samples = [];
  let lastTime = performance.now();
  for (let index = 0; index < sampleCount; index += 1) {
    await new Promise((resolve) => rafImpl((now) => resolve(now)));
    const now = performance.now();
    samples.push(now - lastTime);
    lastTime = now;
  }
  return samples;
}

export function buildRealWorkerIsolationBenchAdapter({
  Benchmark,
  raf,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  suiteId = "worker-isolation-and-ui-jank"
}) {
  if (!Benchmark) throw new Error("buildRealWorkerIsolationBenchAdapter requires Benchmark");
  const id = `bench-worker-${suiteId}-${benchmarkVersion.replace(/[^0-9]/g, "")}`;
  let suite = null;
  let profileResults = [];

  return {
    id,
    label: `Worker isolation bench (benchmark.js ${benchmarkVersion})`,
    version: benchmarkVersion,
    capabilities: ["profile-comparison", "winner-selection", "real-benchmark", "frame-pacing"],
    benchmarkType: "worker-isolation-and-ui-jank",
    isReal: true,
    async createBenchmark({ name = suiteId } = {}) {
      const SuiteCtor = Benchmark.Suite || (typeof Benchmark === "function" ? Benchmark.Suite : null);
      if (!SuiteCtor) throw new Error("Benchmark.Suite not available");
      suite = new SuiteCtor(name);
      profileResults = [];
      return suite;
    },
    async runProfile({ profileId, mode = "main", burnMs = 80, frameSamples = 30, workerFactory = null } = {}) {
      if (!suite) throw new Error("createBenchmark() must run before runProfile()");
      if (!profileId) throw new Error("runProfile requires profileId");
      if (mode !== "main" && mode !== "worker") throw new Error(`unsupported mode '${mode}' (expected 'main' or 'worker')`);
      if (mode === "worker" && typeof workerFactory !== "function") {
        throw new Error("worker mode requires a workerFactory callable");
      }
      const startedAt = performance.now();
      let burnPromise;
      if (mode === "worker") {
        const worker = workerFactory({ burnMs });
        burnPromise = worker && typeof worker.run === "function"
          ? worker.run({ burnMs })
          : Promise.resolve();
      } else {
        burnPromise = Promise.resolve(burnMainThread(burnMs));
      }
      const samples = await captureFrameSamples(raf, frameSamples);
      await burnPromise;
      const elapsedMs = performance.now() - startedAt;
      const sortedSamples = [...samples].sort((left, right) => left - right);
      const median = sortedSamples.length ? sortedSamples[Math.floor(sortedSamples.length / 2)] : 0;
      const p95 = sortedSamples.length ? sortedSamples[Math.min(sortedSamples.length - 1, Math.ceil(sortedSamples.length * 0.95) - 1)] : 0;
      const sample = {
        profileId,
        mode,
        burnMs,
        frameSamples: samples.length,
        medianFrameMs: median,
        p95FrameMs: p95,
        elapsedMs
      };
      profileResults.push(sample);
      return sample;
    },
    async aggregateResults() {
      if (!profileResults.length) return { profileCount: 0, winner: null, samples: [] };
      const sorted = [...profileResults].sort((left, right) => left.p95FrameMs - right.p95FrameMs);
      return { profileCount: sorted.length, winner: sorted[0].profileId, samples: sorted };
    }
  };
}

export async function connectRealWorkerIsolationBench({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null,
  loader = loadBenchmarkAndRuntime,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  suiteId = "worker-isolation-and-ui-jank"
} = {}) {
  if (!registry) throw new Error("benchmark registry not available");
  const { Benchmark, raf } = await loader({ benchmarkVersion });
  const adapter = buildRealWorkerIsolationBenchAdapter({ Benchmark, raf, benchmarkVersion, suiteId });
  registry.register(adapter);
  return { adapter, Benchmark };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-worker-bench" && !window.__aiWebGpuLabRealWorkerBenchBootstrapping) {
    window.__aiWebGpuLabRealWorkerBenchBootstrapping = true;
    connectRealWorkerIsolationBench().catch((error) => {
      console.warn(`[real-worker-bench] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealWorkerBenchBootstrapError = error.message;
    });
  }
}
