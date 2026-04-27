#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/renderer-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/exp-pixi-webgpu-2d/public/real-renderer-sketch.js"

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

for (const exportName of ["connectRealPixi", "buildRealPixiAdapter", "loadPixiFromCdn"]) {
  if (typeof sketch[exportName] !== "function") {
    console.error(`FAIL: missing export ${exportName}`);
    process.exit(1);
  }
}

class StubGraphics {
  constructor() { this.x = 0; this.y = 0; }
  circle() { return this; }
  fill() { return this; }
}
class StubStage {
  constructor() { this.children = []; this.rotation = 0; }
  addChild(child) { this.children.push(child); }
}
class StubApplication {
  constructor() { this.stage = new StubStage(); this.canvas = null; }
  async init({ canvas }) { this.canvas = canvas; }
  render() {}
}
const stubPixi = { Application: StubApplication, Graphics: StubGraphics };

const adapter = sketch.buildRealPixiAdapter({ pixi: stubPixi, Application: StubApplication, version: "8.3.4" });
if (!adapter || adapter.id !== "pixi-webgpu-834") {
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

const stubLoader = async () => ({ pixi: stubPixi, Application: StubApplication });
const registry = fakeWindow.__aiWebGpuLabRendererRegistry;
const result = await sketch.connectRealPixi({ registry, loader: stubLoader, version: "8.3.4" });
if (result.adapter.id !== "pixi-webgpu-834") {
  console.error("FAIL: connectRealPixi returned wrong adapter");
  process.exit(1);
}
const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || stub.id !== "pixi-webgpu-834") {
  console.error("FAIL: stub describe should reflect connected pixi", stub);
  process.exit(1);
}

let threwOnMissingRegistry = false;
try { await sketch.connectRealPixi({ registry: null, loader: stubLoader }); } catch (error) { threwOnMissingRegistry = true; }
if (!threwOnMissingRegistry) { console.error("FAIL: connectRealPixi should throw without registry"); process.exit(1); }

let threwOnBadBuild = false;
try { sketch.buildRealPixiAdapter({ pixi: null, Application: StubApplication }); } catch (error) { threwOnBadBuild = true; }
if (!threwOnBadBuild) { console.error("FAIL: buildRealPixiAdapter should throw without pixi"); process.exit(1); }

console.log("OK real pixi sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real pixi sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-pixi-sketch test passed"
