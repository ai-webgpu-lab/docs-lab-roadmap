#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/benchmark-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/bench-llm-prefill-decode/public/real-benchmark-sketch.js"

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

for (const exportName of ["connectRealLlmBench", "buildRealLlmBenchAdapter", "loadBenchmarkAndRuntime"]) {
  if (typeof sketch[exportName] !== "function") { console.error(`FAIL: missing ${exportName}`); process.exit(1); }
}

class StubSuite { constructor(name) { this.name = name; } }
const StubBenchmark = function () {};
StubBenchmark.Suite = StubSuite;

const stubPipeline = async (_task, _model, _opts) => async (_prompt, _options) => [{ generated_text: "alpha beta gamma" }];

const adapter = sketch.buildRealLlmBenchAdapter({ Benchmark: StubBenchmark, pipeline: stubPipeline, benchmarkVersion: "2.1.4", transformersVersion: "3.0.0" });
if (!adapter || !adapter.id.startsWith("bench-llm-")) { console.error("FAIL: id", adapter); process.exit(1); }
if (adapter.benchmarkType !== "llm-prefill-decode") { console.error("FAIL: benchmarkType", adapter); process.exit(1); }
for (const m of ["createBenchmark", "runProfile", "aggregateResults"]) {
  if (typeof adapter[m] !== "function") { console.error(`FAIL: missing ${m}`); process.exit(1); }
}

let t1 = false;
try { await adapter.runProfile({ profileId: "x", modelId: "m" }); } catch { t1 = true; }
if (!t1) { console.error("FAIL: run before create"); process.exit(1); }

await adapter.createBenchmark({ name: "test" });

let t2 = false;
try { await adapter.runProfile({ profileId: "x" }); } catch { t2 = true; }
if (!t2) { console.error("FAIL: missing modelId"); process.exit(1); }

const sampleA = await adapter.runProfile({ profileId: "alpha", modelId: "model-a", prompt: "hi", outputTokens: 8 });
const sampleB = await adapter.runProfile({ profileId: "beta", modelId: "model-b", prompt: "hi", outputTokens: 8 });
if (sampleA.profileId !== "alpha" || !Number.isFinite(sampleA.elapsedMs)) { console.error("FAIL: sampleA", sampleA); process.exit(1); }
if (sampleB.profileId !== "beta") { console.error("FAIL: sampleB", sampleB); process.exit(1); }

const aggregate = await adapter.aggregateResults();
if (aggregate.profileCount !== 2 || !["alpha", "beta"].includes(aggregate.winner)) { console.error("FAIL: aggregate", aggregate); process.exit(1); }

const stubLoader = async () => ({ Benchmark: StubBenchmark, transformers: {}, pipeline: stubPipeline });
const registry = fakeWindow.__aiWebGpuLabBenchmarkRegistry;
const r = await sketch.connectRealLlmBench({ registry, loader: stubLoader });
if (!r.adapter.id.startsWith("bench-llm-")) { console.error("FAIL: connect"); process.exit(1); }

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("bench-llm-")) { console.error("FAIL: describe", stub); process.exit(1); }

let t3 = false;
try { await sketch.connectRealLlmBench({ registry: null, loader: stubLoader }); } catch { t3 = true; }
if (!t3) { console.error("FAIL: missing registry"); process.exit(1); }

let t4 = false;
try { sketch.buildRealLlmBenchAdapter({ Benchmark: null, pipeline: stubPipeline }); } catch { t4 = true; }
if (!t4) { console.error("FAIL: null Benchmark"); process.exit(1); }

let t5 = false;
try { sketch.buildRealLlmBenchAdapter({ Benchmark: StubBenchmark, pipeline: null }); } catch { t5 = true; }
if (!t5) { console.error("FAIL: null pipeline"); process.exit(1); }

const empty = await sketch.buildRealLlmBenchAdapter({ Benchmark: StubBenchmark, pipeline: stubPipeline }).aggregateResults();
if (empty.profileCount !== 0 || empty.winner !== null) { console.error("FAIL: empty aggregate", empty); process.exit(1); }

console.log("OK real llm-bench sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real llm-bench sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-llm-bench-sketch test passed"
