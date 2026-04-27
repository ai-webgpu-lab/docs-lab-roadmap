#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/benchmark-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/bench-rag-endtoend/public/real-benchmark-sketch.js"

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

for (const exportName of ["connectRealRagBench", "buildRealRagBenchAdapter", "loadBenchmarkAndRuntime"]) {
  if (typeof sketch[exportName] !== "function") { console.error(`FAIL: missing ${exportName}`); process.exit(1); }
}

class StubSuite {}
const StubBenchmark = function () {};
StubBenchmark.Suite = StubSuite;

let embedderCalls = 0;
let generatorCalls = 0;
const pipelineFactory = async (task) => {
  if (task === "feature-extraction") {
    return async (_text, _options) => { embedderCalls += 1; return { data: new Float32Array([1, 0, 0, 0]), dims: [1, 4] }; };
  }
  if (task === "text-generation") {
    return async (_prompt, _opts) => { generatorCalls += 1; return [{ generated_text: "synthesized answer" }]; };
  }
  throw new Error(`unknown task ${task}`);
};

const adapter = sketch.buildRealRagBenchAdapter({ Benchmark: StubBenchmark, pipeline: pipelineFactory, benchmarkVersion: "2.1.4", transformersVersion: "3.0.0" });
if (!adapter || !adapter.id.startsWith("bench-rag-")) { console.error("FAIL: id", adapter); process.exit(1); }
if (adapter.benchmarkType !== "rag-endtoend") { console.error("FAIL: benchmarkType", adapter); process.exit(1); }

let t1 = false;
try { await adapter.runProfile({ profileId: "x", embedderId: "e", generatorId: "g", documents: [] }); } catch { t1 = true; }
if (!t1) { console.error("FAIL: run before create"); process.exit(1); }

await adapter.createBenchmark();

let t2 = false;
try { await adapter.runProfile({ profileId: "x", embedderId: "e", generatorId: "g", documents: [] }); } catch { t2 = true; }
if (!t2) { console.error("FAIL: empty documents"); process.exit(1); }

const sample = await adapter.runProfile({
  profileId: "primary",
  embedderId: "Xenova/bge-small",
  generatorId: "Xenova/Phi-3",
  query: "what is alpha",
  documents: [{ id: "d1", text: "alpha is the first letter" }, { id: "d2", text: "beta is the second letter" }],
  outputTokens: 16
});
if (!Number.isFinite(sample.retrieveMs) || !Number.isFinite(sample.answerMs) || sample.topK.length !== 2) {
  console.error("FAIL: sample", sample); process.exit(1);
}
// 1 query + 2 docs = 3 embedder calls, 1 generator call
if (embedderCalls !== 3 || generatorCalls !== 1) {
  console.error("FAIL: pipeline counts", embedderCalls, generatorCalls); process.exit(1);
}

const aggregate = await adapter.aggregateResults();
if (aggregate.profileCount !== 1 || aggregate.winner !== "primary") { console.error("FAIL: aggregate", aggregate); process.exit(1); }

const stubLoader = async () => ({ Benchmark: StubBenchmark, transformers: {}, pipeline: pipelineFactory });
const registry = fakeWindow.__aiWebGpuLabBenchmarkRegistry;
const r = await sketch.connectRealRagBench({ registry, loader: stubLoader });
if (!r.adapter.id.startsWith("bench-rag-")) { console.error("FAIL: connect"); process.exit(1); }

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("bench-rag-")) { console.error("FAIL: describe", stub); process.exit(1); }

let t3 = false;
try { await sketch.connectRealRagBench({ registry: null, loader: stubLoader }); } catch { t3 = true; }
if (!t3) { console.error("FAIL: missing registry"); process.exit(1); }

console.log("OK real rag-bench sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real rag-bench sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-rag-bench-sketch test passed"
