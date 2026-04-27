#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/runtime-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/exp-reranker-browser/public/real-runtime-sketch.js"

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

for (const exportName of ["connectRealReranker", "buildRealRerankerAdapter", "loadRerankerFromCdn"]) {
  if (typeof sketch[exportName] !== "function") { console.error(`FAIL: missing ${exportName}`); process.exit(1); }
}

let invocation = 0;
const scores = [0.2, 0.9, 0.5];
const stubPipeline = async () => async () => {
  const score = scores[invocation % scores.length];
  invocation += 1;
  return [{ score, label: "REL" }];
};
const stubEnv = { allowRemoteModels: false };
const adapter = sketch.buildRealRerankerAdapter({ pipeline: await stubPipeline(), env: stubEnv, version: "3.0.0", modelId: "Xenova/bge-reranker-base" });
if (!adapter || !adapter.id.startsWith("reranker-")) { console.error("FAIL: id", adapter); process.exit(1); }
for (const m of ["loadRuntime", "prefill", "decode"]) {
  if (typeof adapter[m] !== "function") { console.error(`FAIL: missing ${m}`); process.exit(1); }
}

const prefill = await adapter.prefill(null, { query: "rare event detection", candidates: [
  { id: "c1", text: "Anomaly detection in time series" },
  { id: "c2", text: "Image classification" },
  { id: "c3", text: "Rare event detection in logs" }
] });
if (prefill.candidates.length !== 3) { console.error("FAIL: prefill", prefill); process.exit(1); }

const decode = await adapter.decode(await stubPipeline(), prefill, 5);
if (decode.topK.length !== 3) { console.error("FAIL: topK length", decode.topK); process.exit(1); }
if (decode.topK[0].score < decode.topK[1].score) { console.error("FAIL: not sorted desc", decode.topK); process.exit(1); }

let t1 = false;
const fresh = sketch.buildRealRerankerAdapter({ pipeline: await stubPipeline(), env: stubEnv, version: "3.0.0", modelId: "Xenova/bge-reranker-base" });
try { await fresh.decode(null, prefill, 5); } catch { t1 = true; }
if (!t1) { console.error("FAIL: decode without runtime"); process.exit(1); }

let t2 = false;
const fresh2 = sketch.buildRealRerankerAdapter({ pipeline: await stubPipeline(), env: stubEnv, version: "3.0.0", modelId: "Xenova/bge-reranker-base" });
try { await fresh2.decode(await stubPipeline(), { query: "x", candidates: [] }, 5); } catch { t2 = true; }
if (!t2) { console.error("FAIL: decode with no candidates"); process.exit(1); }

const stubLoader = async () => ({ pipeline: await stubPipeline(), env: stubEnv });
const registry = fakeWindow.__aiWebGpuLabRuntimeRegistry;
const r = await sketch.connectRealReranker({ registry, loader: stubLoader, version: "3.0.0", modelId: "Xenova/bge-reranker-base" });
if (!r.adapter.id.startsWith("reranker-")) { console.error("FAIL: connect"); process.exit(1); }

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("reranker-")) { console.error("FAIL: describe", stub); process.exit(1); }

let t3 = false;
try { await sketch.connectRealReranker({ registry: null, loader: stubLoader }); } catch { t3 = true; }
if (!t3) { console.error("FAIL: missing registry"); process.exit(1); }

let t4 = false;
try { sketch.buildRealRerankerAdapter({ pipeline: null }); } catch { t4 = true; }
if (!t4) { console.error("FAIL: null pipeline"); process.exit(1); }

console.log("OK real reranker sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real reranker sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-reranker-sketch test passed"
