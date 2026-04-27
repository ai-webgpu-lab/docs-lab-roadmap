#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/benchmark-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/bench-atomics-and-memory/public/real-benchmark-sketch.js"

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

for (const exportName of ["connectRealAtomicsBench", "buildRealAtomicsBenchAdapter", "loadBenchmarkAndDevice"]) {
  if (typeof sketch[exportName] !== "function") { console.error(`FAIL: missing ${exportName}`); process.exit(1); }
}

class StubSuite {}
const StubBenchmark = function () {};
StubBenchmark.Suite = StubSuite;

const stubLayout = {};
const stubPipeline = { getBindGroupLayout: () => stubLayout };
const stubEncoder = {
  beginComputePass: () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} }),
  finish() { return {}; }
};
const stubDevice = {
  createShaderModule() { return {}; },
  createComputePipeline() { return stubPipeline; },
  createBuffer() { return {}; },
  createBindGroup() { return {}; },
  createCommandEncoder() { return stubEncoder; },
  queue: { submit() {} }
};

const adapter = sketch.buildRealAtomicsBenchAdapter({ Benchmark: StubBenchmark, device: stubDevice, benchmarkVersion: "2.1.4" });
if (!adapter || !adapter.id.startsWith("bench-atomics-")) { console.error("FAIL: id", adapter); process.exit(1); }
if (adapter.benchmarkType !== "atomics-and-memory") { console.error("FAIL: benchmarkType", adapter); process.exit(1); }

let t1 = false;
try { await adapter.runProfile({ profileId: "x" }); } catch { t1 = true; }
if (!t1) { console.error("FAIL: run before create"); process.exit(1); }

await adapter.createBenchmark();
const sample = await adapter.runProfile({ profileId: "h256", sampleCount: 4096, binCount: 256 });
if (!Number.isFinite(sample.memoryBandwidthGbps) || !Number.isFinite(sample.atomicsPerSec)) { console.error("FAIL: sample", sample); process.exit(1); }

const aggregate = await adapter.aggregateResults();
if (aggregate.profileCount !== 1 || aggregate.winner !== "h256") { console.error("FAIL: aggregate", aggregate); process.exit(1); }

const stubLoader = async () => ({ Benchmark: StubBenchmark, adapter: {}, device: stubDevice });
const registry = fakeWindow.__aiWebGpuLabBenchmarkRegistry;
const r = await sketch.connectRealAtomicsBench({ registry, loader: stubLoader });
if (!r.adapter.id.startsWith("bench-atomics-")) { console.error("FAIL: connect"); process.exit(1); }

let t2 = false;
try { await sketch.connectRealAtomicsBench({ registry: null, loader: stubLoader }); } catch { t2 = true; }
if (!t2) { console.error("FAIL: missing registry"); process.exit(1); }

let t3 = false;
try { sketch.buildRealAtomicsBenchAdapter({ Benchmark: StubBenchmark, device: null }); } catch { t3 = true; }
if (!t3) { console.error("FAIL: null device"); process.exit(1); }

console.log("OK real atomics-bench sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real atomics-bench sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-atomics-bench-sketch test passed"
