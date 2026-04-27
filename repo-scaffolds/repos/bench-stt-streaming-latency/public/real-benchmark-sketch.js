// Real STT streaming latency benchmark sketch for bench-stt-streaming-latency.
//
// Gated by ?mode=real-stt-bench. Default deterministic harness path is untouched.
// `loadBenchmarkAndRuntime` is parameterized so tests can inject stubs.

const DEFAULT_BENCHMARK_VERSION = "2.1.4";
const DEFAULT_BENCHMARK_CDN = (version) => `https://esm.sh/benchmark@${version}`;
const DEFAULT_TRANSFORMERS_VERSION = "3.0.0";
const DEFAULT_TRANSFORMERS_CDN = (version) => `https://esm.sh/@huggingface/transformers@${version}`;

export async function loadBenchmarkAndRuntime({
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION
} = {}) {
  const [benchmarkModule, transformers] = await Promise.all([
    import(/* @vite-ignore */ DEFAULT_BENCHMARK_CDN(benchmarkVersion)),
    import(/* @vite-ignore */ DEFAULT_TRANSFORMERS_CDN(transformersVersion))
  ]);
  const Benchmark = benchmarkModule.default || benchmarkModule.Benchmark || benchmarkModule;
  if (!Benchmark) throw new Error("benchmark module missing Benchmark export");
  if (!transformers || typeof transformers.pipeline !== "function") {
    throw new Error("transformers module missing pipeline()");
  }
  return { Benchmark, transformers, pipeline: transformers.pipeline };
}

export function buildRealSttBenchAdapter({
  Benchmark,
  pipeline,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  suiteId = "stt-streaming-latency"
}) {
  if (!Benchmark) throw new Error("buildRealSttBenchAdapter requires Benchmark");
  if (typeof pipeline !== "function") throw new Error("buildRealSttBenchAdapter requires a callable pipeline");
  const id = `bench-stt-${suiteId}-${benchmarkVersion.replace(/[^0-9]/g, "")}-${transformersVersion.replace(/[^0-9]/g, "")}`;
  let suite = null;
  let profileResults = [];
  const runtimeCache = new Map();

  return {
    id,
    label: `STT streaming latency bench (benchmark.js ${benchmarkVersion} + Transformers.js ${transformersVersion})`,
    version: benchmarkVersion,
    capabilities: ["profile-comparison", "winner-selection", "real-benchmark", "asr-streaming"],
    benchmarkType: "stt-streaming-latency",
    isReal: true,
    async createBenchmark({ name = suiteId } = {}) {
      const SuiteCtor = Benchmark.Suite || (typeof Benchmark === "function" ? Benchmark.Suite : null);
      if (!SuiteCtor) throw new Error("Benchmark.Suite not available");
      suite = new SuiteCtor(name);
      profileResults = [];
      runtimeCache.clear();
      return suite;
    },
    async runProfile({ profileId, modelId, audio, chunkLengthSeconds = 30 } = {}) {
      if (!suite) throw new Error("createBenchmark() must run before runProfile()");
      if (!profileId || !modelId) throw new Error("runProfile requires profileId and modelId");
      let runtime = runtimeCache.get(modelId);
      if (!runtime) {
        runtime = await pipeline("automatic-speech-recognition", modelId, { device: "webgpu", dtype: "q4" });
        runtimeCache.set(modelId, runtime);
      }
      const startedAt = performance.now();
      const result = await runtime(audio || "audio-fixture", {
        chunk_length_s: chunkLengthSeconds,
        return_timestamps: false
      });
      const elapsedMs = performance.now() - startedAt;
      const transcript = result && result.text ? result.text : "";
      const sampleCount = audio && (audio.length || audio.byteLength) || 0;
      const audioSeconds = sampleCount ? sampleCount / 16000 : chunkLengthSeconds;
      const sample = {
        profileId,
        modelId,
        elapsedMs,
        audioSeconds,
        rtFactor: audioSeconds / Math.max(elapsedMs / 1000, 0.001),
        transcript
      };
      profileResults.push(sample);
      return sample;
    },
    async aggregateResults() {
      if (!profileResults.length) return { profileCount: 0, winner: null, samples: [] };
      const sorted = [...profileResults].sort((left, right) => right.rtFactor - left.rtFactor);
      return { profileCount: sorted.length, winner: sorted[0].profileId, samples: sorted };
    }
  };
}

export async function connectRealSttBench({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null,
  loader = loadBenchmarkAndRuntime,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  suiteId = "stt-streaming-latency"
} = {}) {
  if (!registry) throw new Error("benchmark registry not available");
  const { Benchmark, pipeline } = await loader({ benchmarkVersion, transformersVersion });
  const adapter = buildRealSttBenchAdapter({ Benchmark, pipeline, benchmarkVersion, transformersVersion, suiteId });
  registry.register(adapter);
  return { adapter, Benchmark, pipeline };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-stt-bench" && !window.__aiWebGpuLabRealSttBenchBootstrapping) {
    window.__aiWebGpuLabRealSttBenchBootstrapping = true;
    connectRealSttBench().catch((error) => {
      console.warn(`[real-stt-bench] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealSttBenchBootstrapError = error.message;
    });
  }
}
