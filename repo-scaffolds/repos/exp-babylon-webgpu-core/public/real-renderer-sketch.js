// Real Babylon.js WebGPUEngine integration sketch for exp-babylon-webgpu-core.
//
// Gated by ?mode=real-babylon. Default deterministic harness path is untouched.
// `loadBabylonFromCdn` is parameterized so tests can inject a stub.

const DEFAULT_BABYLON_VERSION = "6.49.0";
const DEFAULT_BABYLON_CDN = (version) => `https://esm.sh/@babylonjs/core@${version}`;

export async function loadBabylonFromCdn({ version = DEFAULT_BABYLON_VERSION } = {}) {
  const babylon = await import(/* @vite-ignore */ DEFAULT_BABYLON_CDN(version));
  if (!babylon || typeof babylon.WebGPUEngine !== "function") {
    throw new Error("babylon module did not expose WebGPUEngine");
  }
  return { babylon, WebGPUEngine: babylon.WebGPUEngine };
}

export function buildRealBabylonAdapter({ babylon, WebGPUEngine, version = DEFAULT_BABYLON_VERSION }) {
  if (!babylon || typeof WebGPUEngine !== "function") {
    throw new Error("buildRealBabylonAdapter requires babylon and WebGPUEngine");
  }
  const id = `babylon-webgpu-${version.replace(/[^0-9]/g, "")}`;
  let engine = null;
  let scene = null;
  let camera = null;

  return {
    id,
    label: `Babylon.js ${version} WebGPUEngine`,
    version,
    capabilities: ["scene-load", "frame-pace", "fallback-record", "real-render"],
    backendHint: "webgpu",
    isReal: true,
    async createRenderer({ canvas } = {}) {
      const target = canvas || (typeof document !== "undefined" ? document.querySelector("canvas") : null);
      if (!target) {
        throw new Error("real renderer requires a <canvas> element");
      }
      engine = new WebGPUEngine(target);
      if (typeof engine.initAsync === "function") {
        await engine.initAsync();
      }
      return engine;
    },
    async loadScene({ submeshCount = 24 } = {}) {
      if (!engine) {
        throw new Error("createRenderer() must run before loadScene()");
      }
      scene = new babylon.Scene(engine);
      camera = new babylon.ArcRotateCamera("camera", 0, 1.1, 4, babylon.Vector3.Zero(), scene);
      const light = new babylon.HemisphericLight("light", new babylon.Vector3(0, 1, 0), scene);
      light.intensity = 0.9;
      for (let index = 0; index < submeshCount; index += 1) {
        const sphere = babylon.MeshBuilder.CreateSphere(`sphere-${index}`, { diameter: 0.18 }, scene);
        const angle = (index / submeshCount) * Math.PI * 2;
        sphere.position = new babylon.Vector3(Math.cos(angle) * 1.2, Math.sin(angle * 0.7) * 0.4, Math.sin(angle) * 1.2);
        const material = new babylon.StandardMaterial(`material-${index}`, scene);
        material.diffuseColor = new babylon.Color3(0.4 + (index % 4) * 0.15, 0.55, 0.85);
        sphere.material = material;
      }
      return scene;
    },
    async renderFrame({ frameIndex = 0 } = {}) {
      if (!engine || !scene) {
        throw new Error("engine and scene must be created before renderFrame");
      }
      camera.alpha = frameIndex * 0.012;
      const startedAt = performance.now();
      scene.render();
      return { frameMs: performance.now() - startedAt };
    }
  };
}

export async function connectRealBabylon({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabRendererRegistry : null,
  loader = loadBabylonFromCdn,
  version = DEFAULT_BABYLON_VERSION
} = {}) {
  if (!registry) {
    throw new Error("renderer registry not available");
  }
  const { babylon, WebGPUEngine } = await loader({ version });
  const adapter = buildRealBabylonAdapter({ babylon, WebGPUEngine, version });
  registry.register(adapter);
  return { adapter, babylon, WebGPUEngine };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-babylon" && !window.__aiWebGpuLabRealBabylonBootstrapping) {
    window.__aiWebGpuLabRealBabylonBootstrapping = true;
    connectRealBabylon().catch((error) => {
      console.warn(`[real-babylon] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealBabylonBootstrapError = error.message;
    });
  }
}
