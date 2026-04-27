#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/runtime-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/p0/exp-rag-browser-pipeline/public/real-runtime-sketch.js"

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

for (const exportName of ["connectRealRag", "buildRealRagAdapter", "loadRagFromCdn"]) {
  if (typeof sketch[exportName] !== "function") { console.error(`FAIL: missing ${exportName}`); process.exit(1); }
}

let embedderCalls = 0;
const stubEmbedder = async () => ({ data: new Float32Array([1, 0, 0, 0]), dims: [1, 4] });
let generatorCalls = 0;
const stubGenerator = async () => [{ generated_text: "synthesized answer text" }];
const pipelineFactory = async (task) => {
  if (task === "feature-extraction") return async (...args) => { embedderCalls += 1; return stubEmbedder(...args); };
  if (task === "text-generation") return async (...args) => { generatorCalls += 1; return stubGenerator(...args); };
  throw new Error(`unknown task ${task}`);
};
const stubEnv = { allowRemoteModels: false };
const stubLoader = async () => ({ pipeline: pipelineFactory, env: stubEnv });

const adapter = sketch.buildRealRagAdapter({ pipeline: pipelineFactory, env: stubEnv, version: "3.0.0" });
if (!adapter || !adapter.id.startsWith("rag-")) { console.error("FAIL: id", adapter); process.exit(1); }
for (const m of ["loadRuntime", "prefill", "decode"]) {
  if (typeof adapter[m] !== "function") { console.error(`FAIL: missing ${m}`); process.exit(1); }
}

const runtime = await adapter.loadRuntime({ device: "cpu" });
if (!runtime.embedder || !runtime.generator) { console.error("FAIL: loadRuntime", runtime); process.exit(1); }

const prefill = await adapter.prefill(null, { query: "what is alpha", documents: [
  { id: "d1", text: "alpha is the first letter" },
  { id: "d2", text: "beta is the second letter" }
] });
if (prefill.documents.length !== 2) { console.error("FAIL: prefill", prefill); process.exit(1); }

const decode = await adapter.decode(runtime, prefill, 16);
if (decode.topK.length !== 2 || !decode.text || !Number.isFinite(decode.retrieveMs) || !Number.isFinite(decode.answerMs)) {
  console.error("FAIL: decode", decode); process.exit(1);
}
if (generatorCalls !== 1) { console.error("FAIL: generator should be called once", generatorCalls); process.exit(1); }
// Three embedder calls: 1 query + 2 docs
if (embedderCalls !== 3) { console.error("FAIL: embedder should be called 3 times, got", embedderCalls); process.exit(1); }

let t1 = false;
const fresh = sketch.buildRealRagAdapter({ pipeline: pipelineFactory, env: stubEnv, version: "3.0.0" });
try { await fresh.decode(null, prefill, 16); } catch { t1 = true; }
if (!t1) { console.error("FAIL: decode without runtime"); process.exit(1); }

let t2 = false;
try { await fresh.decode({ embedder: runtime.embedder, generator: runtime.generator }, { query: "x", documents: [] }, 16); } catch { t2 = true; }
if (!t2) { console.error("FAIL: decode with no documents"); process.exit(1); }

const registry = fakeWindow.__aiWebGpuLabRuntimeRegistry;
const r = await sketch.connectRealRag({ registry, loader: stubLoader, version: "3.0.0" });
if (!r.adapter.id.startsWith("rag-")) { console.error("FAIL: connect"); process.exit(1); }

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("rag-")) { console.error("FAIL: describe", stub); process.exit(1); }

let t3 = false;
try { await sketch.connectRealRag({ registry: null, loader: stubLoader }); } catch { t3 = true; }
if (!t3) { console.error("FAIL: missing registry"); process.exit(1); }

let t4 = false;
try { sketch.buildRealRagAdapter({ pipeline: null }); } catch { t4 = true; }
if (!t4) { console.error("FAIL: null pipeline"); process.exit(1); }

console.log("OK real rag sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real rag sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-rag-sketch test passed"
