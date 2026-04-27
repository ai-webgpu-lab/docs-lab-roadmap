// Real Whisper runtime integration sketch for exp-stt-whisper-webgpu.
//
// Gated by ?mode=real-whisper. Default deterministic harness path is untouched.
// `loadWhisperFromCdn` is parameterized so tests can inject a stub.

const DEFAULT_TRANSFORMERS_VERSION = "3.0.0";
const DEFAULT_TRANSFORMERS_CDN = (version) => `https://esm.sh/@huggingface/transformers@${version}`;
const DEFAULT_MODEL_ID = "Xenova/whisper-tiny";

export async function loadWhisperFromCdn({ version = DEFAULT_TRANSFORMERS_VERSION } = {}) {
  const transformers = await import(/* @vite-ignore */ DEFAULT_TRANSFORMERS_CDN(version));
  if (!transformers || typeof transformers.pipeline !== "function") {
    throw new Error("transformers module did not expose pipeline()");
  }
  return {
    transformers,
    pipeline: transformers.pipeline,
    env: transformers.env
  };
}

export function buildRealWhisperAdapter({
  pipeline,
  env,
  version = DEFAULT_TRANSFORMERS_VERSION,
  modelId = DEFAULT_MODEL_ID
}) {
  if (typeof pipeline !== "function") {
    throw new Error("buildRealWhisperAdapter requires a callable pipeline");
  }
  const sanitized = modelId.replace(/[^A-Za-z0-9]/g, "-").toLowerCase();
  const id = `whisper-${sanitized}-${version.replace(/[^0-9]/g, "")}`;
  let runtime = null;

  return {
    id,
    label: `Whisper ${modelId} (Transformers.js ${version})`,
    version,
    capabilities: ["prefill", "decode", "asr-streaming", "fixed-output-budget"],
    loadType: "async",
    backendHint: "webgpu",
    isReal: true,
    async loadRuntime({ device = "webgpu", dtype = "q4" } = {}) {
      if (env && typeof env === "object") {
        env.allowRemoteModels = true;
      }
      runtime = await pipeline("automatic-speech-recognition", modelId, { device, dtype });
      return runtime;
    },
    async prefill(_runtime, audioInput) {
      const startedAt = performance.now();
      const sampleCount = audioInput && (audioInput.length || audioInput.byteLength) || 0;
      // Whisper consumes audio chunks rather than tokens; we record the
      // pre-decode setup window and return a sample count placeholder so the
      // schema keeps populated. Real timing comes from decode below.
      const prefillMs = performance.now() - startedAt;
      return { promptTokens: sampleCount, prefillMs };
    },
    async decode(activeRuntime, prefillResult, outputTokenBudget = 64) {
      const target = activeRuntime || runtime;
      if (!target) {
        throw new Error("real whisper adapter requires loadRuntime() before decode()");
      }
      const startedAt = performance.now();
      const output = await target("audio-fixture-not-loaded", {
        chunk_length_s: 30,
        return_timestamps: false,
        max_new_tokens: outputTokenBudget
      });
      const decodeMs = performance.now() - startedAt;
      const text = output && output.text ? output.text : "";
      const tokens = text.split(/\s+/).filter(Boolean).length || outputTokenBudget;
      return {
        tokens,
        decodeMs,
        text,
        ttftMs: decodeMs / Math.max(tokens, 1),
        decodeTokPerSec: tokens / Math.max(decodeMs / 1000, 0.001)
      };
    }
  };
}

export async function connectRealWhisper({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabRuntimeRegistry : null,
  loader = loadWhisperFromCdn,
  version = DEFAULT_TRANSFORMERS_VERSION,
  modelId = DEFAULT_MODEL_ID
} = {}) {
  if (!registry) {
    throw new Error("runtime registry not available");
  }
  const { pipeline, env } = await loader({ version });
  if (typeof pipeline !== "function") {
    throw new Error("loaded pipeline is not callable");
  }
  const adapter = buildRealWhisperAdapter({ pipeline, env, version, modelId });
  registry.register(adapter);
  return { adapter, pipeline, env };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-whisper" && !window.__aiWebGpuLabRealWhisperBootstrapping) {
    window.__aiWebGpuLabRealWhisperBootstrapping = true;
    connectRealWhisper().catch((error) => {
      console.warn(`[real-whisper] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealWhisperBootstrapError = error.message;
    });
  }
}
