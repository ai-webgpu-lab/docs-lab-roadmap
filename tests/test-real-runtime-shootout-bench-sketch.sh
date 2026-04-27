#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/benchmark-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/p0/bench-runtime-shootout/public/real-benchmark-sketch.js"

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

for (const exportName of ["connectRealRuntimeShootoutBench", "buildRealRuntimeShootoutBenchAdapter", "loadBenchmarkAndRuntime"]) {
  if (typeof sketch[exportName] !== "function") { console.error(`FAIL: missing ${exportName}`); process.exit(1); }
}

class StubSuite {}
const StubBenchmark = function () {};
StubBenchmark.Suite = StubSuite;

const stubPipeline = async (_task, _model, _opts) => async () => [{ generated_text: "transformers reply" }];

const runtimeFactory = async (profile) => {
  if (profile.runtimeKind === "webllm") {
    return {
      chat: { completions: { create: async () => ({ choices: [{ message: { content: "webllm reply" } }] }) } }
    };
  }
  if (profile.runtimeKind === "ort") {
    return { run: async () => ({ text: "ort reply" }) };
  }
  if (profile.runtimeKind === "transformersjs") {
    return async () => [{ generated_text: "transformers reply" }];
  }
  throw new Error(`unsupported runtimeKind ${profile.runtimeKind}`);
};

const adapter = sketch.buildRealRuntimeShootoutBenchAdapter({ Benchmark: StubBenchmark, pipeline: stubPipeline, runtimeFactory, benchmarkVersion: "2.1.4", transformersVersion: "3.0.0" });
if (!adapter || !adapter.id.startsWith("bench-runtime-shootout-")) { console.error("FAIL: id", adapter); process.exit(1); }
if (adapter.benchmarkType !== "runtime-shootout") { console.error("FAIL: benchmarkType", adapter); process.exit(1); }

let t1 = false;
try { await adapter.runProfile({ profileId: "x", runtimeKind: "transformersjs", modelId: "m" }); } catch { t1 = true; }
if (!t1) { console.error("FAIL: run before create"); process.exit(1); }

await adapter.createBenchmark();

let t2 = false;
try { await adapter.runProfile({ profileId: "x", runtimeKind: "transformersjs" }); } catch { t2 = true; }
if (!t2) { console.error("FAIL: missing modelId"); process.exit(1); }

const tj = await adapter.runProfile({ profileId: "tj", runtimeKind: "transformersjs", modelId: "Xenova/Phi-3", outputTokens: 8 });
const wl = await adapter.runProfile({ profileId: "wl", runtimeKind: "webllm", modelId: "Llama-3", outputTokens: 8 });
const ort = await adapter.runProfile({ profileId: "ort", runtimeKind: "ort", modelId: "Xenova/Phi-3-onnx", outputTokens: 8 });

if (tj.runtimeKind !== "transformersjs" || wl.runtimeKind !== "webllm" || ort.runtimeKind !== "ort") {
  console.error("FAIL: runtime kinds", tj, wl, ort); process.exit(1);
}

const aggregate = await adapter.aggregateResults();
if (aggregate.profileCount !== 3 || !["tj", "wl", "ort"].includes(aggregate.winner)) { console.error("FAIL: aggregate", aggregate); process.exit(1); }

const stubLoader = async () => ({ Benchmark: StubBenchmark, transformers: {}, pipeline: stubPipeline });
const registry = fakeWindow.__aiWebGpuLabBenchmarkRegistry;
const r = await sketch.connectRealRuntimeShootoutBench({ registry, loader: stubLoader, runtimeFactory });
if (!r.adapter.id.startsWith("bench-runtime-shootout-")) { console.error("FAIL: connect"); process.exit(1); }

let t3 = false;
try { await sketch.connectRealRuntimeShootoutBench({ registry: null, loader: stubLoader }); } catch { t3 = true; }
if (!t3) { console.error("FAIL: missing registry"); process.exit(1); }

let t4 = false;
try { sketch.buildRealRuntimeShootoutBenchAdapter({ Benchmark: null, pipeline: stubPipeline }); } catch { t4 = true; }
if (!t4) { console.error("FAIL: null Benchmark"); process.exit(1); }

let t5 = false;
try { sketch.buildRealRuntimeShootoutBenchAdapter({ Benchmark: StubBenchmark, pipeline: null }); } catch { t5 = true; }
if (!t5) { console.error("FAIL: null pipeline"); process.exit(1); }

console.log("OK real runtime-shootout-bench sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real runtime-shootout-bench sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-runtime-shootout-bench-sketch test passed"
