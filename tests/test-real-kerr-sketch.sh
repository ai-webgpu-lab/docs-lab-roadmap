#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/renderer-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/exp-blackhole-kerr-engine/public/real-renderer-sketch.js"

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

for (const exportName of ["connectRealKerr", "buildRealKerrAdapter", "loadWebGpuFromBrowser"]) {
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
    setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {}
  }),
  finish() { return {}; }
};
const stubDevice = {
  createShaderModule() { return {}; },
  createComputePipeline() { return stubPipeline; },
  createBuffer() { return stubBuffer; },
  createBindGroup() { return stubBindGroup; },
  createCommandEncoder() { return stubEncoder; },
  queue: { submit() {}, writeBuffer() {} }
};

const adapter = sketch.buildRealKerrAdapter({ device: stubDevice, version: "raw-webgpu-1" });
if (!adapter || adapter.id !== "kerr-rawgpu-1") {
  console.error("FAIL: unexpected adapter id", adapter && adapter.id);
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
const scene = await adapter.loadScene({ count: 256, spin: 0.5, inclination: 0.1, stepSize: 0.04, stepCount: 8 });
if (scene.count !== 256 || scene.spin !== 0.5 || scene.stepCount !== 8) {
  console.error("FAIL: loadScene returned wrong metadata", scene);
  process.exit(1);
}

const result = await adapter.renderFrame({ frameIndex: 4 });
if (result.workgroups !== Math.ceil(256 / 64) || result.geodesicCount !== 256) {
  console.error("FAIL: renderFrame metadata wrong", result);
  process.exit(1);
}

const stubLoader = async () => ({ adapter: { name: "stub" }, device: stubDevice });
const registry = fakeWindow.__aiWebGpuLabRendererRegistry;
const connect = await sketch.connectRealKerr({ registry, loader: stubLoader, version: "raw-webgpu-1" });
if (connect.adapter.id !== "kerr-rawgpu-1") {
  console.error("FAIL: connectRealKerr returned wrong adapter");
  process.exit(1);
}
const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || stub.id !== "kerr-rawgpu-1") {
  console.error("FAIL: stub describe should reflect connected kerr", stub);
  process.exit(1);
}

let threwOnMissingRegistry = false;
try { await sketch.connectRealKerr({ registry: null, loader: stubLoader }); } catch (error) { threwOnMissingRegistry = true; }
if (!threwOnMissingRegistry) { console.error("FAIL: connectRealKerr should throw without registry"); process.exit(1); }

let threwOnBadDevice = false;
try { sketch.buildRealKerrAdapter({ device: null }); } catch (error) { threwOnBadDevice = true; }
if (!threwOnBadDevice) { console.error("FAIL: buildRealKerrAdapter should throw without device"); process.exit(1); }

console.log("OK real kerr sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real kerr sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-kerr-sketch test passed"
