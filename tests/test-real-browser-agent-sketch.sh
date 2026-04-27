#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/runtime-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/exp-browser-agent-local/public/real-runtime-sketch.js"

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

for (const exportName of ["connectRealBrowserAgent", "buildRealBrowserAgentAdapter", "loadAgentFromCdn"]) {
  if (typeof sketch[exportName] !== "function") { console.error(`FAIL: missing ${exportName}`); process.exit(1); }
}

const stubPipeline = async () => async () => [{ generated_text: "Step 1\nStep 2\nStep 3" }];
const stubEnv = { allowRemoteModels: false };

const adapter = sketch.buildRealBrowserAgentAdapter({ pipeline: await stubPipeline(), env: stubEnv, version: "3.0.0", modelId: "Xenova/Phi-3-mini-4k-instruct-q4f16" });
if (!adapter || !adapter.id.startsWith("browser-agent-")) { console.error("FAIL: id", adapter); process.exit(1); }
for (const m of ["loadRuntime", "prefill", "decode"]) {
  if (typeof adapter[m] !== "function") { console.error(`FAIL: missing ${m}`); process.exit(1); }
}

const prefill = await adapter.prefill(null, { task: "Search and summarize", tools: ["search", "summarize"] });
if (prefill.promptTokens !== 3 || prefill.tools.length !== 2) { console.error("FAIL: prefill", prefill); process.exit(1); }

const decode = await adapter.decode(await stubPipeline(), prefill, 32);
if (decode.stepCount !== 3 || decode.tokens <= 0) { console.error("FAIL: decode", decode); process.exit(1); }

let t1 = false;
const fresh = sketch.buildRealBrowserAgentAdapter({ pipeline: await stubPipeline(), env: stubEnv, version: "3.0.0", modelId: "Xenova/Phi-3-mini-4k-instruct-q4f16" });
try { await fresh.decode(null, prefill, 32); } catch { t1 = true; }
if (!t1) { console.error("FAIL: decode without runtime"); process.exit(1); }

const stubLoader = async () => ({ pipeline: await stubPipeline(), env: stubEnv });
const registry = fakeWindow.__aiWebGpuLabRuntimeRegistry;
const r = await sketch.connectRealBrowserAgent({ registry, loader: stubLoader, version: "3.0.0", modelId: "Xenova/Phi-3-mini-4k-instruct-q4f16" });
if (!r.adapter.id.startsWith("browser-agent-")) { console.error("FAIL: connect"); process.exit(1); }

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("browser-agent-")) { console.error("FAIL: describe", stub); process.exit(1); }

let t2 = false;
try { await sketch.connectRealBrowserAgent({ registry: null, loader: stubLoader }); } catch { t2 = true; }
if (!t2) { console.error("FAIL: missing registry"); process.exit(1); }

let t3 = false;
try { sketch.buildRealBrowserAgentAdapter({ pipeline: null }); } catch { t3 = true; }
if (!t3) { console.error("FAIL: null pipeline"); process.exit(1); }

console.log("OK real browser-agent sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real browser-agent sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-browser-agent-sketch test passed"
