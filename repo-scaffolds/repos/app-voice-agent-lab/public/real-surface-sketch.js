// Real app surface integration sketch for app-voice-agent-lab.
//
// Gated by ?mode=real-voice-agent. Default deterministic harness path is
// untouched. `loadVoiceAgentManifest` is parameterized so tests can inject a stub.

const DEFAULT_MANIFEST_URL = "https://ai-webgpu-lab.github.io/app-voice-agent-lab/manifests/voice-agent-v1.json";

export async function loadVoiceAgentManifest({ url = DEFAULT_MANIFEST_URL, fetchImpl = fetch } = {}) {
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

export function buildRealVoiceAgentAdapter({ manifest, url = DEFAULT_MANIFEST_URL, telemetrySink = null } = {}) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("buildRealVoiceAgentAdapter requires a manifest object");
  }
  const id = `voice-agent-${manifest.id || "manifest"}-${manifest.version || "v0"}`;
  const tasks = Array.isArray(manifest.tasks) ? manifest.tasks : [];
  let loadedDataset = null;
  const telemetryRecords = [];

  return {
    id,
    label: `Real Voice Agent Lab (${manifest.label || manifest.id || "manifest"})`,
    version: String(manifest.version || "0.1.0"),
    capabilities: ["preset-replay", "renderer-scorecard", "telemetry-record", "real-manifest", "voice-task"],
    surfaceType: "real-voice-task",
    isReal: true,
    async loadDataset({ taskId } = {}) {
      const task = taskId
        ? tasks.find((entry) => entry.id === taskId)
        : tasks[0];
      if (!task) {
        throw new Error(`task not found: ${taskId || "(none)"}`);
      }
      loadedDataset = { manifestUrl: url, manifestId: manifest.id, task };
      return loadedDataset;
    },
    async renderSurface({ canvas, frameIndex = 0 } = {}) {
      if (!loadedDataset) {
        throw new Error("loadDataset() must run before renderSurface()");
      }
      const target = canvas || (typeof document !== "undefined" ? document.querySelector("canvas") : null);
      const task = loadedDataset.task;
      if (target && typeof target.getContext === "function") {
        const ctx = target.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#031218";
          ctx.fillRect(0, 0, target.width || 320, target.height || 200);
          ctx.fillStyle = "#34d399";
          ctx.font = "16px sans-serif";
          ctx.fillText(`${task.label} #${frameIndex}`, 16, 28);
        }
      }
      return { renderedAt: Date.now(), frameIndex, taskId: task.id };
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

export async function connectRealVoiceAgent({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabAppSurfaceRegistry : null,
  loader = loadVoiceAgentManifest,
  url = DEFAULT_MANIFEST_URL,
  telemetrySink = null
} = {}) {
  if (!registry) {
    throw new Error("app surface registry not available");
  }
  const manifest = await loader({ url });
  const adapter = buildRealVoiceAgentAdapter({ manifest, url, telemetrySink });
  registry.register(adapter);
  return { adapter, manifest };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-voice-agent" && !window.__aiWebGpuLabRealVoiceAgentBootstrapping) {
    window.__aiWebGpuLabRealVoiceAgentBootstrapping = true;
    connectRealVoiceAgent().catch((error) => {
      console.warn(`[real-voice-agent] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealVoiceAgentBootstrapError = error.message;
    });
  }
}
