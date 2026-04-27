// Real browser-agent runtime integration sketch for exp-browser-agent-local.
//
// Gated by ?mode=real-browser-agent. Default deterministic harness path is
// untouched. `loadAgentFromCdn` is parameterized so tests can inject a stub.

const DEFAULT_TRANSFORMERS_VERSION = "3.0.0";
const DEFAULT_TRANSFORMERS_CDN = (version) => `https://esm.sh/@huggingface/transformers@${version}`;
const DEFAULT_MODEL_ID = "Xenova/Phi-3-mini-4k-instruct";
const DEFAULT_TASK = "text-generation";

export async function loadAgentFromCdn({ version = DEFAULT_TRANSFORMERS_VERSION } = {}) {
  const transformers = await import(/* @vite-ignore */ DEFAULT_TRANSFORMERS_CDN(version));
  if (!transformers || typeof transformers.pipeline !== "function") {
    throw new Error("transformers module did not expose pipeline()");
  }
  return { transformers, pipeline: transformers.pipeline, env: transformers.env };
}

export function buildRealBrowserAgentAdapter({
  pipeline,
  env,
  version = DEFAULT_TRANSFORMERS_VERSION,
  modelId = DEFAULT_MODEL_ID,
  task = DEFAULT_TASK
}) {
  if (typeof pipeline !== "function") {
    throw new Error("buildRealBrowserAgentAdapter requires a callable pipeline");
  }
  const sanitized = modelId.replace(/[^A-Za-z0-9]/g, "-").toLowerCase();
  const id = `browser-agent-${sanitized}-${version.replace(/[^0-9]/g, "")}`;
  let runtime = null;

  return {
    id,
    label: `Browser Agent ${modelId} (Transformers.js ${version})`,
    version,
    capabilities: ["prefill", "decode", "agent-step", "tool-call", "fixed-output-budget"],
    loadType: "async",
    backendHint: "webgpu",
    isReal: true,
    async loadRuntime({ device = "webgpu", dtype = "q4" } = {}) {
      if (env && typeof env === "object") env.allowRemoteModels = true;
      runtime = await pipeline(task, modelId, { device, dtype });
      return runtime;
    },
    async prefill(_runtime, prompt) {
      const startedAt = performance.now();
      const taskDescription = (prompt && prompt.task) || String(prompt || "");
      const promptTokens = taskDescription.trim().split(/\s+/).filter(Boolean).length;
      const prefillMs = performance.now() - startedAt;
      return { promptTokens, prefillMs, task: taskDescription, tools: prompt && prompt.tools };
    },
    async decode(activeRuntime, prefillResult, outputTokenBudget = 96) {
      const target = activeRuntime || runtime;
      if (!target) {
        throw new Error("real browser-agent adapter requires loadRuntime() before decode()");
      }
      const startedAt = performance.now();
      const taskText = `Task: ${prefillResult.task}\nTools: ${(prefillResult.tools || []).join(", ")}\nPlan:`;
      const output = await target(taskText, { max_new_tokens: outputTokenBudget, return_full_text: false });
      const decodeMs = performance.now() - startedAt;
      const text = Array.isArray(output) && output[0] && output[0].generated_text
        ? output[0].generated_text
        : "";
      const tokens = text.split(/\s+/).filter(Boolean).length || outputTokenBudget;
      const stepCount = (text.match(/\n/g) || []).length + 1;
      return {
        tokens,
        decodeMs,
        text,
        stepCount,
        ttftMs: decodeMs / Math.max(tokens, 1),
        decodeTokPerSec: tokens / Math.max(decodeMs / 1000, 0.001)
      };
    }
  };
}

export async function connectRealBrowserAgent({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabRuntimeRegistry : null,
  loader = loadAgentFromCdn,
  version = DEFAULT_TRANSFORMERS_VERSION,
  modelId = DEFAULT_MODEL_ID,
  task = DEFAULT_TASK
} = {}) {
  if (!registry) {
    throw new Error("runtime registry not available");
  }
  const { pipeline, env } = await loader({ version });
  if (typeof pipeline !== "function") {
    throw new Error("loaded pipeline is not callable");
  }
  const adapter = buildRealBrowserAgentAdapter({ pipeline, env, version, modelId, task });
  registry.register(adapter);
  return { adapter, pipeline, env };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-browser-agent" && !window.__aiWebGpuLabRealBrowserAgentBootstrapping) {
    window.__aiWebGpuLabRealBrowserAgentBootstrapping = true;
    connectRealBrowserAgent().catch((error) => {
      console.warn(`[real-browser-agent] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealBrowserAgentBootstrapError = error.message;
    });
  }
}
