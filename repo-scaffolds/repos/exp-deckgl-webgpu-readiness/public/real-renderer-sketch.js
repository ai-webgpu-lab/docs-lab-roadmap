// Real deck.gl WebGPU integration sketch for exp-deckgl-webgpu-readiness.
//
// Gated by ?mode=real-deckgl. Default deterministic harness path is untouched.
// `loadDeckFromCdn` is parameterized so tests can inject a stub.

const DEFAULT_DECK_VERSION = "9.0.0";
const DEFAULT_DECK_CDN = (version) => `https://esm.sh/@deck.gl/core@${version}`;
const DEFAULT_DECK_LAYERS_CDN = (version) => `https://esm.sh/@deck.gl/layers@${version}`;

export async function loadDeckFromCdn({ version = DEFAULT_DECK_VERSION } = {}) {
  const [core, layers] = await Promise.all([
    import(/* @vite-ignore */ DEFAULT_DECK_CDN(version)),
    import(/* @vite-ignore */ DEFAULT_DECK_LAYERS_CDN(version))
  ]);
  if (!core || typeof core.Deck !== "function") {
    throw new Error("deck.gl core module did not expose Deck");
  }
  return { core, layers, Deck: core.Deck, ScatterplotLayer: layers.ScatterplotLayer };
}

export function buildRealDeckAdapter({ Deck, ScatterplotLayer, version = DEFAULT_DECK_VERSION }) {
  if (typeof Deck !== "function") {
    throw new Error("buildRealDeckAdapter requires Deck");
  }
  const id = `deckgl-webgpu-${version.replace(/[^0-9]/g, "")}`;
  let deck = null;
  let layerInstances = [];

  return {
    id,
    label: `deck.gl ${version} WebGPU`,
    version,
    capabilities: ["scene-load", "frame-pace", "fallback-record", "real-render"],
    backendHint: "webgpu",
    isReal: true,
    async createRenderer({ canvas } = {}) {
      const target = canvas || (typeof document !== "undefined" ? document.querySelector("canvas") : null);
      if (!target) {
        throw new Error("real renderer requires a <canvas> element");
      }
      deck = new Deck({
        canvas: target,
        gpuType: "webgpu",
        initialViewState: { longitude: 0, latitude: 0, zoom: 4 },
        controller: false
      });
      return deck;
    },
    async loadScene({ pointCount = 64 } = {}) {
      if (!deck) {
        throw new Error("createRenderer() must run before loadScene()");
      }
      const data = [];
      for (let index = 0; index < pointCount; index += 1) {
        const angle = (index / pointCount) * Math.PI * 2;
        data.push({
          position: [Math.cos(angle) * 30, Math.sin(angle) * 30],
          radius: 4,
          color: [80 + (index % 16) * 8, 140, 220]
        });
      }
      const layer = ScatterplotLayer
        ? new ScatterplotLayer({ id: "scatter", data, getPosition: (d) => d.position, getRadius: (d) => d.radius, getFillColor: (d) => d.color })
        : null;
      layerInstances = layer ? [layer] : [];
      if (typeof deck.setProps === "function") {
        deck.setProps({ layers: layerInstances });
      }
      return layerInstances;
    },
    async renderFrame({ frameIndex = 0 } = {}) {
      if (!deck) {
        throw new Error("deck must be created before renderFrame");
      }
      const startedAt = performance.now();
      if (typeof deck.redraw === "function") {
        deck.redraw(true);
      }
      return { frameMs: performance.now() - startedAt, frameIndex };
    }
  };
}

export async function connectRealDeck({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabRendererRegistry : null,
  loader = loadDeckFromCdn,
  version = DEFAULT_DECK_VERSION
} = {}) {
  if (!registry) {
    throw new Error("renderer registry not available");
  }
  const { Deck, ScatterplotLayer } = await loader({ version });
  const adapter = buildRealDeckAdapter({ Deck, ScatterplotLayer, version });
  registry.register(adapter);
  return { adapter, Deck, ScatterplotLayer };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-deckgl" && !window.__aiWebGpuLabRealDeckBootstrapping) {
    window.__aiWebGpuLabRealDeckBootstrapping = true;
    connectRealDeck().catch((error) => {
      console.warn(`[real-deckgl] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealDeckBootstrapError = error.message;
    });
  }
}
