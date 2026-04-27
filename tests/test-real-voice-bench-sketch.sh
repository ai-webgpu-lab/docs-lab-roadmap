#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/benchmark-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/bench-voice-roundtrip/public/real-benchmark-sketch.js"

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

for (const exportName of ["connectRealVoiceRoundtripBench", "buildRealVoiceRoundtripBenchAdapter", "loadBenchmarkAndRuntime"]) {
  if (typeof sketch[exportName] !== "function") { console.error(`FAIL: missing ${exportName}`); process.exit(1); }
}

class StubSuite {}
const StubBenchmark = function () {};
StubBenchmark.Suite = StubSuite;

let sttCalls = 0;
let replyCalls = 0;
const stubPipeline = async (task, _model, _opts) => {
  if (task === "automatic-speech-recognition") {
    return async (_audio, _options) => { sttCalls += 1; return { text: "open the lab" }; };
  }
  if (task === "text-generation") {
    return async (_prompt, _options) => { replyCalls += 1; return [{ generated_text: "Sure, opening lab" }]; };
  }
  throw new Error(`unknown task ${task}`);
};

const adapter = sketch.buildRealVoiceRoundtripBenchAdapter({ Benchmark: StubBenchmark, pipeline: stubPipeline, benchmarkVersion: "2.1.4", transformersVersion: "3.0.0" });
if (!adapter || !adapter.id.startsWith("bench-voice-")) { console.error("FAIL: id", adapter); process.exit(1); }
if (adapter.benchmarkType !== "voice-roundtrip") { console.error("FAIL: benchmarkType", adapter); process.exit(1); }

let t1 = false;
try { await adapter.runProfile({ profileId: "x", sttModelId: "s", replyModelId: "r" }); } catch { t1 = true; }
if (!t1) { console.error("FAIL: run before create"); process.exit(1); }

await adapter.createBenchmark();
const audio = new Float32Array(16000);
const sample = await adapter.runProfile({ profileId: "tiny", sttModelId: "Xenova/whisper-tiny", replyModelId: "Xenova/Phi-3", audio, intent: "open-lab" });
if (sample.transcript !== "open the lab" || !sample.text.startsWith("Sure")) { console.error("FAIL: sample", sample); process.exit(1); }
if (sttCalls !== 1 || replyCalls !== 1) { console.error("FAIL: counts", sttCalls, replyCalls); process.exit(1); }

const aggregate = await adapter.aggregateResults();
if (aggregate.profileCount !== 1 || aggregate.winner !== "tiny") { console.error("FAIL: aggregate", aggregate); process.exit(1); }

const stubLoader = async () => ({ Benchmark: StubBenchmark, transformers: {}, pipeline: stubPipeline });
const registry = fakeWindow.__aiWebGpuLabBenchmarkRegistry;
const r = await sketch.connectRealVoiceRoundtripBench({ registry, loader: stubLoader });
if (!r.adapter.id.startsWith("bench-voice-")) { console.error("FAIL: connect"); process.exit(1); }

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("bench-voice-")) { console.error("FAIL: describe", stub); process.exit(1); }

let t2 = false;
try { await sketch.connectRealVoiceRoundtripBench({ registry: null, loader: stubLoader }); } catch { t2 = true; }
if (!t2) { console.error("FAIL: missing registry"); process.exit(1); }

console.log("OK real voice-bench sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real voice-bench sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-voice-bench-sketch test passed"
