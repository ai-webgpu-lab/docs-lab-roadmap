#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/benchmark-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/bench-reranker-latency/public/real-benchmark-sketch.js"

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

for (const exportName of ["connectRealRerankerBench", "buildRealRerankerBenchAdapter", "loadBenchmarkAndRuntime"]) {
  if (typeof sketch[exportName] !== "function") { console.error(`FAIL: missing ${exportName}`); process.exit(1); }
}

class StubSuite {}
const StubBenchmark = function () {};
StubBenchmark.Suite = StubSuite;

let invocation = 0;
const scores = [0.2, 0.9, 0.5];
const stubPipeline = async (_task, _model, _opts) => async (_inputs) => {
  const score = scores[invocation % scores.length];
  invocation += 1;
  return [{ score, label: "REL" }];
};

const adapter = sketch.buildRealRerankerBenchAdapter({ Benchmark: StubBenchmark, pipeline: stubPipeline, benchmarkVersion: "2.1.4", transformersVersion: "3.0.0" });
if (!adapter || !adapter.id.startsWith("bench-reranker-")) { console.error("FAIL: id", adapter); process.exit(1); }
if (adapter.benchmarkType !== "reranker-latency") { console.error("FAIL: benchmarkType", adapter); process.exit(1); }

let t1 = false;
try { await adapter.runProfile({ profileId: "x", modelId: "m", candidates: [] }); } catch { t1 = true; }
if (!t1) { console.error("FAIL: run before create"); process.exit(1); }

await adapter.createBenchmark();

let t2 = false;
try { await adapter.runProfile({ profileId: "x", modelId: "m", candidates: [] }); } catch { t2 = true; }
if (!t2) { console.error("FAIL: empty candidates"); process.exit(1); }

const sample = await adapter.runProfile({ profileId: "small", modelId: "Xenova/bge-reranker", query: "rare", candidates: [
  { id: "c1", text: "Anomaly detection in time series" },
  { id: "c2", text: "Image classification" },
  { id: "c3", text: "Rare event detection in logs" }
] });
if (!Number.isFinite(sample.candidatesPerSec) || sample.topK.length !== 3) { console.error("FAIL: sample", sample); process.exit(1); }
if (sample.topK[0].score < sample.topK[1].score) { console.error("FAIL: not sorted desc", sample.topK); process.exit(1); }

const aggregate = await adapter.aggregateResults();
if (aggregate.profileCount !== 1 || aggregate.winner !== "small") { console.error("FAIL: aggregate", aggregate); process.exit(1); }

const stubLoader = async () => ({ Benchmark: StubBenchmark, transformers: {}, pipeline: stubPipeline });
const registry = fakeWindow.__aiWebGpuLabBenchmarkRegistry;
const r = await sketch.connectRealRerankerBench({ registry, loader: stubLoader });
if (!r.adapter.id.startsWith("bench-reranker-")) { console.error("FAIL: connect"); process.exit(1); }

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("bench-reranker-")) { console.error("FAIL: describe", stub); process.exit(1); }

let t3 = false;
try { await sketch.connectRealRerankerBench({ registry: null, loader: stubLoader }); } catch { t3 = true; }
if (!t3) { console.error("FAIL: missing registry"); process.exit(1); }

console.log("OK real reranker-bench sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real reranker-bench sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-reranker-bench-sketch test passed"
