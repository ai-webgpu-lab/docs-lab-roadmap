// Real app surface integration sketch for app-private-rag-lab.
//
// Gated by ?mode=real-private-rag. Default deterministic harness path is
// untouched. `loadCorpusManifest` is parameterized so tests can inject a stub.

const DEFAULT_MANIFEST_URL = "https://ai-webgpu-lab.github.io/app-private-rag-lab/manifests/corpus-v1.json";

export async function loadCorpusManifest({ url = DEFAULT_MANIFEST_URL, fetchImpl = fetch } = {}) {
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

export function buildRealPrivateRagAdapter({ manifest, url = DEFAULT_MANIFEST_URL, telemetrySink = null } = {}) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("buildRealPrivateRagAdapter requires a manifest object");
  }
  const id = `private-rag-${manifest.id || "manifest"}-${manifest.version || "v0"}`;
  const collections = Array.isArray(manifest.collections) ? manifest.collections : [];
  let loadedDataset = null;
  const telemetryRecords = [];

  return {
    id,
    label: `Real Private RAG (${manifest.label || manifest.id || "manifest"})`,
    version: String(manifest.version || "0.1.0"),
    capabilities: ["preset-replay", "renderer-scorecard", "telemetry-record", "real-manifest", "rag-corpus"],
    surfaceType: "real-rag-corpus",
    isReal: true,
    async loadDataset({ collectionId } = {}) {
      const collection = collectionId
        ? collections.find((entry) => entry.id === collectionId)
        : collections[0];
      if (!collection) {
        throw new Error(`collection not found: ${collectionId || "(none)"}`);
      }
      loadedDataset = { manifestUrl: url, manifestId: manifest.id, collection };
      return loadedDataset;
    },
    async renderSurface({ canvas, frameIndex = 0 } = {}) {
      if (!loadedDataset) {
        throw new Error("loadDataset() must run before renderSurface()");
      }
      const target = canvas || (typeof document !== "undefined" ? document.querySelector("canvas") : null);
      const collection = loadedDataset.collection;
      if (target && typeof target.getContext === "function") {
        const ctx = target.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#06090f";
          ctx.fillRect(0, 0, target.width || 320, target.height || 200);
          ctx.fillStyle = "#7dd3fc";
          ctx.font = "16px sans-serif";
          ctx.fillText(`${collection.label} #${frameIndex}`, 16, 28);
        }
      }
      return { renderedAt: Date.now(), frameIndex, collectionId: collection.id };
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

export async function connectRealPrivateRag({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabAppSurfaceRegistry : null,
  loader = loadCorpusManifest,
  url = DEFAULT_MANIFEST_URL,
  telemetrySink = null
} = {}) {
  if (!registry) {
    throw new Error("app surface registry not available");
  }
  const manifest = await loader({ url });
  const adapter = buildRealPrivateRagAdapter({ manifest, url, telemetrySink });
  registry.register(adapter);
  return { adapter, manifest };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-private-rag" && !window.__aiWebGpuLabRealPrivateRagBootstrapping) {
    window.__aiWebGpuLabRealPrivateRagBootstrapping = true;
    connectRealPrivateRag().catch((error) => {
      console.warn(`[real-private-rag] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealPrivateRagBootstrapError = error.message;
    });
  }
}
