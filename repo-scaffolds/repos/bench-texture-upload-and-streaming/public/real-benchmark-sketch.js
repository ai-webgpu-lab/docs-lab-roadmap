// Real texture upload and streaming benchmark sketch for bench-texture-upload-and-streaming.
//
// Gated by ?mode=real-texture-bench. Default deterministic harness path is
// untouched. `loadBenchmarkAndDevice` is parameterized so tests can inject stubs.

const DEFAULT_BENCHMARK_VERSION = "2.1.4";
const DEFAULT_BENCHMARK_CDN = (version) => `https://esm.sh/benchmark@${version}`;

export async function loadBenchmarkAndDevice({
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  navigatorGpu = (typeof navigator !== "undefined" ? navigator.gpu : null)
} = {}) {
  if (!navigatorGpu) throw new Error("navigator.gpu unavailable");
  const benchmarkModule = await import(/* @vite-ignore */ DEFAULT_BENCHMARK_CDN(benchmarkVersion));
  const Benchmark = benchmarkModule.default || benchmarkModule.Benchmark || benchmarkModule;
  if (!Benchmark) throw new Error("benchmark module missing Benchmark export");
  const adapter = await navigatorGpu.requestAdapter();
  if (!adapter) throw new Error("no GPU adapter available");
  const device = await adapter.requestDevice();
  return { Benchmark, adapter, device };
}

export function buildRealTextureBenchAdapter({
  Benchmark,
  device,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  suiteId = "texture-upload-and-streaming"
}) {
  if (!Benchmark) throw new Error("buildRealTextureBenchAdapter requires Benchmark");
  if (!device || typeof device.createTexture !== "function" || !device.queue || typeof device.queue.writeTexture !== "function") {
    throw new Error("buildRealTextureBenchAdapter requires a GPUDevice with createTexture + queue.writeTexture");
  }
  const id = `bench-texture-${suiteId}-${benchmarkVersion.replace(/[^0-9]/g, "")}`;
  let suite = null;
  let profileResults = [];

  return {
    id,
    label: `Texture upload bench (benchmark.js ${benchmarkVersion} + raw WebGPU)`,
    version: benchmarkVersion,
    capabilities: ["profile-comparison", "winner-selection", "real-benchmark", "texture-upload"],
    benchmarkType: "texture-upload-and-streaming",
    isReal: true,
    async createBenchmark({ name = suiteId } = {}) {
      const SuiteCtor = Benchmark.Suite || (typeof Benchmark === "function" ? Benchmark.Suite : null);
      if (!SuiteCtor) throw new Error("Benchmark.Suite not available");
      suite = new SuiteCtor(name);
      profileResults = [];
      return suite;
    },
    async runProfile({ profileId, width = 512, height = 512, format = "rgba8unorm", uploads = 16 } = {}) {
      if (!suite) throw new Error("createBenchmark() must run before runProfile()");
      if (!profileId) throw new Error("runProfile requires profileId");
      const bytesPerPixel = 4;
      const texture = device.createTexture({
        size: { width, height, depthOrArrayLayers: 1 },
        format,
        usage: 0x04 | 0x10 // COPY_DST | TEXTURE_BINDING
      });
      const data = new Uint8Array(width * height * bytesPerPixel);
      const startedAt = performance.now();
      for (let upload = 0; upload < uploads; upload += 1) {
        device.queue.writeTexture(
          { texture },
          data,
          { bytesPerRow: width * bytesPerPixel, rowsPerImage: height },
          { width, height, depthOrArrayLayers: 1 }
        );
      }
      const elapsedMs = performance.now() - startedAt;
      const totalBytes = uploads * width * height * bytesPerPixel;
      const sample = {
        profileId,
        width,
        height,
        format,
        uploads,
        elapsedMs,
        totalBytes,
        sustainedStreamMbps: (totalBytes / (1024 * 1024)) / Math.max(elapsedMs / 1000, 0.001),
        uploadFrameMs: elapsedMs / Math.max(uploads, 1)
      };
      profileResults.push(sample);
      return sample;
    },
    async aggregateResults() {
      if (!profileResults.length) return { profileCount: 0, winner: null, samples: [] };
      const sorted = [...profileResults].sort((left, right) => right.sustainedStreamMbps - left.sustainedStreamMbps);
      return { profileCount: sorted.length, winner: sorted[0].profileId, samples: sorted };
    }
  };
}

export async function connectRealTextureBench({
  registry = typeof window !== "undefined" ? window.__aiWebGpuLabBenchmarkRegistry : null,
  loader = loadBenchmarkAndDevice,
  benchmarkVersion = DEFAULT_BENCHMARK_VERSION,
  suiteId = "texture-upload-and-streaming"
} = {}) {
  if (!registry) throw new Error("benchmark registry not available");
  const { Benchmark, device } = await loader({ benchmarkVersion });
  const adapter = buildRealTextureBenchAdapter({ Benchmark, device, benchmarkVersion, suiteId });
  registry.register(adapter);
  return { adapter, Benchmark, device };
}

if (typeof window !== "undefined" && window.location && typeof window.location.search === "string") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "real-texture-bench" && !window.__aiWebGpuLabRealTextureBenchBootstrapping) {
    window.__aiWebGpuLabRealTextureBenchBootstrapping = true;
    connectRealTextureBench().catch((error) => {
      console.warn(`[real-texture-bench] bootstrap failed: ${error.message}`);
      window.__aiWebGpuLabRealTextureBenchBootstrapError = error.message;
    });
  }
}
