// Real embedding runtime integration sketch for exp-embeddings-browser-throughput.
//
// Gated by ?mode=real-embeddings. Default deterministic harness path is untouched.
// `loadEmbedderFromCdn` is parameterized so tests can inject a stub.

const DEFAULT_TRANSFORMERS_VERSION = "3.0.0";
const DEFAULT_TRANSFORMERS_CDN = (version) => `https://esm.sh/@huggingface/transformers@${version}`;
const DEFAULT_MODEL_ID = "Xenova/bge-small-en-v1.5";

export async function loadEmbedderFromCdn({ version = DEFAULT_TRANSFORMERS_VERSION } = {}) {
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

export function buildRealEmbeddingAdapter({
  pipeline,
  env,
  version = DEFAULT_TRANSFORMERS_VERSION,
  modelId = DEFAULT_MODEL_ID
}) {
  if (typeof pipeline !== "function") {
    throw new Error("buildRealEmbeddingAdapter requires a callable pipeline");
  }
  const sanitized = modelId.replace(/[^A-Za-z0-9]/g, "-").toLowerCase();
  const id = `embeddings-${sanitized}-${version.replace(/[^0-9]/g, "")}`;
  let runtime = null;

  return {
    id,
    label: `Embeddings ${modelId} (Transformers.js ${version})`,
    version,
    capabilities: ["prefill", "decode", "feature-extraction", "fixed-output-budget"],
    loadType: "async",
    backendHint: "webgpu",
    isReal: true,
    async loadRuntime({ device = "webgpu", dtype = "fp32" } = {}) {
      if (env && typeof env === "object") {
        env.allowRemoteModels = true;
      }
      runtime = await pipeline("feature-extraction", modelId, { device, dtype });
      return runtime;
    },
    async prefill(_runtime, prompt) {
      const startedAt = performance.now();
      const text = String(prompt || "");
      const promptTokens = text.trim().split(/\s+/).filter(Boolean).length;
      const prefillMs = performance.now() - startedAt;
      return { promptTokens, prefillMs, text };
    },
    async decode(activeRuntime, prefillResult, outputTokenBudget = 1) {
      const target = activeRuntime || runtime;
      if (!target) {
        throw new Error("real embedding adapter requires loadRuntime() before decode()");
      }
      const text = (prefillResult && prefillResult.text) || "embedding-input";
      const startedAt = performance.now();
      const output = await target(text, { pooling: "mean", normalize: true });
      const decodeMs = performance.now() - startedAt;
      const dimensions = output && output.dims && output.dims[output.dims.length - 1]
        ? output.dims[output.dims.length - 1]
        : (Array.isArray(output) ? output.length : 0);
      const tokens = outputTokenBudget;
      return {
        tokens,
        decodeMs,
        text,
        dimensions,
        ttftMs: decodeMs,
        decodeTokPerSec: tokens / Math.max(decodeMs / 1000, 0.001)
      };
    }
  };
}

export async function connectRealEmbedding({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabRuntimeRegistry : null,
  loader = loadEmbedderFromCdn,
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
  const adapter = buildRealEmbeddingAdapter({ pipeline, env, version, modelId });
  registry.register(adapter);
  return { adapter, pipeline, env };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-embeddings" && !window.__aiWebGpuLabRealEmbeddingsBootstrapping) {
    window.__aiWebGpuLabRealEmbeddingsBootstrapping = true;
    connectRealEmbedding().catch((error) => {
      console.warn(`[real-embeddings] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealEmbeddingsBootstrapError = error.message;
    });
  }
}
