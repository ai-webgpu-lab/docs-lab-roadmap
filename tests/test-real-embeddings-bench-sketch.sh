#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/benchmark-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/bench-embeddings-latency-quality/public/real-benchmark-sketch.js"

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

for (const exportName of ["connectRealEmbeddingsBench", "buildRealEmbeddingsBenchAdapter", "loadBenchmarkAndRuntime"]) {
  if (typeof sketch[exportName] !== "function") { console.error(`FAIL: missing ${exportName}`); process.exit(1); }
}

class StubSuite {}
const StubBenchmark = function () {};
StubBenchmark.Suite = StubSuite;

const stubPipeline = async (_task, _model, _opts) => async (_text, _options) => ({ data: new Float32Array(384), dims: [1, 384] });

const adapter = sketch.buildRealEmbeddingsBenchAdapter({ Benchmark: StubBenchmark, pipeline: stubPipeline, benchmarkVersion: "2.1.4", transformersVersion: "3.0.0" });
if (!adapter || !adapter.id.startsWith("bench-embeddings-")) { console.error("FAIL: id", adapter); process.exit(1); }
if (adapter.benchmarkType !== "embeddings-latency-quality") { console.error("FAIL: benchmarkType", adapter); process.exit(1); }

let t1 = false;
try { await adapter.runProfile({ profileId: "x", modelId: "m" }); } catch { t1 = true; }
if (!t1) { console.error("FAIL: run before create"); process.exit(1); }

await adapter.createBenchmark();

const sample = await adapter.runProfile({ profileId: "small", modelId: "Xenova/bge-small", query: "test", candidates: ["doc-1", "doc-2"] });
if (sample.dimensions !== 384 || !Number.isFinite(sample.embeddingsPerSec)) { console.error("FAIL: sample", sample); process.exit(1); }

const aggregate = await adapter.aggregateResults();
if (aggregate.profileCount !== 1 || aggregate.winner !== "small") { console.error("FAIL: aggregate", aggregate); process.exit(1); }

const stubLoader = async () => ({ Benchmark: StubBenchmark, transformers: {}, pipeline: stubPipeline });
const registry = fakeWindow.__aiWebGpuLabBenchmarkRegistry;
const r = await sketch.connectRealEmbeddingsBench({ registry, loader: stubLoader });
if (!r.adapter.id.startsWith("bench-embeddings-")) { console.error("FAIL: connect"); process.exit(1); }

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("bench-embeddings-")) { console.error("FAIL: describe", stub); process.exit(1); }

let t2 = false;
try { await sketch.connectRealEmbeddingsBench({ registry: null, loader: stubLoader }); } catch { t2 = true; }
if (!t2) { console.error("FAIL: missing registry"); process.exit(1); }

let t3 = false;
try { sketch.buildRealEmbeddingsBenchAdapter({ Benchmark: null, pipeline: stubPipeline }); } catch { t3 = true; }
if (!t3) { console.error("FAIL: null Benchmark"); process.exit(1); }

console.log("OK real embeddings-bench sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real embeddings-bench sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-embeddings-bench-sketch test passed"
