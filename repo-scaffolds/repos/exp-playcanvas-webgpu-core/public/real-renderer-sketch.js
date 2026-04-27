// Real PlayCanvas Engine integration sketch for exp-playcanvas-webgpu-core.
//
// Gated by ?mode=real-playcanvas. Default deterministic harness path is untouched.
// `loadPlayCanvasFromCdn` is parameterized so tests can inject a stub.

const DEFAULT_PLAYCANVAS_VERSION = "2.2.0";
const DEFAULT_PLAYCANVAS_CDN = (version) => `https://esm.sh/playcanvas@${version}`;

export async function loadPlayCanvasFromCdn({ version = DEFAULT_PLAYCANVAS_VERSION } = {}) {
  const playcanvas = await import(/* @vite-ignore */ DEFAULT_PLAYCANVAS_CDN(version));
  if (!playcanvas || typeof playcanvas.Application !== "function") {
    throw new Error("playcanvas module did not expose Application");
  }
  return { playcanvas, Application: playcanvas.Application };
}

export function buildRealPlayCanvasAdapter({ playcanvas, Application, version = DEFAULT_PLAYCANVAS_VERSION }) {
  if (!playcanvas || typeof Application !== "function") {
    throw new Error("buildRealPlayCanvasAdapter requires playcanvas and Application");
  }
  const id = `playcanvas-webgpu-${version.replace(/[^0-9]/g, "")}`;
  let app = null;
  let camera = null;
  let entities = [];

  return {
    id,
    label: `PlayCanvas ${version} WebGPU`,
    version,
    capabilities: ["scene-load", "frame-pace", "fallback-record", "real-render"],
    backendHint: "webgpu",
    isReal: true,
    async createRenderer({ canvas } = {}) {
      const target = canvas || (typeof document !== "undefined" ? document.querySelector("canvas") : null);
      if (!target) {
        throw new Error("real renderer requires a <canvas> element");
      }
      app = new Application(target, { graphicsDeviceOptions: { preferWebGpu: true } });
      app.start();
      return app;
    },
    async loadScene({ entityCount = 24 } = {}) {
      if (!app) {
        throw new Error("createRenderer() must run before loadScene()");
      }
      camera = new playcanvas.Entity("camera");
      camera.addComponent("camera", { clearColor: new playcanvas.Color(0.05, 0.05, 0.08) });
      camera.setPosition(0, 1.2, 4);
      app.root.addChild(camera);
      entities = [];
      for (let index = 0; index < entityCount; index += 1) {
        const entity = new playcanvas.Entity(`entity-${index}`);
        entity.addComponent("model", { type: "sphere" });
        const angle = (index / entityCount) * Math.PI * 2;
        entity.setPosition(Math.cos(angle) * 1.2, Math.sin(angle * 0.7) * 0.4, Math.sin(angle) * 1.2);
        app.root.addChild(entity);
        entities.push(entity);
      }
      return { camera, entities };
    },
    async renderFrame({ frameIndex = 0 } = {}) {
      if (!app) {
        throw new Error("app must be created before renderFrame");
      }
      if (camera) {
        const angle = frameIndex * 0.012;
        camera.setPosition(Math.cos(angle) * 4, 1.2, Math.sin(angle) * 4);
        camera.lookAt(0, 0, 0);
      }
      const startedAt = performance.now();
      if (typeof app.render === "function") {
        app.render();
      }
      return { frameMs: performance.now() - startedAt };
    }
  };
}

export async function connectRealPlayCanvas({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabRendererRegistry : null,
  loader = loadPlayCanvasFromCdn,
  version = DEFAULT_PLAYCANVAS_VERSION
} = {}) {
  if (!registry) {
    throw new Error("renderer registry not available");
  }
  const { playcanvas, Application } = await loader({ version });
  const adapter = buildRealPlayCanvasAdapter({ playcanvas, Application, version });
  registry.register(adapter);
  return { adapter, playcanvas, Application };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-playcanvas" && !window.__aiWebGpuLabRealPlayCanvasBootstrapping) {
    window.__aiWebGpuLabRealPlayCanvasBootstrapping = true;
    connectRealPlayCanvas().catch((error) => {
      console.warn(`[real-playcanvas] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealPlayCanvasBootstrapError = error.message;
    });
  }
}
