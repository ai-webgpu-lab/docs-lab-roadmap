#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/renderer-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/exp-playcanvas-webgpu-core/public/real-renderer-sketch.js"

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

for (const exportName of ["connectRealPlayCanvas", "buildRealPlayCanvasAdapter", "loadPlayCanvasFromCdn"]) {
  if (typeof sketch[exportName] !== "function") {
    console.error(`FAIL: missing export ${exportName}`);
    process.exit(1);
  }
}

class StubEntity {
  constructor(name) { this.name = name; this.children = []; }
  addComponent() {}
  setPosition() {}
  lookAt() {}
}
class StubApplication {
  constructor(canvas) { this.canvas = canvas; this.root = new StubEntity("root"); }
  start() {}
  render() {}
}
const stubPlayCanvas = {
  Application: StubApplication,
  Entity: StubEntity,
  Color: class { constructor(r, g, b) { this.r = r; this.g = g; this.b = b; } }
};

const adapter = sketch.buildRealPlayCanvasAdapter({
  playcanvas: stubPlayCanvas,
  Application: StubApplication,
  version: "2.2.0"
});

if (!adapter || adapter.id !== "playcanvas-webgpu-220") {
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

let threwOnNoApp = false;
try { await adapter.loadScene({}); } catch (error) { threwOnNoApp = true; }
if (!threwOnNoApp) { console.error("FAIL: loadScene should throw before createRenderer"); process.exit(1); }

const stubLoader = async () => ({ playcanvas: stubPlayCanvas, Application: StubApplication });
const registry = fakeWindow.__aiWebGpuLabRendererRegistry;
const result = await sketch.connectRealPlayCanvas({ registry, loader: stubLoader, version: "2.2.0" });
if (result.adapter.id !== "playcanvas-webgpu-220") {
  console.error("FAIL: connectRealPlayCanvas returned wrong adapter");
  process.exit(1);
}
const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || stub.id !== "playcanvas-webgpu-220") {
  console.error("FAIL: stub describe should reflect connected playcanvas", stub);
  process.exit(1);
}

let threwOnMissingRegistry = false;
try { await sketch.connectRealPlayCanvas({ registry: null, loader: stubLoader }); } catch (error) { threwOnMissingRegistry = true; }
if (!threwOnMissingRegistry) { console.error("FAIL: connectRealPlayCanvas should throw without registry"); process.exit(1); }

let threwOnBadBuild = false;
try { sketch.buildRealPlayCanvasAdapter({ playcanvas: null, Application: StubApplication }); } catch (error) { threwOnBadBuild = true; }
if (!threwOnBadBuild) { console.error("FAIL: buildRealPlayCanvasAdapter should throw without playcanvas"); process.exit(1); }

console.log("OK real playcanvas sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real playcanvas sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-playcanvas-sketch test passed"
