// Real app surface integration sketch for app-browser-image-lab.
//
// Gated by ?mode=real-image-lab. Default deterministic harness path is
// untouched. `loadImageLabManifest` is parameterized so tests can inject a stub.

const DEFAULT_MANIFEST_URL = "https://ai-webgpu-lab.github.io/app-browser-image-lab/manifests/image-lab-v1.json";

export async function loadImageLabManifest({ url = DEFAULT_MANIFEST_URL, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, { cache: "no-store" });
  if (!response || typeof response.json !== "function" || (typeof response.ok === "boolean" && !response.ok)) {
    throw new Error(`manifest fetch failed for ${url}`);
  }
  const manifest = await response.json();
  if (!manifest || typeof manifest !== "object") {
    throw new Error("manifest payload is not an object");
  }
  return manifest;
}

export function buildRealImageLabAdapter({ manifest, url = DEFAULT_MANIFEST_URL, telemetrySink = null } = {}) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("buildRealImageLabAdapter requires a manifest object");
  }
  const id = `image-lab-${manifest.id || "manifest"}-${manifest.version || "v0"}`;
  const prompts = Array.isArray(manifest.prompts) ? manifest.prompts : [];
  let loadedDataset = null;
  const telemetryRecords = [];

  return {
    id,
    label: `Real Browser Image Lab (${manifest.label || manifest.id || "manifest"})`,
    version: String(manifest.version || "0.1.0"),
    capabilities: ["preset-replay", "renderer-scorecard", "telemetry-record", "real-manifest", "image-prompt"],
    surfaceType: "real-image-prompt",
    isReal: true,
    async loadDataset({ promptId } = {}) {
      const prompt = promptId
        ? prompts.find((entry) => entry.id === promptId)
        : prompts[0];
      if (!prompt) {
        throw new Error(`prompt not found: ${promptId || "(none)"}`);
      }
      loadedDataset = { manifestUrl: url, manifestId: manifest.id, prompt };
      return loadedDataset;
    },
    async renderSurface({ canvas, frameIndex = 0 } = {}) {
      if (!loadedDataset) {
        throw new Error("loadDataset() must run before renderSurface()");
      }
      const target = canvas || (typeof document !== "undefined" ? document.querySelector("canvas") : null);
      const prompt = loadedDataset.prompt;
      if (target && typeof target.getContext === "function") {
        const ctx = target.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#100a14";
          ctx.fillRect(0, 0, target.width || 320, target.height || 200);
          ctx.fillStyle = "#fb923c";
          ctx.font = "16px sans-serif";
          ctx.fillText(`${prompt.label} #${frameIndex}`, 16, 28);
        }
      }
      return { renderedAt: Date.now(), frameIndex, promptId: prompt.id };
    },
    async recordTelemetry(entry) {
      const enriched = { ...entry, recordedAt: Date.now(), manifestId: manifest.id };
      telemetryRecords.push(enriched);
      if (telemetrySink && typeof telemetrySink.push === "function") telemetrySink.push(enriched);
      return enriched;
    },
    inspect() { return { manifest, loadedDataset, telemetryRecords: [...telemetryRecords] }; }
  };
}

export async function connectRealImageLab({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabAppSurfaceRegistry : null,
  loader = loadImageLabManifest,
  url = DEFAULT_MANIFEST_URL,
  telemetrySink = null
} = {}) {
  if (!registry) {
    throw new Error("app surface registry not available");
  }
  const manifest = await loader({ url });
  const adapter = buildRealImageLabAdapter({ manifest, url, telemetrySink });
  registry.register(adapter);
  return { adapter, manifest };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-image-lab" && !window.__aiWebGpuLabRealImageLabBootstrapping) {
    window.__aiWebGpuLabRealImageLabBootstrapping = true;
    connectRealImageLab().catch((error) => {
      console.warn(`[real-image-lab] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealImageLabBootstrapError = error.message;
    });
  }
}
