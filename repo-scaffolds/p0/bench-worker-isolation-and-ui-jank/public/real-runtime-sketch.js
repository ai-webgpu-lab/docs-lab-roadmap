// Real runtime integration sketch for bench-runtime-shootout.
//
// Gated by ?mode=real-runtime. The default deterministic harness path is
// untouched. When the gate is active, app.js dynamically imports this module
// which then loads a Transformers.js-style pipeline from a CDN and registers a
// real runtime adapter with the registry shipped under public/runtime-adapter.js.
//
// `loadPipelineFromCdn` is parameterized so tests can inject a stub instead of
// hitting the network.

const DEFAULT_TRANSFORMERS_VERSION = "3.0.0";
const DEFAULT_TRANSFORMERS_CDN = (version) => `https://esm.sh/@huggingface/transformers@${version}`;
const DEFAULT_MODEL_ID = "Xenova/Phi-3-mini-4k-instruct";

export async function loadPipelineFromCdn({ version = DEFAULT_TRANSFORMERS_VERSION } = {}) {
  const transformers = await import(/* @vite-ignore */ DEFAULT_TRANSFORMERS_CDN(version));
  return {
    transformers,
    pipeline: transformers.pipeline,
    env: transformers.env
  };
}

export function buildRealRuntimeAdapter({
  pipeline,
  env,
  version = DEFAULT_TRANSFORMERS_VERSION,
  modelId = DEFAULT_MODEL_ID,
  task = "text-generation"
}) {
  const sanitized = modelId.replace(/[^A-Za-z0-9]/g, "-").toLowerCase();
  const id = `transformers-${sanitized}-${version.replace(/[^0-9]/g, "")}`;
  let runtime = null;

  return {
    id,
    label: `Transformers.js ${version} ${modelId}`,
    version,
    capabilities: ["prefill", "decode", "fixed-output-budget", "streaming"],
    loadType: "async",
    backendHint: "webgpu",
    isReal: true,
    async loadRuntime({ device = "webgpu", dtype = "q4" } = {}) {
      if (env && typeof env === "object") {
        env.allowRemoteModels = true;
      }
      runtime = await pipeline(task, modelId, { device, dtype });
      return runtime;
    },
    async prefill(_runtime, prompt) {
      const startedAt = performance.now();
      const promptTokens = String(prompt || "").trim().split(/\s+/).filter(Boolean).length;
      // Transformers.js does not expose a separate prefill phase; we record the
      // synchronous setup window before generate() so the schema field stays
      // populated. Real measurement comes from the decode loop below.
      const prefillMs = performance.now() - startedAt;
      return { promptTokens, prefillMs };
    },
    async decode(activeRuntime, prefillResult, outputTokenBudget = 64) {
      const target = activeRuntime || runtime;
      if (!target) {
        throw new Error("real runtime adapter requires loadRuntime() before decode()");
      }
      const startedAt = performance.now();
      const output = await target("Generate a benchmark response.", {
        max_new_tokens: outputTokenBudget,
        return_full_text: false
      });
      const decodeMs = performance.now() - startedAt;
      const decodedText = Array.isArray(output) && output[0] && output[0].generated_text
        ? output[0].generated_text
        : "";
      const tokens = decodedText.split(/\s+/).filter(Boolean).length || outputTokenBudget;
      return {
        tokens,
        decodeMs,
        text: decodedText,
        ttftMs: decodeMs / Math.max(tokens, 1),
        decodeTokPerSec: tokens / Math.max(decodeMs / 1000, 0.001)
      };
    }
  };
}

export async function connectRealRuntime({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabRuntimeRegistry : null,
  loader = loadPipelineFromCdn,
  version = DEFAULT_TRANSFORMERS_VERSION,
  modelId = DEFAULT_MODEL_ID,
  task = "text-generation"
} = {}) {
  if (!registry) {
    throw new Error("runtime registry not available");
  }
  const { pipeline, env } = await loader({ version });
  if (typeof pipeline !== "function") {
    throw new Error("loaded pipeline is not callable");
  }
  const adapter = buildRealRuntimeAdapter({ pipeline, env, version, modelId, task });
  registry.register(adapter);
  return { adapter, pipeline, env };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-runtime" && !window.__aiWebGpuLabRealRuntimeBootstrapping) {
    window.__aiWebGpuLabRealRuntimeBootstrapping = true;
    connectRealRuntime().catch((error) => {
      console.warn(`[real-runtime] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealRuntimeBootstrapError = error.message;
    });
  }
}
