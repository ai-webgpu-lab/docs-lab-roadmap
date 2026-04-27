#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/renderer-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/exp-babylon-webgpu-core/public/real-renderer-sketch.js"

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

for (const exportName of ["connectRealBabylon", "buildRealBabylonAdapter", "loadBabylonFromCdn"]) {
  if (typeof sketch[exportName] !== "function") {
    console.error(`FAIL: missing export ${exportName}`);
    process.exit(1);
  }
}

const stubBabylon = {
  Scene: class {},
  ArcRotateCamera: class { constructor() { this.alpha = 0; } },
  Vector3: class { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } static Zero() { return new this(); } },
  HemisphericLight: class { constructor() { this.intensity = 1; } },
  MeshBuilder: { CreateSphere() { return { position: null, material: null }; } },
  StandardMaterial: class { constructor() { this.diffuseColor = null; } },
  Color3: class { constructor(r, g, b) { this.r = r; this.g = g; this.b = b; } }
};
class StubWebGPUEngine {
  constructor(canvas) { this.canvas = canvas; }
  async initAsync() {}
}
stubBabylon.WebGPUEngine = StubWebGPUEngine;
stubBabylon.Scene = class {
  constructor(engine) { this.engine = engine; this.meshes = []; }
  render() {}
};

const adapter = sketch.buildRealBabylonAdapter({ babylon: stubBabylon, WebGPUEngine: StubWebGPUEngine, version: "6.49.0" });
if (!adapter || adapter.id !== "babylon-webgpu-6490") {
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

let threwOnNoEngine = false;
try {
  await adapter.loadScene({});
} catch (error) {
  threwOnNoEngine = true;
}
if (!threwOnNoEngine) {
  console.error("FAIL: loadScene should throw before createRenderer");
  process.exit(1);
}

const stubLoader = async () => ({ babylon: stubBabylon, WebGPUEngine: StubWebGPUEngine });
const registry = fakeWindow.__aiWebGpuLabRendererRegistry;
const result = await sketch.connectRealBabylon({ registry, loader: stubLoader, version: "6.49.0" });
if (result.adapter.id !== "babylon-webgpu-6490") {
  console.error("FAIL: connectRealBabylon returned wrong adapter");
  process.exit(1);
}
const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || stub.id !== "babylon-webgpu-6490") {
  console.error("FAIL: stub describe should reflect connected babylon", stub);
  process.exit(1);
}

let threwOnMissingRegistry = false;
try {
  await sketch.connectRealBabylon({ registry: null, loader: stubLoader });
} catch (error) {
  threwOnMissingRegistry = true;
}
if (!threwOnMissingRegistry) {
  console.error("FAIL: connectRealBabylon should throw without registry");
  process.exit(1);
}

let threwOnBadBuild = false;
try {
  sketch.buildRealBabylonAdapter({ babylon: null, WebGPUEngine: StubWebGPUEngine });
} catch (error) {
  threwOnBadBuild = true;
}
if (!threwOnBadBuild) {
  console.error("FAIL: buildRealBabylonAdapter should throw without babylon");
  process.exit(1);
}

console.log("OK real babylon sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real babylon sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-babylon-sketch test passed"
