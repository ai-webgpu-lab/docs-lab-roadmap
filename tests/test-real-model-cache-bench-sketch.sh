#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/benchmark-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/p0/bench-model-load-and-cache/public/real-benchmark-sketch.js"

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

for (const exportName of ["connectRealModelCacheBench", "buildRealModelCacheBenchAdapter", "loadBenchmarkAndRuntime"]) {
  if (typeof sketch[exportName] !== "function") { console.error(`FAIL: missing ${exportName}`); process.exit(1); }
}

class StubSuite {}
const StubBenchmark = function () {};
StubBenchmark.Suite = StubSuite;
const stubPipeline = async (_task, _model, _opts) => async () => "ok";

let cacheDeleteCalls = 0;
const stubCaches = { delete: async () => { cacheDeleteCalls += 1; return true; } };

const adapter = sketch.buildRealModelCacheBenchAdapter({ Benchmark: StubBenchmark, pipeline: stubPipeline, caches: stubCaches, benchmarkVersion: "2.1.4", transformersVersion: "3.0.0" });
if (!adapter || !adapter.id.startsWith("bench-model-cache-")) { console.error("FAIL: id", adapter); process.exit(1); }
if (adapter.benchmarkType !== "model-load-and-cache") { console.error("FAIL: benchmarkType", adapter); process.exit(1); }

let t1 = false;
try { await adapter.runProfile({ profileId: "x", modelId: "m" }); } catch { t1 = true; }
if (!t1) { console.error("FAIL: run before create"); process.exit(1); }

await adapter.createBenchmark();

let t2 = false;
try { await adapter.runProfile({ profileId: "x", modelId: "m", cacheState: "lukewarm" }); } catch { t2 = true; }
if (!t2) { console.error("FAIL: invalid cacheState"); process.exit(1); }

const cold = await adapter.runProfile({ profileId: "cold", modelId: "Xenova/Phi-3", cacheState: "cold" });
const warm = await adapter.runProfile({ profileId: "warm", modelId: "Xenova/Phi-3", cacheState: "warm" });
if (cold.cacheState !== "cold" || warm.cacheState !== "warm") { console.error("FAIL: states", cold, warm); process.exit(1); }
if (cold.cacheCleared !== true) { console.error("FAIL: cold should clear cache", cold); process.exit(1); }
if (cacheDeleteCalls !== 1) { console.error("FAIL: cacheDelete count", cacheDeleteCalls); process.exit(1); }

const aggregate = await adapter.aggregateResults();
if (aggregate.profileCount !== 2 || !["cold", "warm"].includes(aggregate.winner)) { console.error("FAIL: aggregate", aggregate); process.exit(1); }
if (aggregate.coldWarmSpeedup === null || !Number.isFinite(aggregate.coldWarmSpeedup)) { console.error("FAIL: speedup", aggregate); process.exit(1); }

const stubLoader = async () => ({ Benchmark: StubBenchmark, transformers: {}, pipeline: stubPipeline, caches: stubCaches });
const registry = fakeWindow.__aiWebGpuLabBenchmarkRegistry;
const r = await sketch.connectRealModelCacheBench({ registry, loader: stubLoader });
if (!r.adapter.id.startsWith("bench-model-cache-")) { console.error("FAIL: connect"); process.exit(1); }

let t3 = false;
try { await sketch.connectRealModelCacheBench({ registry: null, loader: stubLoader }); } catch { t3 = true; }
if (!t3) { console.error("FAIL: missing registry"); process.exit(1); }

console.log("OK real model-cache-bench sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real model-cache-bench sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-model-cache-bench-sketch test passed"
