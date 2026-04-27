#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/runtime-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/exp-voice-assistant-local/public/real-runtime-sketch.js"

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

for (const exportName of ["connectRealVoiceAssistant", "buildRealVoiceAssistantAdapter", "loadVoiceFromCdn"]) {
  if (typeof sketch[exportName] !== "function") { console.error(`FAIL: missing ${exportName}`); process.exit(1); }
}

let sttCalls = 0;
let replyCalls = 0;
const stubStt = async () => { sttCalls += 1; return { text: "open the lab" }; };
const stubReply = async () => { replyCalls += 1; return [{ generated_text: "Sure, opening lab now." }]; };
const pipelineFactory = async (task) => {
  if (task === "automatic-speech-recognition") return stubStt;
  if (task === "text-generation") return stubReply;
  throw new Error(`unknown task ${task}`);
};
const stubEnv = { allowRemoteModels: false };
const stubLoader = async () => ({ pipeline: pipelineFactory, env: stubEnv });

const adapter = sketch.buildRealVoiceAssistantAdapter({ pipeline: pipelineFactory, env: stubEnv, version: "3.0.0" });
if (!adapter || !adapter.id.startsWith("voice-assistant-")) { console.error("FAIL: id", adapter); process.exit(1); }
for (const m of ["loadRuntime", "prefill", "decode"]) {
  if (typeof adapter[m] !== "function") { console.error(`FAIL: missing ${m}`); process.exit(1); }
}

const runtime = await adapter.loadRuntime();
if (!runtime.stt || !runtime.reply) { console.error("FAIL: loadRuntime", runtime); process.exit(1); }

const audioBuf = new Float32Array(16000);
const prefill = await adapter.prefill(null, { audio: audioBuf, intent: "open-lab" });
if (prefill.promptTokens !== audioBuf.length || prefill.intent !== "open-lab") { console.error("FAIL: prefill", prefill); process.exit(1); }

const decode = await adapter.decode(runtime, prefill, 32);
if (decode.transcript !== "open the lab" || !decode.text.startsWith("Sure")) { console.error("FAIL: decode", decode); process.exit(1); }
if (sttCalls !== 1 || replyCalls !== 1) { console.error("FAIL: pipelines invoked unexpected counts", sttCalls, replyCalls); process.exit(1); }

let t1 = false;
const fresh = sketch.buildRealVoiceAssistantAdapter({ pipeline: pipelineFactory, env: stubEnv, version: "3.0.0" });
try { await fresh.decode(null, prefill, 32); } catch { t1 = true; }
if (!t1) { console.error("FAIL: decode without runtime"); process.exit(1); }

const registry = fakeWindow.__aiWebGpuLabRuntimeRegistry;
const r = await sketch.connectRealVoiceAssistant({ registry, loader: stubLoader, version: "3.0.0" });
if (!r.adapter.id.startsWith("voice-assistant-")) { console.error("FAIL: connect"); process.exit(1); }

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("voice-assistant-")) { console.error("FAIL: describe", stub); process.exit(1); }

let t2 = false;
try { await sketch.connectRealVoiceAssistant({ registry: null, loader: stubLoader }); } catch { t2 = true; }
if (!t2) { console.error("FAIL: missing registry"); process.exit(1); }

let t3 = false;
try { sketch.buildRealVoiceAssistantAdapter({ pipeline: null }); } catch { t3 = true; }
if (!t3) { console.error("FAIL: null pipeline"); process.exit(1); }

console.log("OK real voice-assistant sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real voice-assistant sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-voice-assistant-sketch test passed"
