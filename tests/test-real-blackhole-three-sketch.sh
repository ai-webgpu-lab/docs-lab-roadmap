#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/renderer-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/exp-blackhole-three-singularity/public/real-renderer-sketch.js"

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

for (const exportName of ["connectRealBlackholeThree", "buildRealBlackholeThreeAdapter", "loadThreeFromCdn"]) {
  if (typeof sketch[exportName] !== "function") {
    console.error(`FAIL: missing export ${exportName}`);
    process.exit(1);
  }
}

class StubScene { constructor() { this.children = []; } add(c) { this.children.push(c); } }
class StubPerspective { constructor() { this.position = { set: () => {} }; } }
class StubMesh {}
const stubThree = {
  Scene: StubScene,
  PerspectiveCamera: StubPerspective,
  PlaneGeometry: class {},
  ShaderMaterial: class { constructor(props) { this.uniforms = props.uniforms; } },
  Mesh: StubMesh
};
class StubWebGPURenderer {
  async init() {}
  setSize() {}
  async renderAsync() {}
}

const adapter = sketch.buildRealBlackholeThreeAdapter({ three: stubThree, WebGPURenderer: StubWebGPURenderer, version: "0.160.0" });
if (!adapter || adapter.id !== "blackhole-three-01600") {
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
const result = await sketch.connectRealBlackholeThree({ registry, loader: stubLoader, version: "0.160.0" });
if (result.adapter.id !== "blackhole-three-01600") {
  console.error("FAIL: connectRealBlackholeThree returned wrong adapter");
  process.exit(1);
}
const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || stub.id !== "blackhole-three-01600") {
  console.error("FAIL: stub describe should reflect connected blackhole-three", stub);
  process.exit(1);
}

let threwOnMissingRegistry = false;
try { await sketch.connectRealBlackholeThree({ registry: null, loader: stubLoader }); } catch (error) { threwOnMissingRegistry = true; }
if (!threwOnMissingRegistry) { console.error("FAIL: connectRealBlackholeThree should throw without registry"); process.exit(1); }

let threwOnBadBuild = false;
try { sketch.buildRealBlackholeThreeAdapter({ three: null, WebGPURenderer: StubWebGPURenderer }); } catch (error) { threwOnBadBuild = true; }
if (!threwOnBadBuild) { console.error("FAIL: buildRealBlackholeThreeAdapter should throw without three"); process.exit(1); }

console.log("OK real blackhole-three sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real blackhole-three sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-blackhole-three-sketch test passed"
