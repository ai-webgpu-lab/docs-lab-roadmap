#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/app-surface-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/app-browser-image-lab/public/real-surface-sketch.js"

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

for (const exportName of ["connectRealImageLab", "buildRealImageLabAdapter", "loadImageLabManifest"]) {
  if (typeof sketch[exportName] !== "function") { console.error(`FAIL: missing ${exportName}`); process.exit(1); }
}

const stubManifest = {
  id: "image-lab-test",
  label: "Test Image Lab",
  version: "0.9.0",
  prompts: [
    { id: "p1", label: "Prompt One" },
    { id: "p2", label: "Prompt Two" }
  ]
};
const sink = { items: [], push(x) { this.items.push(x); } };

const adapter = sketch.buildRealImageLabAdapter({ manifest: stubManifest, telemetrySink: sink });
if (!adapter || adapter.id !== "image-lab-image-lab-test-0.9.0") { console.error("FAIL: id", adapter); process.exit(1); }
if (adapter.surfaceType !== "real-image-prompt") { console.error("FAIL: surfaceType", adapter); process.exit(1); }

let t1 = false;
try { await adapter.renderSurface({}); } catch { t1 = true; }
if (!t1) { console.error("FAIL: renderSurface before load"); process.exit(1); }

const loaded = await adapter.loadDataset({ promptId: "p2" });
if (loaded.prompt.id !== "p2") { console.error("FAIL: loadDataset", loaded); process.exit(1); }

let t2 = false;
try { await adapter.loadDataset({ promptId: "missing" }); } catch { t2 = true; }
if (!t2) { console.error("FAIL: missing prompt"); process.exit(1); }

await adapter.loadDataset({ promptId: "p1" });
const rendered = await adapter.renderSurface({ frameIndex: 12 });
if (rendered.promptId !== "p1" || rendered.frameIndex !== 12) { console.error("FAIL: render meta", rendered); process.exit(1); }

const tele = await adapter.recordTelemetry({ kind: "diffusion-step" });
if (tele.manifestId !== "image-lab-test" || sink.items.length !== 1) { console.error("FAIL: telemetry", tele); process.exit(1); }

const stubLoader = async () => stubManifest;
const registry = fakeWindow.__aiWebGpuLabAppSurfaceRegistry;
const r = await sketch.connectRealImageLab({ registry, loader: stubLoader, telemetrySink: sink });
if (!r.adapter.id.startsWith("image-lab-")) { console.error("FAIL: connect"); process.exit(1); }

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("image-lab-")) { console.error("FAIL: stub describe", stub); process.exit(1); }

let t3 = false;
try { await sketch.connectRealImageLab({ registry: null, loader: stubLoader }); } catch { t3 = true; }
if (!t3) { console.error("FAIL: missing registry"); process.exit(1); }

let t4 = false;
try { sketch.buildRealImageLabAdapter({ manifest: null }); } catch { t4 = true; }
if (!t4) { console.error("FAIL: null manifest"); process.exit(1); }

console.log("OK real image-lab sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real image-lab sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-image-lab-sketch test passed"
