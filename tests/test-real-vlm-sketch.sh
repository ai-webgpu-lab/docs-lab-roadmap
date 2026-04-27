#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/runtime-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/exp-vlm-browser-multimodal/public/real-runtime-sketch.js"

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

for (const exportName of ["connectRealVlm", "buildRealVlmAdapter", "loadVlmFromCdn"]) {
  if (typeof sketch[exportName] !== "function") { console.error(`FAIL: missing ${exportName}`); process.exit(1); }
}

const stubPipeline = async () => async () => [{ generated_text: "describes the image clearly" }];
const stubEnv = { allowRemoteModels: false };
const adapter = sketch.buildRealVlmAdapter({ pipeline: await stubPipeline(), env: stubEnv, version: "3.0.0", modelId: "Xenova/SmolVLM-Instruct" });
if (!adapter || !adapter.id.startsWith("vlm-")) { console.error("FAIL: id", adapter); process.exit(1); }
for (const m of ["loadRuntime", "prefill", "decode"]) {
  if (typeof adapter[m] !== "function") { console.error(`FAIL: missing ${m}`); process.exit(1); }
}

const prefill = await adapter.prefill(null, { question: "What is in the image?", image: { width: 256, height: 256 } });
if (prefill.promptTokens !== 5 || !prefill.image) { console.error("FAIL: prefill", prefill); process.exit(1); }

const decode = await adapter.decode(await stubPipeline(), prefill, 16);
if (!Number.isFinite(decode.tokens) || decode.tokens <= 0 || decode.text.length === 0) { console.error("FAIL: decode", decode); process.exit(1); }

let t1 = false;
const fresh = sketch.buildRealVlmAdapter({ pipeline: await stubPipeline(), env: stubEnv, version: "3.0.0", modelId: "Xenova/SmolVLM-Instruct" });
try { await fresh.decode(null, prefill, 16); } catch { t1 = true; }
if (!t1) { console.error("FAIL: decode without runtime"); process.exit(1); }

const stubLoader = async () => ({ pipeline: await stubPipeline(), env: stubEnv });
const registry = fakeWindow.__aiWebGpuLabRuntimeRegistry;
const r = await sketch.connectRealVlm({ registry, loader: stubLoader, version: "3.0.0", modelId: "Xenova/SmolVLM-Instruct" });
if (!r.adapter.id.startsWith("vlm-")) { console.error("FAIL: connect"); process.exit(1); }

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("vlm-")) { console.error("FAIL: describe", stub); process.exit(1); }

let t2 = false;
try { await sketch.connectRealVlm({ registry: null, loader: stubLoader }); } catch { t2 = true; }
if (!t2) { console.error("FAIL: missing registry"); process.exit(1); }

let t3 = false;
try { sketch.buildRealVlmAdapter({ pipeline: null }); } catch { t3 = true; }
if (!t3) { console.error("FAIL: null pipeline"); process.exit(1); }

console.log("OK real vlm sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real vlm sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-vlm-sketch test passed"
