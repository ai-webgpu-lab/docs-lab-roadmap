// Real app surface integration sketch for app-local-chat-arena.
//
// Gated by ?mode=real-chat-arena. Default deterministic harness path is
// untouched. `loadArenaManifest` is parameterized so tests can inject a stub.

const DEFAULT_MANIFEST_URL = "https://ai-webgpu-lab.github.io/app-local-chat-arena/manifests/arena-v1.json";

export async function loadArenaManifest({ url = DEFAULT_MANIFEST_URL, fetchImpl = fetch } = {}) {
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

export function buildRealChatArenaAdapter({ manifest, url = DEFAULT_MANIFEST_URL, telemetrySink = null } = {}) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("buildRealChatArenaAdapter requires a manifest object");
  }
  const id = `chat-arena-${manifest.id || "manifest"}-${manifest.version || "v0"}`;
  const matchups = Array.isArray(manifest.matchups) ? manifest.matchups : [];
  let loadedDataset = null;
  const telemetryRecords = [];

  return {
    id,
    label: `Real Local Chat Arena (${manifest.label || manifest.id || "manifest"})`,
    version: String(manifest.version || "0.1.0"),
    capabilities: ["preset-replay", "renderer-scorecard", "telemetry-record", "real-manifest", "chat-matchup"],
    surfaceType: "real-chat-matchup",
    isReal: true,
    async loadDataset({ matchupId } = {}) {
      const matchup = matchupId
        ? matchups.find((entry) => entry.id === matchupId)
        : matchups[0];
      if (!matchup) {
        throw new Error(`matchup not found: ${matchupId || "(none)"}`);
      }
      loadedDataset = { manifestUrl: url, manifestId: manifest.id, matchup };
      return loadedDataset;
    },
    async renderSurface({ canvas, frameIndex = 0 } = {}) {
      if (!loadedDataset) {
        throw new Error("loadDataset() must run before renderSurface()");
      }
      const target = canvas || (typeof document !== "undefined" ? document.querySelector("canvas") : null);
      const matchup = loadedDataset.matchup;
      if (target && typeof target.getContext === "function") {
        const ctx = target.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#0a0612";
          ctx.fillRect(0, 0, target.width || 320, target.height || 200);
          ctx.fillStyle = "#a78bfa";
          ctx.font = "16px sans-serif";
          ctx.fillText(`${matchup.label} #${frameIndex}`, 16, 28);
        }
      }
      return { renderedAt: Date.now(), frameIndex, matchupId: matchup.id };
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

export async function connectRealChatArena({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabAppSurfaceRegistry : null,
  loader = loadArenaManifest,
  url = DEFAULT_MANIFEST_URL,
  telemetrySink = null
} = {}) {
  if (!registry) {
    throw new Error("app surface registry not available");
  }
  const manifest = await loader({ url });
  const adapter = buildRealChatArenaAdapter({ manifest, url, telemetrySink });
  registry.register(adapter);
  return { adapter, manifest };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-chat-arena" && !window.__aiWebGpuLabRealChatArenaBootstrapping) {
    window.__aiWebGpuLabRealChatArenaBootstrapping = true;
    connectRealChatArena().catch((error) => {
      console.warn(`[real-chat-arena] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealChatArenaBootstrapError = error.message;
    });
  }
}
