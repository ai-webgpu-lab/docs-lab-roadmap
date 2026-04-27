#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/benchmark-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/p0/bench-worker-isolation-and-ui-jank/public/real-benchmark-sketch.js"

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

for (const exportName of ["connectRealWorkerIsolationBench", "buildRealWorkerIsolationBenchAdapter", "loadBenchmarkAndRuntime"]) {
  if (typeof sketch[exportName] !== "function") { console.error(`FAIL: missing ${exportName}`); process.exit(1); }
}

class StubSuite {}
const StubBenchmark = function () {};
StubBenchmark.Suite = StubSuite;

let frameTime = 0;
const stubRaf = (callback) => {
  frameTime += 16.7;
  setTimeout(() => callback(frameTime), 0);
  return frameTime;
};

const adapter = sketch.buildRealWorkerIsolationBenchAdapter({ Benchmark: StubBenchmark, raf: stubRaf, benchmarkVersion: "2.1.4" });
if (!adapter || !adapter.id.startsWith("bench-worker-")) { console.error("FAIL: id", adapter); process.exit(1); }
if (adapter.benchmarkType !== "worker-isolation-and-ui-jank") { console.error("FAIL: benchmarkType", adapter); process.exit(1); }

let t1 = false;
try { await adapter.runProfile({ profileId: "x" }); } catch { t1 = true; }
if (!t1) { console.error("FAIL: run before create"); process.exit(1); }

await adapter.createBenchmark();

let t2 = false;
try { await adapter.runProfile({ profileId: "x", mode: "bogus" }); } catch { t2 = true; }
if (!t2) { console.error("FAIL: invalid mode"); process.exit(1); }

let t3 = false;
try { await adapter.runProfile({ profileId: "x", mode: "worker" }); } catch { t3 = true; }
if (!t3) { console.error("FAIL: worker without factory"); process.exit(1); }

const mainSample = await adapter.runProfile({ profileId: "main", mode: "main", burnMs: 1, frameSamples: 4 });
if (mainSample.mode !== "main" || mainSample.frameSamples !== 4) { console.error("FAIL: main sample", mainSample); process.exit(1); }

const workerFactory = ({ burnMs }) => ({ run: async () => { return { burnMs }; } });
const workerSample = await adapter.runProfile({ profileId: "worker", mode: "worker", burnMs: 1, frameSamples: 4, workerFactory });
if (workerSample.mode !== "worker") { console.error("FAIL: worker sample", workerSample); process.exit(1); }

const aggregate = await adapter.aggregateResults();
if (aggregate.profileCount !== 2) { console.error("FAIL: aggregate count", aggregate); process.exit(1); }

const stubLoader = async () => ({ Benchmark: StubBenchmark, raf: stubRaf });
const registry = fakeWindow.__aiWebGpuLabBenchmarkRegistry;
const r = await sketch.connectRealWorkerIsolationBench({ registry, loader: stubLoader });
if (!r.adapter.id.startsWith("bench-worker-")) { console.error("FAIL: connect"); process.exit(1); }

let t4 = false;
try { await sketch.connectRealWorkerIsolationBench({ registry: null, loader: stubLoader }); } catch { t4 = true; }
if (!t4) { console.error("FAIL: missing registry"); process.exit(1); }

console.log("OK real worker-bench sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real worker-bench sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-worker-bench-sketch test passed"
