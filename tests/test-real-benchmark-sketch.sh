#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/repos/bench-renderer-shootout/public/benchmark-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/bench-renderer-shootout/public/real-benchmark-sketch.js"

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

for (const exportName of ["connectRealBenchmark", "buildRealBenchmarkAdapter", "loadBenchmarkFromCdn"]) {
  if (typeof sketch[exportName] !== "function") {
    console.error(`FAIL: missing export ${exportName}`);
    process.exit(1);
  }
}

class StubSuite {
  constructor(name) { this.name = name; this.added = []; }
  add(name, fn) { this.added.push({ name, fn }); return this; }
}
const StubBenchmark = function () {};
StubBenchmark.Suite = StubSuite;

const adapter = sketch.buildRealBenchmarkAdapter({ Benchmark: StubBenchmark, version: "2.1.4", suiteId: "renderer-shootout" });
if (!adapter || adapter.id !== "benchmarkjs-renderer-shootout-214") {
  console.error("FAIL: unexpected adapter id", adapter && adapter.id);
  process.exit(1);
}
if (adapter.isReal !== true || adapter.benchmarkType !== "benchmark.js") {
  console.error("FAIL: adapter metadata incorrect", adapter);
  process.exit(1);
}
for (const method of ["createBenchmark", "runProfile", "aggregateResults"]) {
  if (typeof adapter[method] !== "function") {
    console.error(`FAIL: adapter missing ${method}`);
    process.exit(1);
  }
}

let threwOnRunBeforeCreate = false;
try {
  await adapter.runProfile({ profileId: "x", fn: () => {} });
} catch (error) {
  threwOnRunBeforeCreate = true;
}
if (!threwOnRunBeforeCreate) {
  console.error("FAIL: runProfile should throw before createBenchmark");
  process.exit(1);
}

const suite = await adapter.createBenchmark({ name: "test-suite" });
if (!(suite instanceof StubSuite) || suite.name !== "test-suite") {
  console.error("FAIL: createBenchmark did not return Suite instance", suite);
  process.exit(1);
}

let threwOnMissingFn = false;
try {
  await adapter.runProfile({ profileId: "x" });
} catch (error) {
  threwOnMissingFn = true;
}
if (!threwOnMissingFn) {
  console.error("FAIL: runProfile should throw without fn");
  process.exit(1);
}

const sampleA = await adapter.runProfile({ profileId: "alpha", fn: async () => { for (let i = 0; i < 1000; i += 1) {} } });
const sampleB = await adapter.runProfile({ profileId: "beta", fn: async () => { for (let i = 0; i < 100; i += 1) {} } });
if (!Number.isFinite(sampleA.elapsedMs) || sampleA.profileId !== "alpha") {
  console.error("FAIL: sampleA shape invalid", sampleA);
  process.exit(1);
}
if (sampleB.profileId !== "beta") {
  console.error("FAIL: sampleB profileId wrong");
  process.exit(1);
}

const aggregate = await adapter.aggregateResults();
if (aggregate.profileCount !== 2 || !["alpha", "beta"].includes(aggregate.winner)) {
  console.error("FAIL: aggregate unexpected", aggregate);
  process.exit(1);
}

const stubLoader = async () => ({ Benchmark: StubBenchmark, module: { default: StubBenchmark } });
const registry = fakeWindow.__aiWebGpuLabBenchmarkRegistry;
const result = await sketch.connectRealBenchmark({ registry, loader: stubLoader, version: "2.1.4", suiteId: "renderer-shootout" });
if (!result.adapter.id.startsWith("benchmarkjs-")) {
  console.error("FAIL: connectRealBenchmark returned wrong adapter");
  process.exit(1);
}

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("benchmarkjs-")) {
  console.error("FAIL: stub describe should reflect connected real benchmark", stub);
  process.exit(1);
}

let threwOnMissingRegistry = false;
try {
  await sketch.connectRealBenchmark({ registry: null, loader: stubLoader });
} catch (error) {
  threwOnMissingRegistry = true;
}
if (!threwOnMissingRegistry) {
  console.error("FAIL: connectRealBenchmark should throw without registry");
  process.exit(1);
}

let threwOnNoBenchmark = false;
try {
  sketch.buildRealBenchmarkAdapter({ Benchmark: null });
} catch (error) {
  threwOnNoBenchmark = true;
}
if (!threwOnNoBenchmark) {
  console.error("FAIL: buildRealBenchmarkAdapter should throw without Benchmark");
  process.exit(1);
}

const emptyAggregate = await sketch.buildRealBenchmarkAdapter({ Benchmark: StubBenchmark }).aggregateResults();
if (emptyAggregate.profileCount !== 0 || emptyAggregate.winner !== null) {
  console.error("FAIL: empty aggregate shape wrong", emptyAggregate);
  process.exit(1);
}

console.log("OK real benchmark sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real benchmark sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-benchmark-sketch test passed"
