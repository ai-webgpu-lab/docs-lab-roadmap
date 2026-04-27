#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/repos/exp-three-webgpu-core/public/renderer-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/exp-three-webgpu-core/public/real-renderer-sketch.js"

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

if (typeof sketch.connectRealRenderer !== "function") {
  console.error("FAIL: missing connectRealRenderer export");
  process.exit(1);
}
if (typeof sketch.buildRealRendererAdapter !== "function") {
  console.error("FAIL: missing buildRealRendererAdapter export");
  process.exit(1);
}
if (typeof sketch.loadThreeFromCdn !== "function") {
  console.error("FAIL: missing loadThreeFromCdn export");
  process.exit(1);
}

const stubThree = {
  Scene: class {},
  PerspectiveCamera: class { constructor() { this.position = { set: () => {} }; } lookAt() {} },
  HemisphereLight: class {},
  IcosahedronGeometry: class {},
  MeshStandardMaterial: class {},
  Mesh: class { constructor() { this.position = { set: () => {} }; } },
  Color: class { setHSL() { return this; } }
};
class StubWebGPURenderer {
  constructor({ canvas }) { this.canvas = canvas; }
  async init() {}
  setSize() {}
  async renderAsync() {}
}

const stubLoader = async () => ({ three: stubThree, WebGPURenderer: StubWebGPURenderer });

const adapter = sketch.buildRealRendererAdapter({ three: stubThree, WebGPURenderer: StubWebGPURenderer, version: "0.160.0" });
if (!adapter || adapter.id !== "three-webgpu-01600") {
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

const registry = fakeWindow.__aiWebGpuLabRendererRegistry;
const result = await sketch.connectRealRenderer({ registry, loader: stubLoader, version: "0.160.0" });
if (result.adapter.id !== "three-webgpu-01600") {
  console.error("FAIL: connectRealRenderer returned wrong adapter");
  process.exit(1);
}
const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || stub.id !== "three-webgpu-01600") {
  console.error("FAIL: stub describe should reflect connected real renderer", stub);
  process.exit(1);
}

let threwOnMissingRegistry = false;
try {
  await sketch.connectRealRenderer({ registry: null, loader: stubLoader });
} catch (error) {
  threwOnMissingRegistry = true;
}
if (!threwOnMissingRegistry) {
  console.error("FAIL: connectRealRenderer should throw without registry");
  process.exit(1);
}

console.log("OK real renderer sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real renderer sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-renderer-sketch test passed"
