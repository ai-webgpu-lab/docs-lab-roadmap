#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/renderer-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/exp-nbody-webgpu-core/public/real-renderer-sketch.js"

DRIVER="${TMP_DIR}/driver.mjs"
cat >"${DRIVER}" <<'EOF'
import { pathToFileURL } from "node:url";

const adapterPath = process.argv[2];
const sketchPath = process.argv[3];

const fakeWindow = {};
globalThis.window = fakeWindow;
globalThis.URLSearchParams = URLSearchParams;

await import(pathToFileURL(adapterPath).href);
const sketch = await import(pathToFileURL(sketchPath).href);

for (const exportName of ["connectRealNbody", "buildRealNbodyAdapter", "loadWebGpuFromBrowser"]) {
  if (typeof sketch[exportName] !== "function") {
    console.error(`FAIL: missing export ${exportName}`);
    process.exit(1);
  }
}

const stubLayout = { layoutId: "stub" };
const stubBindGroup = { bindGroupId: "stub" };
const stubBuffer = { destroy() {} };
const stubPipeline = { getBindGroupLayout: () => stubLayout };
const stubEncoder = {
  beginComputePass: () => ({
    setPipeline() {},
    setBindGroup() {},
    dispatchWorkgroups() {},
    end() {}
  }),
  finish() { return { commandBuffer: "stub" }; }
};
const stubDevice = {
  createShaderModule() { return { module: "stub" }; },
  createComputePipeline() { return stubPipeline; },
  createBuffer() { return stubBuffer; },
  createBindGroup() { return stubBindGroup; },
  createCommandEncoder() { return stubEncoder; },
  queue: { submit() {} }
};

const adapter = sketch.buildRealNbodyAdapter({ device: stubDevice, version: "raw-webgpu-1" });
if (!adapter || adapter.id !== "nbody-rawgpu-1") {
  console.error("FAIL: unexpected adapter id", adapter && adapter.id);
  process.exit(1);
}
if (adapter.isReal !== true || adapter.backendHint !== "webgpu") {
  console.error("FAIL: adapter metadata incorrect", adapter);
  process.exit(1);
}
for (const method of ["createRenderer", "loadScene", "renderFrame"]) {
  if (typeof adapter[method] !== "function") {
    console.error(`FAIL: adapter missing ${method}`);
    process.exit(1);
  }
}

let threwOnNoPipeline = false;
try { await adapter.loadScene({}); } catch (error) { threwOnNoPipeline = true; }
if (!threwOnNoPipeline) { console.error("FAIL: loadScene should throw before createRenderer"); process.exit(1); }

await adapter.createRenderer();
const scene = await adapter.loadScene({ count: 256 });
if (scene.count !== 256) {
  console.error("FAIL: loadScene returned wrong count", scene);
  process.exit(1);
}

const result = await adapter.renderFrame({ frameIndex: 7 });
if (result.workgroups !== Math.ceil(256 / 64) || result.bodyCount !== 256 || result.frameIndex !== 7) {
  console.error("FAIL: renderFrame metadata wrong", result);
  process.exit(1);
}

const stubLoader = async () => ({ adapter: { name: "stub" }, device: stubDevice });
const registry = fakeWindow.__aiWebGpuLabRendererRegistry;
const connect = await sketch.connectRealNbody({ registry, loader: stubLoader, version: "raw-webgpu-1" });
if (connect.adapter.id !== "nbody-rawgpu-1") {
  console.error("FAIL: connectRealNbody returned wrong adapter");
  process.exit(1);
}
const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || stub.id !== "nbody-rawgpu-1") {
  console.error("FAIL: stub describe should reflect connected nbody", stub);
  process.exit(1);
}

let threwOnMissingRegistry = false;
try { await sketch.connectRealNbody({ registry: null, loader: stubLoader }); } catch (error) { threwOnMissingRegistry = true; }
if (!threwOnMissingRegistry) { console.error("FAIL: connectRealNbody should throw without registry"); process.exit(1); }

let threwOnBadDevice = false;
try { sketch.buildRealNbodyAdapter({ device: null }); } catch (error) { threwOnBadDevice = true; }
if (!threwOnBadDevice) { console.error("FAIL: buildRealNbodyAdapter should throw without device"); process.exit(1); }

let threwOnMissingNavigator = false;
try { await sketch.loadWebGpuFromBrowser({ navigatorGpu: null }); } catch (error) { threwOnMissingNavigator = true; }
if (!threwOnMissingNavigator) { console.error("FAIL: loadWebGpuFromBrowser should throw without navigatorGpu"); process.exit(1); }

console.log("OK real nbody sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real nbody sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-nbody-sketch test passed"
