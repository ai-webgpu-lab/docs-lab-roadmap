#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/runtime-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/exp-webllm-browser-chat/public/real-runtime-sketch.js"

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

for (const exportName of ["connectRealWebLLM", "buildRealWebLLMAdapter", "loadWebLLMFromCdn"]) {
  if (typeof sketch[exportName] !== "function") { console.error(`FAIL: missing ${exportName}`); process.exit(1); }
}

const stubEngine = {
  chat: {
    completions: {
      create: async () => ({ choices: [{ message: { content: "stubbed reply text" } }] })
    }
  }
};
const stubCreate = async () => stubEngine;

const adapter = sketch.buildRealWebLLMAdapter({ CreateMLCEngine: stubCreate, version: "0.2.78", modelId: "Llama-3.2-1B-Instruct-q4f16_1-MLC" });
if (!adapter || !adapter.id.startsWith("webllm-")) { console.error("FAIL: id", adapter); process.exit(1); }
for (const m of ["loadRuntime", "prefill", "decode"]) {
  if (typeof adapter[m] !== "function") { console.error(`FAIL: missing ${m}`); process.exit(1); }
}

await adapter.loadRuntime();
const prefill = await adapter.prefill(null, "what is alpha");
if (prefill.promptTokens !== 3) { console.error("FAIL: prefill", prefill); process.exit(1); }

const decode = await adapter.decode(stubEngine, prefill, 16);
if (decode.tokens !== 3 || !decode.text.startsWith("stubbed")) { console.error("FAIL: decode", decode); process.exit(1); }

let t1 = false;
const fresh = sketch.buildRealWebLLMAdapter({ CreateMLCEngine: stubCreate, version: "0.2.78", modelId: "Llama-3.2-1B-Instruct-q4f16_1-MLC" });
try { await fresh.decode(null, prefill, 16); } catch { t1 = true; }
if (!t1) { console.error("FAIL: decode without runtime"); process.exit(1); }

const stubLoader = async () => ({ webllm: {}, CreateMLCEngine: stubCreate });
const registry = fakeWindow.__aiWebGpuLabRuntimeRegistry;
const r = await sketch.connectRealWebLLM({ registry, loader: stubLoader, version: "0.2.78", modelId: "Llama-3.2-1B-Instruct-q4f16_1-MLC" });
if (!r.adapter.id.startsWith("webllm-")) { console.error("FAIL: connect"); process.exit(1); }

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("webllm-")) { console.error("FAIL: describe", stub); process.exit(1); }

let t2 = false;
try { await sketch.connectRealWebLLM({ registry: null, loader: stubLoader }); } catch { t2 = true; }
if (!t2) { console.error("FAIL: missing registry"); process.exit(1); }

let t3 = false;
try { sketch.buildRealWebLLMAdapter({ CreateMLCEngine: null }); } catch { t3 = true; }
if (!t3) { console.error("FAIL: null CreateMLCEngine"); process.exit(1); }

console.log("OK real webllm sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real webllm sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-webllm-sketch test passed"
