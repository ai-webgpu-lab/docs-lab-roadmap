// Real three.js blackhole singularity raymarch sketch for exp-blackhole-three-singularity.
//
// Gated by ?mode=real-blackhole-three. Default deterministic harness path is
// untouched. `loadThreeFromCdn` is parameterized so tests can inject a stub.

const DEFAULT_THREE_VERSION = "0.160.0";
const DEFAULT_THREE_CDN = (version) => `https://esm.sh/three@${version}`;
const DEFAULT_WEBGPU_RENDERER_CDN = (version) =>
  `https://esm.sh/three@${version}/examples/jsm/renderers/webgpu/WebGPURenderer.js`;

const DISK_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform float uRingRadius;
void main() {
  vec2 centered = vUv - 0.5;
  float r = length(centered);
  float ring = smoothstep(uRingRadius + 0.04, uRingRadius, r) * smoothstep(uRingRadius - 0.06, uRingRadius - 0.02, r);
  float horizon = smoothstep(0.18, 0.12, r);
  float emission = ring * (0.55 + 0.45 * sin(uTime * 1.4 + atan(centered.y, centered.x) * 6.0));
  vec3 color = vec3(0.95, 0.45, 0.18) * emission;
  color = mix(color, vec3(0.0), horizon);
  gl_FragColor = vec4(color, 1.0);
}
`;

const DISK_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

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

export function buildRealBlackholeThreeAdapter({ three, WebGPURenderer, version = DEFAULT_THREE_VERSION }) {
  if (!three || typeof WebGPURenderer !== "function") {
    throw new Error("buildRealBlackholeThreeAdapter requires three and WebGPURenderer");
  }
  const id = `blackhole-three-${version.replace(/[^0-9]/g, "")}`;
  let renderer = null;
  let scene = null;
  let camera = null;
  let mesh = null;
  let uniforms = null;

  return {
    id,
    label: `three.js ${version} blackhole singularity`,
    version,
    capabilities: ["scene-load", "frame-pace", "real-render", "shader-material", "ray-step-budget"],
    backendHint: "webgpu",
    isReal: true,
    async createRenderer({ canvas } = {}) {
      const target = canvas || (typeof document !== "undefined" ? document.querySelector("canvas") : null);
      if (!target) {
        throw new Error("real renderer requires a <canvas> element");
      }
      renderer = new WebGPURenderer({ canvas: target, antialias: true });
      if (typeof renderer.init === "function") {
        await renderer.init();
      }
      if (typeof renderer.setSize === "function") {
        renderer.setSize(target.clientWidth || target.width || 720, target.clientHeight || target.height || 480, false);
      }
      return renderer;
    },
    async loadScene({ rayStepBudget = 96 } = {}) {
      if (!renderer) {
        throw new Error("createRenderer() must run before loadScene()");
      }
      scene = new three.Scene();
      camera = new three.PerspectiveCamera(45, 16 / 9, 0.1, 100);
      camera.position.set(0, 0.6, 3.4);
      uniforms = {
        uTime: { value: 0 },
        uRingRadius: { value: 0.32 }
      };
      const geometry = new three.PlaneGeometry(2, 2);
      const material = new three.ShaderMaterial({
        uniforms,
        vertexShader: DISK_VERTEX_SHADER,
        fragmentShader: DISK_FRAGMENT_SHADER,
        transparent: false
      });
      mesh = new three.Mesh(geometry, material);
      scene.add(mesh);
      return { scene, camera, mesh, rayStepBudget };
    },
    async renderFrame({ frameIndex = 0 } = {}) {
      if (!renderer || !scene || !camera) {
        throw new Error("scene must be loaded before renderFrame");
      }
      if (uniforms) {
        uniforms.uTime.value = frameIndex * 0.016;
      }
      const startedAt = performance.now();
      if (typeof renderer.renderAsync === "function") {
        await renderer.renderAsync(scene, camera);
      } else if (typeof renderer.render === "function") {
        renderer.render(scene, camera);
      }
      return { frameMs: performance.now() - startedAt, frameIndex };
    }
  };
}

export async function connectRealBlackholeThree({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabRendererRegistry : null,
  loader = loadThreeFromCdn,
  version = DEFAULT_THREE_VERSION
} = {}) {
  if (!registry) {
    throw new Error("renderer registry not available");
  }
  const { three, WebGPURenderer } = await loader({ version });
  const adapter = buildRealBlackholeThreeAdapter({ three, WebGPURenderer, version });
  registry.register(adapter);
  return { adapter, three, WebGPURenderer };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-blackhole-three" && !window.__aiWebGpuLabRealBlackholeThreeBootstrapping) {
    window.__aiWebGpuLabRealBlackholeThreeBootstrapping = true;
    connectRealBlackholeThree().catch((error) => {
      console.warn(`[real-blackhole-three] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealBlackholeThreeBootstrapError = error.message;
    });
  }
}
