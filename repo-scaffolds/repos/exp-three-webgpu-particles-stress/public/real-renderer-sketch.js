// Real three.js InstancedMesh particles stress sketch for exp-three-webgpu-particles-stress.
//
// Gated by ?mode=real-particles. Default deterministic harness path is untouched.
// `loadThreeFromCdn` is parameterized so tests can inject a stub.

const DEFAULT_THREE_VERSION = "0.160.0";
const DEFAULT_THREE_CDN = (version) => `https://esm.sh/three@${version}`;
const DEFAULT_WEBGPU_RENDERER_CDN = (version) =>
  `https://esm.sh/three@${version}/examples/jsm/renderers/webgpu/WebGPURenderer.js`;

export async function loadThreeFromCdn({ version = DEFAULT_THREE_VERSION } = {}) {
  const [three, rendererModule] = await Promise.all([
    import(/* @vite-ignore */ DEFAULT_THREE_CDN(version)),
    import(/* @vite-ignore */ DEFAULT_WEBGPU_RENDERER_CDN(version))
  ]);
  return {
    three,
    WebGPURenderer: rendererModule.default || rendererModule.WebGPURenderer
  };
}

export function buildRealParticlesAdapter({ three, WebGPURenderer, version = DEFAULT_THREE_VERSION }) {
  if (!three || typeof WebGPURenderer !== "function") {
    throw new Error("buildRealParticlesAdapter requires three and WebGPURenderer");
  }
  const id = `particles-stress-three-${version.replace(/[^0-9]/g, "")}`;
  let renderer = null;
  let scene = null;
  let camera = null;
  let mesh = null;
  let particleCount = 0;

  return {
    id,
    label: `three.js InstancedMesh particles (${version})`,
    version,
    capabilities: ["scene-load", "frame-pace", "fallback-record", "real-render", "instanced-mesh"],
    backendHint: "webgpu",
    isReal: true,
    async createRenderer({ canvas } = {}) {
      const target = canvas || (typeof document !== "undefined" ? document.querySelector("canvas") : null);
      if (!target) {
        throw new Error("real renderer requires a <canvas> element");
      }
      renderer = new WebGPURenderer({ canvas: target, antialias: false });
      if (typeof renderer.init === "function") {
        await renderer.init();
      }
      if (typeof renderer.setSize === "function") {
        renderer.setSize(target.clientWidth || target.width || 640, target.clientHeight || target.height || 480, false);
      }
      return renderer;
    },
    async loadScene({ count = 32768 } = {}) {
      if (!renderer) {
        throw new Error("createRenderer() must run before loadScene()");
      }
      scene = new three.Scene();
      camera = new three.PerspectiveCamera(60, 16 / 9, 0.1, 200);
      camera.position.set(0, 0, 12);
      const ambient = new three.HemisphereLight(0xffffff, 0x101019, 0.85);
      scene.add(ambient);
      const geometry = new three.IcosahedronGeometry(0.05, 0);
      const material = new three.MeshBasicMaterial({ color: 0x88ccff });
      mesh = new three.InstancedMesh(geometry, material, count);
      const dummy = new three.Object3D();
      for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * Math.PI * 24;
        const radius = 1.5 + (index % 12) * 0.15;
        dummy.position.set(Math.cos(angle) * radius, Math.sin(angle * 0.7) * radius * 0.55, Math.sin(angle * 0.31) * radius);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      }
      scene.add(mesh);
      particleCount = count;
      return { scene, mesh, camera, count };
    },
    async renderFrame({ frameIndex = 0 } = {}) {
      if (!renderer || !scene || !camera) {
        throw new Error("scene must be loaded before renderFrame");
      }
      camera.position.x = Math.cos(frameIndex * 0.012) * 12;
      camera.position.z = Math.sin(frameIndex * 0.012) * 12;
      camera.lookAt(0, 0, 0);
      const startedAt = performance.now();
      if (typeof renderer.renderAsync === "function") {
        await renderer.renderAsync(scene, camera);
      } else if (typeof renderer.render === "function") {
        renderer.render(scene, camera);
      }
      return { frameMs: performance.now() - startedAt, frameIndex, particleCount };
    }
  };
}

export async function connectRealParticles({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabRendererRegistry : null,
  loader = loadThreeFromCdn,
  version = DEFAULT_THREE_VERSION
} = {}) {
  if (!registry) {
    throw new Error("renderer registry not available");
  }
  const { three, WebGPURenderer } = await loader({ version });
  const adapter = buildRealParticlesAdapter({ three, WebGPURenderer, version });
  registry.register(adapter);
  return { adapter, three, WebGPURenderer };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-particles" && !window.__aiWebGpuLabRealParticlesBootstrapping) {
    window.__aiWebGpuLabRealParticlesBootstrapping = true;
    connectRealParticles().catch((error) => {
      console.warn(`[real-particles] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealParticlesBootstrapError = error.message;
    });
  }
}
