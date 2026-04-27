// Real voice roundtrip benchmark sketch for bench-voice-roundtrip.
//
// Gated by ?mode=real-voice-bench. Default deterministic harness path is
// untouched. `loadBenchmarkAndRuntime` is parameterized so tests can inject stubs.
// Runs Whisper STT + Phi-3 reply per profile and aggregates by total roundtrip.

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

export function buildRealVoiceRoundtripBenchAdapter({
  Benchmark,
  pipeline,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  suiteId = "voice-roundtrip"
}) {
  if (!Benchmark) throw new Error("buildRealVoiceRoundtripBenchAdapter requires Benchmark");
  if (typeof pipeline !== "function") throw new Error("buildRealVoiceRoundtripBenchAdapter requires a callable pipeline");
  const id = `bench-voice-${suiteId}-${benchmarkVersion.replace(/[^0-9]/g, "")}-${transformersVersion.replace(/[^0-9]/g, "")}`;
  let suite = null;
  let profileResults = [];
  const runtimeCache = new Map();

  return {
    id,
    label: `Voice roundtrip bench (benchmark.js ${benchmarkVersion} + Transformers.js ${transformersVersion})`,
    version: benchmarkVersion,
    capabilities: ["profile-comparison", "winner-selection", "real-benchmark", "asr-reply"],
    benchmarkType: "voice-roundtrip",
    isReal: true,
    async createBenchmark({ name = suiteId } = {}) {
      const SuiteCtor = Benchmark.Suite || (typeof Benchmark === "function" ? Benchmark.Suite : null);
      if (!SuiteCtor) throw new Error("Benchmark.Suite not available");
      suite = new SuiteCtor(name);
      profileResults = [];
      runtimeCache.clear();
      return suite;
    },
    async runProfile({ profileId, sttModelId, replyModelId, audio, intent = "general", outputTokens = 64 } = {}) {
      if (!suite) throw new Error("createBenchmark() must run before runProfile()");
      if (!profileId || !sttModelId || !replyModelId) throw new Error("runProfile requires profileId, sttModelId, replyModelId");
      const cacheKey = `${sttModelId}|${replyModelId}`;
      let runtime = runtimeCache.get(cacheKey);
      if (!runtime) {
        const stt = await pipeline("automatic-speech-recognition", sttModelId, { device: "webgpu", dtype: "q4" });
        const reply = await pipeline("text-generation", replyModelId, { device: "webgpu", dtype: "q4" });
        runtime = { stt, reply };
        runtimeCache.set(cacheKey, runtime);
      }
      const sttStart = performance.now();
      const transcript = await runtime.stt(audio || "audio-fixture", { return_timestamps: false });
      const sttMs = performance.now() - sttStart;
      const transcriptText = transcript && transcript.text ? transcript.text : "";
      const replyStart = performance.now();
      const promptText = `Intent: ${intent}\nUser: ${transcriptText}\nAssistant:`;
      const output = await runtime.reply(promptText, { max_new_tokens: outputTokens, return_full_text: false });
      const replyMs = performance.now() - replyStart;
      const replyText = Array.isArray(output) && output[0] && output[0].generated_text ? output[0].generated_text : "";
      const elapsedMs = sttMs + replyMs;
      const tokens = replyText.split(/\s+/).filter(Boolean).length || outputTokens;
      const sample = {
        profileId,
        sttModelId,
        replyModelId,
        elapsedMs,
        roundtripMs: elapsedMs,
        sttMs,
        replyMs,
        transcript: transcriptText,
        text: replyText,
        tokens,
        decodeTokPerSec: tokens / Math.max(elapsedMs / 1000, 0.001)
      };
      profileResults.push(sample);
      return sample;
    },
    async aggregateResults() {
      if (!profileResults.length) return { profileCount: 0, winner: null, samples: [] };
      const sorted = [...profileResults].sort((left, right) => left.roundtripMs - right.roundtripMs);
      return { profileCount: sorted.length, winner: sorted[0].profileId, samples: sorted };
    }
  };
}

export async function connectRealVoiceRoundtripBench({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null,
  loader = loadBenchmarkAndRuntime,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  transformersVersion = DEFAULT_TRANSFORMERS_VERSION,
  suiteId = "voice-roundtrip"
} = {}) {
  if (!registry) throw new Error("benchmark registry not available");
  const { Benchmark, pipeline } = await loader({ benchmarkVersion, transformersVersion });
  const adapter = buildRealVoiceRoundtripBenchAdapter({ Benchmark, pipeline, benchmarkVersion, transformersVersion, suiteId });
  registry.register(adapter);
  return { adapter, Benchmark, pipeline };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-voice-bench" && !window.__aiWebGpuLabRealVoiceBenchBootstrapping) {
    window.__aiWebGpuLabRealVoiceBenchBootstrapping = true;
    connectRealVoiceRoundtripBench().catch((error) => {
      console.warn(`[real-voice-bench] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealVoiceBenchBootstrapError = error.message;
    });
  }
}
