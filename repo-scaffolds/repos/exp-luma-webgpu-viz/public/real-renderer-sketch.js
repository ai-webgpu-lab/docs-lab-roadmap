// Real luma.gl WebGPU integration sketch for exp-luma-webgpu-viz.
//
// Gated by ?mode=real-luma. Default deterministic harness path is untouched.
// `loadLumaFromCdn` is parameterized so tests can inject a stub.

const DEFAULT_LUMA_VERSION = "9.0.0";
const DEFAULT_LUMA_ENGINE_CDN = (version) => `https://esm.sh/@luma.gl/engine@${version}`;
const DEFAULT_LUMA_WEBGPU_CDN = (version) => `https://esm.sh/@luma.gl/webgpu@${version}`;

export async function loadLumaFromCdn({ version = DEFAULT_LUMA_VERSION } = {}) {
  const [engine, webgpu] = await Promise.all([
    import(/* @vite-ignore */ DEFAULT_LUMA_ENGINE_CDN(version)),
    import(/* @vite-ignore */ DEFAULT_LUMA_WEBGPU_CDN(version))
  ]);
  if (!engine || typeof engine.luma === "undefined") {
    throw new Error("luma.gl engine module did not expose luma");
  }
  return { engine, webgpu, luma: engine.luma, WebGPUDevice: webgpu.WebGPUDevice };
}

export function buildRealLumaAdapter({ luma, WebGPUDevice, version = DEFAULT_LUMA_VERSION }) {
  if (!luma) {
    throw new Error("buildRealLumaAdapter requires luma");
  }
  const id = `luma-webgpu-${version.replace(/[^0-9]/g, "")}`;
  let device = null;
  let layers = [];

  return {
    id,
    label: `luma.gl ${version} WebGPU`,
    version,
    capabilities: ["scene-load", "frame-pace", "fallback-record", "real-render"],
    backendHint: "webgpu",
    isReal: true,
    async createRenderer({ canvas } = {}) {
      const target = canvas || (typeof document !== "undefined" ? document.querySelector("canvas") : null);
      if (!target) {
        throw new Error("real renderer requires a <canvas> element");
      }
      const adapters = WebGPUDevice ? [WebGPUDevice] : [];
      device = await luma.createDevice({ canvas: target, type: "webgpu", adapters });
      return device;
    },
    async loadScene({ pointCount = 256 } = {}) {
      if (!device) {
        throw new Error("createRenderer() must run before loadScene()");
      }
      layers = [];
      for (let index = 0; index < pointCount; index += 1) {
        const angle = (index / pointCount) * Math.PI * 2;
        layers.push({
          x: Math.cos(angle) * 0.75,
          y: Math.sin(angle * 0.7) * 0.45,
          z: Math.sin(angle) * 0.75,
          color: [0.4 + (index % 8) * 0.08, 0.55, 0.85]
        });
      }
      return { device, layers };
    },
    async renderFrame({ frameIndex = 0 } = {}) {
      if (!device) {
        throw new Error("device must be created before renderFrame");
      }
      const startedAt = performance.now();
      if (typeof device.render === "function") {
        await device.render({ frameIndex, layers });
      }
      return { frameMs: performance.now() - startedAt };
    }
  };
}

export async function connectRealLuma({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabRendererRegistry : null,
  loader = loadLumaFromCdn,
  version = DEFAULT_LUMA_VERSION
} = {}) {
  if (!registry) {
    throw new Error("renderer registry not available");
  }
  const { luma, WebGPUDevice } = await loader({ version });
  const adapter = buildRealLumaAdapter({ luma, WebGPUDevice, version });
  registry.register(adapter);
  return { adapter, luma, WebGPUDevice };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-luma" && !window.__aiWebGpuLabRealLumaBootstrapping) {
    window.__aiWebGpuLabRealLumaBootstrapping = true;
    connectRealLuma().catch((error) => {
      console.warn(`[real-luma] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealLumaBootstrapError = error.message;
    });
  }
}
