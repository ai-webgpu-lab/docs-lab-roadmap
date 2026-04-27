// Real PixiJS WebGPU integration sketch for exp-pixi-webgpu-2d.
//
// Gated by ?mode=real-pixi. Default deterministic harness path is untouched.
// `loadPixiFromCdn` is parameterized so tests can inject a stub.

const DEFAULT_PIXI_VERSION = "8.3.4";
const DEFAULT_PIXI_CDN = (version) => `https://esm.sh/pixi.js@${version}`;

export async function loadPixiFromCdn({ version = DEFAULT_PIXI_VERSION } = {}) {
  const pixi = await import(/* @vite-ignore */ DEFAULT_PIXI_CDN(version));
  if (!pixi || typeof pixi.Application !== "function") {
    throw new Error("pixi module did not expose Application");
  }
  return { pixi, Application: pixi.Application };
}

export function buildRealPixiAdapter({ pixi, Application, version = DEFAULT_PIXI_VERSION }) {
  if (!pixi || typeof Application !== "function") {
    throw new Error("buildRealPixiAdapter requires pixi and Application");
  }
  const id = `pixi-webgpu-${version.replace(/[^0-9]/g, "")}`;
  let app = null;
  let stage = null;

  return {
    id,
    label: `PixiJS ${version} WebGPU`,
    version,
    capabilities: ["scene-load", "frame-pace", "fallback-record", "real-render"],
    backendHint: "webgpu",
    isReal: true,
    async createRenderer({ canvas } = {}) {
      const target = canvas || (typeof document !== "undefined" ? document.querySelector("canvas") : null);
      if (!target) {
        throw new Error("real renderer requires a <canvas> element");
      }
      app = new Application();
      if (typeof app.init === "function") {
        await app.init({ canvas: target, preference: "webgpu", antialias: true });
      }
      return app;
    },
    async loadScene({ spriteCount = 24 } = {}) {
      if (!app) {
        throw new Error("createRenderer() must run before loadScene()");
      }
      stage = app.stage;
      for (let index = 0; index < spriteCount; index += 1) {
        const sprite = new pixi.Graphics();
        sprite.circle(0, 0, 12).fill({ color: 0x44aaff, alpha: 0.8 });
        const angle = (index / spriteCount) * Math.PI * 2;
        sprite.x = 320 + Math.cos(angle) * 120;
        sprite.y = 240 + Math.sin(angle) * 120;
        stage.addChild(sprite);
      }
      return stage;
    },
    async renderFrame({ frameIndex = 0 } = {}) {
      if (!app) {
        throw new Error("app must be created before renderFrame");
      }
      if (stage) {
        stage.rotation = frameIndex * 0.012;
      }
      const startedAt = performance.now();
      if (typeof app.render === "function") {
        app.render();
      } else if (typeof app.renderer?.render === "function") {
        app.renderer.render(stage);
      }
      return { frameMs: performance.now() - startedAt };
    }
  };
}

export async function connectRealPixi({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabRendererRegistry : null,
  loader = loadPixiFromCdn,
  version = DEFAULT_PIXI_VERSION
} = {}) {
  if (!registry) {
    throw new Error("renderer registry not available");
  }
  const { pixi, Application } = await loader({ version });
  const adapter = buildRealPixiAdapter({ pixi, Application, version });
  registry.register(adapter);
  return { adapter, pixi, Application };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-pixi" && !window.__aiWebGpuLabRealPixiBootstrapping) {
    window.__aiWebGpuLabRealPixiBootstrapping = true;
    connectRealPixi().catch((error) => {
      console.warn(`[real-pixi] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealPixiBootstrapError = error.message;
    });
  }
}
