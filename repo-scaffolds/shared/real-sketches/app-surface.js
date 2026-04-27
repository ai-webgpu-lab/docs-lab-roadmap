// Real app surface integration sketch for app-blackhole-observatory.
//
// Gated by ?mode=real-surface. The default deterministic harness path is
// untouched. When the gate is active, app.js dynamically imports this module
// which then loads a real dataset manifest over HTTP and registers a real
// app-surface adapter with the registry shipped under public/app-surface-adapter.js.
//
// `loadDatasetManifest` is parameterized so tests can inject a stub instead of
// hitting the network.

const DEFAULT_MANIFEST_URL = "https://ai-webgpu-lab.github.io/app-blackhole-observatory/manifests/observatory-v1.json";

export async function loadDatasetManifest({ url = DEFAULT_MANIFEST_URL, fetchImpl = fetch } = {}) {
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

export function buildRealSurfaceAdapter({
  manifest,
  url = DEFAULT_MANIFEST_URL,
  telemetrySink = null
} = {}) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("buildRealSurfaceAdapter requires a manifest object");
  }
  const id = `observatory-${manifest.id || "manifest"}-${manifest.version || "v0"}`;
  const presets = Array.isArray(manifest.presets) ? manifest.presets : [];

  let loadedDataset = null;
  const telemetryRecords = [];

  return {
    id,
    label: `Real Observatory (${manifest.label || manifest.id || "manifest"})`,
    version: String(manifest.version || "0.1.0"),
    capabilities: ["preset-replay", "renderer-scorecard", "telemetry-record", "real-manifest"],
    surfaceType: "real-manifest",
    isReal: true,
    async loadDataset({ presetId } = {}) {
      const preset = presetId
        ? presets.find((entry) => entry.id === presetId)
        : presets[0];
      if (!preset) {
        throw new Error(`preset not found: ${presetId || "(none)"}`);
      }
      loadedDataset = {
        manifestUrl: url,
        manifestId: manifest.id,
        preset
      };
      return loadedDataset;
    },
    async renderSurface({ canvas, frameIndex = 0 } = {}) {
      if (!loadedDataset) {
        throw new Error("loadDataset() must run before renderSurface()");
      }
      const target = canvas || (typeof document !== "undefined"
        ? document.querySelector("canvas")
        : null);
      const preset = loadedDataset.preset;
      if (target && typeof target.getContext === "function") {
        const ctx = target.getContext("2d");
        if (ctx) {
          ctx.fillStyle = preset.background || "#04060d";
          ctx.fillRect(0, 0, target.width || 320, target.height || 200);
          ctx.fillStyle = preset.accent || "#7dd3fc";
          ctx.font = "16px sans-serif";
          ctx.fillText(`${preset.label} #${frameIndex}`, 16, 28);
        }
      }
      return {
        renderedAt: Date.now(),
        frameIndex,
        presetId: preset.id
      };
    },
    async recordTelemetry(entry) {
      const enriched = {
        ...entry,
        recordedAt: Date.now(),
        manifestId: manifest.id
      };
      telemetryRecords.push(enriched);
      if (telemetrySink && typeof telemetrySink.push === "function") {
        telemetrySink.push(enriched);
      }
      return enriched;
    },
    inspect() {
      return {
        manifest,
        loadedDataset,
        telemetryRecords: [...telemetryRecords]
      };
    }
  };
}

export async function connectRealSurface({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabAppSurfaceRegistry : null,
  loader = loadDatasetManifest,
  url = DEFAULT_MANIFEST_URL,
  telemetrySink = null
} = {}) {
  if (!registry) {
    throw new Error("app surface registry not available");
  }
  const manifest = await loader({ url });
  const adapter = buildRealSurfaceAdapter({ manifest, url, telemetrySink });
  registry.register(adapter);
  return { adapter, manifest };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-surface" && !window.__aiWebGpuLabRealSurfaceBootstrapping) {
    window.__aiWebGpuLabRealSurfaceBootstrapping = true;
    connectRealSurface().catch((error) => {
      console.warn(`[real-surface] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealSurfaceBootstrapError = error.message;
    });
  }
}
