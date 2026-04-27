#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/app-surface-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/app-private-rag-lab/public/real-surface-sketch.js"

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

for (const exportName of ["connectRealPrivateRag", "buildRealPrivateRagAdapter", "loadCorpusManifest"]) {
  if (typeof sketch[exportName] !== "function") {
    console.error(`FAIL: missing export ${exportName}`);
    process.exit(1);
  }
}

const stubManifest = {
  id: "private-rag-test",
  label: "Test Corpus",
  version: "0.9.0",
  collections: [
    { id: "alpha", label: "Alpha Collection" },
    { id: "beta", label: "Beta Collection" }
  ]
};
const sink = { items: [], push(x) { this.items.push(x); } };

const adapter = sketch.buildRealPrivateRagAdapter({ manifest: stubManifest, telemetrySink: sink });
if (!adapter || adapter.id !== "private-rag-private-rag-test-0.9.0") {
  console.error("FAIL: unexpected adapter id", adapter && adapter.id);
  process.exit(1);
}
if (adapter.surfaceType !== "real-rag-corpus" || adapter.isReal !== true) {
  console.error("FAIL: adapter metadata wrong", adapter);
  process.exit(1);
}

let threw = false;
try { await adapter.renderSurface({}); } catch (error) { threw = true; }
if (!threw) { console.error("FAIL: renderSurface should throw before loadDataset"); process.exit(1); }

const loaded = await adapter.loadDataset({ collectionId: "beta" });
if (loaded.collection.id !== "beta") { console.error("FAIL: loadDataset returned wrong collection", loaded); process.exit(1); }

let badThrew = false;
try { await adapter.loadDataset({ collectionId: "missing" }); } catch (error) { badThrew = true; }
if (!badThrew) { console.error("FAIL: loadDataset should throw on unknown collection"); process.exit(1); }

await adapter.loadDataset({ collectionId: "alpha" });
const rendered = await adapter.renderSurface({ frameIndex: 5 });
if (rendered.frameIndex !== 5 || rendered.collectionId !== "alpha") { console.error("FAIL: renderSurface metadata wrong", rendered); process.exit(1); }

const tele = await adapter.recordTelemetry({ kind: "rag-hit", value: 0.91 });
if (tele.manifestId !== "private-rag-test" || sink.items.length !== 1) {
  console.error("FAIL: telemetry not enriched / sink not invoked", tele, sink.items);
  process.exit(1);
}

const stubLoader = async () => stubManifest;
const registry = fakeWindow.__aiWebGpuLabAppSurfaceRegistry;
const result = await sketch.connectRealPrivateRag({ registry, loader: stubLoader, telemetrySink: sink });
if (result.adapter.id !== "private-rag-private-rag-test-0.9.0") {
  console.error("FAIL: connectRealPrivateRag returned wrong adapter");
  process.exit(1);
}

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("private-rag-")) {
  console.error("FAIL: stub describe should reflect connected private-rag", stub);
  process.exit(1);
}

let regThrew = false;
try { await sketch.connectRealPrivateRag({ registry: null, loader: stubLoader }); } catch (error) { regThrew = true; }
if (!regThrew) { console.error("FAIL: connectRealPrivateRag should throw without registry"); process.exit(1); }

let badBuild = false;
try { sketch.buildRealPrivateRagAdapter({ manifest: null }); } catch (error) { badBuild = true; }
if (!badBuild) { console.error("FAIL: buildRealPrivateRagAdapter should throw on null manifest"); process.exit(1); }

console.log("OK real private-rag sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real private-rag sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-private-rag-sketch test passed"
