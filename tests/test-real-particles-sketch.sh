#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/renderer-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/exp-three-webgpu-particles-stress/public/real-renderer-sketch.js"

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

for (const exportName of ["connectRealParticles", "buildRealParticlesAdapter", "loadThreeFromCdn"]) {
  if (typeof sketch[exportName] !== "function") {
    console.error(`FAIL: missing export ${exportName}`);
    process.exit(1);
  }
}

class StubMatrix {
  constructor() { this.elements = new Float32Array(16); }
}
class StubObject3D {
  constructor() { this.position = { set: (x, y, z) => { this.x = x; this.y = y; this.z = z; } }; this.matrix = new StubMatrix(); }
  updateMatrix() {}
}
class StubMesh extends StubObject3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
  add() {}
}
class StubInstancedMesh {
  constructor(geometry, material, count) { this.geometry = geometry; this.material = material; this.count = count; this.matrices = new Map(); }
  setMatrixAt(index, matrix) { this.matrices.set(index, matrix); }
}
class StubPerspectiveCamera {
  constructor() { this.position = { set: (x, y, z) => { this.x = x; this.y = y; this.z = z; }, x: 0, y: 0, z: 0 }; }
  lookAt() {}
}
const stubThree = {
  Scene: class { constructor() { this.children = []; } add(child) { this.children.push(child); } },
  PerspectiveCamera: StubPerspectiveCamera,
  HemisphereLight: class {},
  IcosahedronGeometry: class {},
  MeshBasicMaterial: class {},
  InstancedMesh: StubInstancedMesh,
  Object3D: StubObject3D
};
class StubWebGPURenderer {
  constructor() {}
  async init() {}
  setSize() {}
  async renderAsync() {}
}

const adapter = sketch.buildRealParticlesAdapter({ three: stubThree, WebGPURenderer: StubWebGPURenderer, version: "0.160.0" });
if (!adapter || adapter.id !== "particles-stress-three-01600") {
  console.error("FAIL: unexpected adapter id", adapter && adapter.id);
  process.exit(1);
}
for (const method of ["createRenderer", "loadScene", "renderFrame"]) {
  if (typeof adapter[method] !== "function") {
    console.error(`FAIL: adapter missing ${method}`);
    process.exit(1);
  }
}

let threwOnNoRenderer = false;
try { await adapter.loadScene({}); } catch (error) { threwOnNoRenderer = true; }
if (!threwOnNoRenderer) { console.error("FAIL: loadScene should throw before createRenderer"); process.exit(1); }

const stubLoader = async () => ({ three: stubThree, WebGPURenderer: StubWebGPURenderer });
const registry = fakeWindow.__aiWebGpuLabRendererRegistry;
const connect = await sketch.connectRealParticles({ registry, loader: stubLoader, version: "0.160.0" });
if (connect.adapter.id !== "particles-stress-three-01600") {
  console.error("FAIL: connectRealParticles returned wrong adapter");
  process.exit(1);
}
const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || stub.id !== "particles-stress-three-01600") {
  console.error("FAIL: stub describe should reflect connected particles", stub);
  process.exit(1);
}

let threwOnMissingRegistry = false;
try { await sketch.connectRealParticles({ registry: null, loader: stubLoader }); } catch (error) { threwOnMissingRegistry = true; }
if (!threwOnMissingRegistry) { console.error("FAIL: connectRealParticles should throw without registry"); process.exit(1); }

let threwOnBadBuild = false;
try { sketch.buildRealParticlesAdapter({ three: null, WebGPURenderer: StubWebGPURenderer }); } catch (error) { threwOnBadBuild = true; }
if (!threwOnBadBuild) { console.error("FAIL: buildRealParticlesAdapter should throw without three"); process.exit(1); }

console.log("OK real particles sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real particles sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-particles-sketch test passed"
