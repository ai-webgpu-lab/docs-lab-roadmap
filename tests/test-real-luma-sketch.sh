#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/renderer-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/exp-luma-webgpu-viz/public/real-renderer-sketch.js"

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

for (const exportName of ["connectRealLuma", "buildRealLumaAdapter", "loadLumaFromCdn"]) {
  if (typeof sketch[exportName] !== "function") {
    console.error(`FAIL: missing export ${exportName}`);
    process.exit(1);
  }
}

const stubDevice = { canvas: null, async render() {} };
const stubLuma = { async createDevice({ canvas }) { stubDevice.canvas = canvas; return stubDevice; } };
const StubWebGPUDevice = class {};

const adapter = sketch.buildRealLumaAdapter({ luma: stubLuma, WebGPUDevice: StubWebGPUDevice, version: "9.0.0" });
if (!adapter || adapter.id !== "luma-webgpu-900") {
  console.error("FAIL: unexpected adapter id", adapter && adapter.id);
  process.exit(1);
}
for (const method of ["createRenderer", "loadScene", "renderFrame"]) {
  if (typeof adapter[method] !== "function") {
    console.error(`FAIL: adapter missing ${method}`);
    process.exit(1);
  }
}

let threwOnNoDevice = false;
try { await adapter.loadScene({}); } catch (error) { threwOnNoDevice = true; }
if (!threwOnNoDevice) { console.error("FAIL: loadScene should throw before createRenderer"); process.exit(1); }

const stubLoader = async () => ({ luma: stubLuma, WebGPUDevice: StubWebGPUDevice });
const registry = fakeWindow.__aiWebGpuLabRendererRegistry;
const result = await sketch.connectRealLuma({ registry, loader: stubLoader, version: "9.0.0" });
if (result.adapter.id !== "luma-webgpu-900") {
  console.error("FAIL: connectRealLuma returned wrong adapter");
  process.exit(1);
}
const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || stub.id !== "luma-webgpu-900") {
  console.error("FAIL: stub describe should reflect connected luma", stub);
  process.exit(1);
}

let threwOnMissingRegistry = false;
try { await sketch.connectRealLuma({ registry: null, loader: stubLoader }); } catch (error) { threwOnMissingRegistry = true; }
if (!threwOnMissingRegistry) { console.error("FAIL: connectRealLuma should throw without registry"); process.exit(1); }

let threwOnBadBuild = false;
try { sketch.buildRealLumaAdapter({ luma: null, WebGPUDevice: StubWebGPUDevice }); } catch (error) { threwOnBadBuild = true; }
if (!threwOnBadBuild) { console.error("FAIL: buildRealLumaAdapter should throw without luma"); process.exit(1); }

console.log("OK real luma sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real luma sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-luma-sketch test passed"
