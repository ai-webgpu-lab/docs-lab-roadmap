// Real WebLLM integration sketch for exp-webllm-browser-chat.
//
// Gated by ?mode=real-webllm. Default deterministic harness path is untouched.
// `loadWebLLMFromCdn` is parameterized so tests can inject a stub.

const DEFAULT_WEBLLM_VERSION = "0.2.78";
const DEFAULT_WEBLLM_CDN = (version) => `https://esm.sh/@mlc-ai/web-llm@${version}`;
const DEFAULT_MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

export async function loadWebLLMFromCdn({ version = DEFAULT_WEBLLM_VERSION } = {}) {
  const webllm = await import(/* @vite-ignore */ DEFAULT_WEBLLM_CDN(version));
  if (!webllm || typeof webllm.CreateMLCEngine !== "function") {
    throw new Error("@mlc-ai/web-llm did not expose CreateMLCEngine");
  }
  return { webllm, CreateMLCEngine: webllm.CreateMLCEngine };
}

export function buildRealWebLLMAdapter({
  CreateMLCEngine,
  version = DEFAULT_WEBLLM_VERSION,
  modelId = DEFAULT_MODEL_ID
}) {
  if (typeof CreateMLCEngine !== "function") {
    throw new Error("buildRealWebLLMAdapter requires CreateMLCEngine");
  }
  const sanitized = modelId.replace(/[^A-Za-z0-9]/g, "-").toLowerCase();
  const id = `webllm-${sanitized}-${version.replace(/[^0-9]/g, "")}`;
  let engine = null;

  return {
    id,
    label: `WebLLM ${version} ${modelId}`,
    version,
    capabilities: ["prefill", "decode", "streaming", "fixed-output-budget"],
    loadType: "async",
    backendHint: "webgpu",
    isReal: true,
    async loadRuntime({ initProgressCallback = null } = {}) {
      engine = await CreateMLCEngine(modelId, initProgressCallback ? { initProgressCallback } : {});
      return engine;
    },
    async prefill(_runtime, prompt) {
      const startedAt = performance.now();
      const text = typeof prompt === "string" ? prompt : (prompt && prompt.text) || "";
      const promptTokens = text.trim().split(/\s+/).filter(Boolean).length;
      const prefillMs = performance.now() - startedAt;
      return { promptTokens, prefillMs, text };
    },
    async decode(activeEngine, prefillResult, outputTokenBudget = 64) {
      const target = activeEngine || engine;
      if (!target || !target.chat || typeof target.chat.completions?.create !== "function") {
        throw new Error("real webllm adapter requires loadRuntime() before decode()");
      }
      const startedAt = performance.now();
      const reply = await target.chat.completions.create({
        messages: [{ role: "user", content: prefillResult.text || "Hello" }],
        max_tokens: outputTokenBudget,
        temperature: 0
      });
      const decodeMs = performance.now() - startedAt;
      const text = reply && reply.choices && reply.choices[0] && reply.choices[0].message
        ? reply.choices[0].message.content
        : "";
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

export async function connectRealWebLLM({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabRuntimeRegistry : null,
  loader = loadWebLLMFromCdn,
  version = DEFAULT_WEBLLM_VERSION,
  modelId = DEFAULT_MODEL_ID
} = {}) {
  if (!registry) {
    throw new Error("runtime registry not available");
  }
  const { CreateMLCEngine } = await loader({ version });
  if (typeof CreateMLCEngine !== "function") {
    throw new Error("loaded module is missing CreateMLCEngine");
  }
  const adapter = buildRealWebLLMAdapter({ CreateMLCEngine, version, modelId });
  registry.register(adapter);
  return { adapter, CreateMLCEngine };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-webllm" && !window.__aiWebGpuLabRealWebLLMBootstrapping) {
    window.__aiWebGpuLabRealWebLLMBootstrapping = true;
    connectRealWebLLM().catch((error) => {
      console.warn(`[real-webllm] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealWebLLMBootstrapError = error.message;
    });
  }
}
