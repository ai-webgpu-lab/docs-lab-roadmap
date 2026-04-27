#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/benchmark-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/bench-compute-stress-suite/public/real-benchmark-sketch.js"

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

for (const exportName of ["connectRealComputeBench", "buildRealComputeBenchAdapter", "loadBenchmarkAndDevice"]) {
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

const adapter = sketch.buildRealComputeBenchAdapter({ Benchmark: StubBenchmark, device: stubDevice, benchmarkVersion: "2.1.4" });
if (!adapter || !adapter.id.startsWith("bench-compute-")) { console.error("FAIL: id", adapter); process.exit(1); }
if (adapter.benchmarkType !== "compute-stress-suite") { console.error("FAIL: benchmarkType", adapter); process.exit(1); }

let t1 = false;
try { await adapter.runProfile({ profileId: "x", kernel: "nbody" }); } catch { t1 = true; }
if (!t1) { console.error("FAIL: run before create"); process.exit(1); }

await adapter.createBenchmark();

let t2 = false;
try { await adapter.runProfile({ profileId: "x", kernel: "unknown" }); } catch { t2 = true; }
if (!t2) { console.error("FAIL: unknown kernel"); process.exit(1); }

const sampleA = await adapter.runProfile({ profileId: "nbody", kernel: "nbody", count: 512, dispatches: 4 });
const sampleB = await adapter.runProfile({ profileId: "fluid", kernel: "fluid", count: 512, dispatches: 4 });
if (sampleA.kernel !== "nbody" || sampleB.kernel !== "fluid") { console.error("FAIL: samples", sampleA, sampleB); process.exit(1); }

const aggregate = await adapter.aggregateResults();
if (aggregate.profileCount !== 2 || !["nbody", "fluid"].includes(aggregate.winner)) { console.error("FAIL: aggregate", aggregate); process.exit(1); }

const stubLoader = async () => ({ Benchmark: StubBenchmark, adapter: {}, device: stubDevice });
const registry = fakeWindow.__aiWebGpuLabBenchmarkRegistry;
const r = await sketch.connectRealComputeBench({ registry, loader: stubLoader });
if (!r.adapter.id.startsWith("bench-compute-")) { console.error("FAIL: connect"); process.exit(1); }

let t3 = false;
try { await sketch.connectRealComputeBench({ registry: null, loader: stubLoader }); } catch { t3 = true; }
if (!t3) { console.error("FAIL: missing registry"); process.exit(1); }

console.log("OK real compute-bench sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real compute-bench sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-compute-bench-sketch test passed"
