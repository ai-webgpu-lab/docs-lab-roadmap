#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/renderer-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/exp-deckgl-webgpu-readiness/public/real-renderer-sketch.js"

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

for (const exportName of ["connectRealDeck", "buildRealDeckAdapter", "loadDeckFromCdn"]) {
  if (typeof sketch[exportName] !== "function") {
    console.error(`FAIL: missing export ${exportName}`);
    process.exit(1);
  }
}

class StubScatterplotLayer {
  constructor(props) { this.props = props; }
}
class StubDeck {
  constructor(props) { this.props = props; this.layers = []; }
  setProps(props) { Object.assign(this.props, props); this.layers = props.layers || []; }
  redraw() {}
}

const adapter = sketch.buildRealDeckAdapter({ Deck: StubDeck, ScatterplotLayer: StubScatterplotLayer, version: "9.0.0" });
if (!adapter || adapter.id !== "deckgl-webgpu-900") {
  console.error("FAIL: unexpected adapter id", adapter && adapter.id);
  process.exit(1);
}
for (const method of ["createRenderer", "loadScene", "renderFrame"]) {
  if (typeof adapter[method] !== "function") {
    console.error(`FAIL: adapter missing ${method}`);
    process.exit(1);
  }
}

let threwOnNoDeck = false;
try { await adapter.loadScene({}); } catch (error) { threwOnNoDeck = true; }
if (!threwOnNoDeck) { console.error("FAIL: loadScene should throw before createRenderer"); process.exit(1); }

const stubLoader = async () => ({ Deck: StubDeck, ScatterplotLayer: StubScatterplotLayer });
const registry = fakeWindow.__aiWebGpuLabRendererRegistry;
const result = await sketch.connectRealDeck({ registry, loader: stubLoader, version: "9.0.0" });
if (result.adapter.id !== "deckgl-webgpu-900") {
  console.error("FAIL: connectRealDeck returned wrong adapter");
  process.exit(1);
}
const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || stub.id !== "deckgl-webgpu-900") {
  console.error("FAIL: stub describe should reflect connected deckgl", stub);
  process.exit(1);
}

let threwOnMissingRegistry = false;
try { await sketch.connectRealDeck({ registry: null, loader: stubLoader }); } catch (error) { threwOnMissingRegistry = true; }
if (!threwOnMissingRegistry) { console.error("FAIL: connectRealDeck should throw without registry"); process.exit(1); }

let threwOnBadBuild = false;
try { sketch.buildRealDeckAdapter({ Deck: null, ScatterplotLayer: StubScatterplotLayer }); } catch (error) { threwOnBadBuild = true; }
if (!threwOnBadBuild) { console.error("FAIL: buildRealDeckAdapter should throw without Deck"); process.exit(1); }

console.log("OK real deck.gl sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real deck.gl sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-deckgl-sketch test passed"
