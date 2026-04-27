// Real benchmark integration sketch for bench-renderer-shootout.
//
// Gated by ?mode=real-benchmark. The default deterministic harness path is
// untouched. When the gate is active, app.js dynamically imports this module
// which then loads benchmark.js (or compatible) from a CDN and registers a
// real benchmark adapter with the registry shipped under public/benchmark-adapter.js.
//
// `loadBenchmarkFromCdn` is parameterized so tests can inject a stub instead of
// hitting the network.

const DEFAULT_BENCHMARK_VERSION = "2.1.4";
const DEFAULT_BENCHMARK_CDN = (version) => `https://esm.sh/benchmark@${version}`;

export async function loadBenchmarkFromCdn({ version = DEFAULT_BENCHMARK_VERSION } = {}) {
  const module = await import(/* @vite-ignore */ DEFAULT_BENCHMARK_CDN(version));
  const Benchmark = module.default || module.Benchmark || module;
  if (typeof Benchmark !== "function" && typeof Benchmark !== "object") {
    throw new Error("benchmark module did not expose a callable Benchmark");
  }
  return { Benchmark, module };
}

export function buildRealBenchmarkAdapter({
  Benchmark,
  version = DEFAULT_BENCHMARK_VERSION,
  suiteId = "renderer-shootout"
}) {
  if (!Benchmark) {
    throw new Error("buildRealBenchmarkAdapter requires Benchmark");
  }
  const id = `benchmarkjs-${suiteId}-${version.replace(/[^0-9]/g, "")}`;
  let suite = null;
  let profileResults = [];

  return {
    id,
    label: `benchmark.js ${version} (${suiteId})`,
    version,
    capabilities: ["profile-comparison", "winner-selection", "fallback-pair", "real-benchmark"],
    benchmarkType: "benchmark.js",
    isReal: true,
    async createBenchmark({ name = suiteId } = {}) {
      const SuiteCtor = Benchmark.Suite || (typeof Benchmark === "function" ? Benchmark.Suite : null);
      if (!SuiteCtor) {
        throw new Error("Benchmark.Suite not available on loaded module");
      }
      suite = new SuiteCtor(name);
      profileResults = [];
      return suite;
    },
    async runProfile({ profileId, fn, options = {} } = {}) {
      if (!suite) {
        throw new Error("createBenchmark() must run before runProfile()");
      }
      if (!profileId || typeof fn !== "function") {
        throw new Error("runProfile requires profileId and fn");
      }
      const startedAt = performance.now();
      // benchmark.js typically runs async via emitters; for the sketch we run
      // the function once to record a single-shot measurement and rely on the
      // suite for multi-iteration stats when the consumer wires it up.
      await fn();
      const elapsedMs = performance.now() - startedAt;
      const sample = {
        profileId,
        elapsedMs,
        options
      };
      profileResults.push(sample);
      return sample;
    },
    async aggregateResults() {
      if (!profileResults.length) {
        return { profileCount: 0, winner: null, samples: [] };
      }
      const sorted = [...profileResults].sort((left, right) => left.elapsedMs - right.elapsedMs);
      return {
        profileCount: sorted.length,
        winner: sorted[0].profileId,
        samples: sorted
      };
    }
  };
}

export async function connectRealBenchmark({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null,
  loader = loadBenchmarkFromCdn,
  version = DEFAULT_BENCHMARK_VERSION,
  suiteId = "renderer-shootout"
} = {}) {
  if (!registry) {
    throw new Error("benchmark registry not available");
  }
  const { Benchmark } = await loader({ version });
  const adapter = buildRealBenchmarkAdapter({ Benchmark, version, suiteId });
  registry.register(adapter);
  return { adapter, Benchmark };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-benchmark" && !window.__aiWebGpuLabRealBenchmarkBootstrapping) {
    window.__aiWebGpuLabRealBenchmarkBootstrapping = true;
    connectRealBenchmark().catch((error) => {
      console.warn(`[real-benchmark] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealBenchmarkBootstrapError = error.message;
    });
  }
}
