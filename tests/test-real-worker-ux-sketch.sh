#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/runtime-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/exp-llm-worker-ux/public/real-runtime-sketch.js"

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

for (const exportName of ["connectRealWorkerUx", "buildRealWorkerUxAdapter", "loadTransformersFromCdn"]) {
  if (typeof sketch[exportName] !== "function") { console.error(`FAIL: missing ${exportName}`); process.exit(1); }
}

const stubPipeline = async () => async () => [{ generated_text: "main mode reply" }];
const stubEnv = { allowRemoteModels: false };
const workerFactory = () => ({
  async run({ prompt, maxNewTokens }) {
    return { text: `worker mode reply for ${prompt.slice(0, 8)} budget=${maxNewTokens}` };
  }
});

// Main mode
const mainAdapter = sketch.buildRealWorkerUxAdapter({ pipeline: await stubPipeline(), env: stubEnv, version: "3.0.0", modelId: "Xenova/Phi-3-mini-4k-instruct-q4f16", mode: "main" });
if (!mainAdapter || !mainAdapter.id.includes("-main-") || mainAdapter.workerMode !== "main") { console.error("FAIL: main id", mainAdapter); process.exit(1); }
const mainPrefill = await mainAdapter.prefill(null, "hello main mode test");
const mainDecode = await mainAdapter.decode(await stubPipeline(), mainPrefill, 16);
if (mainDecode.mode !== "main" || !mainDecode.text.startsWith("main mode")) { console.error("FAIL: main decode", mainDecode); process.exit(1); }

// Worker mode
const workerAdapter = sketch.buildRealWorkerUxAdapter({ pipeline: await stubPipeline(), env: stubEnv, version: "3.0.0", modelId: "Xenova/Phi-3-mini-4k-instruct-q4f16", mode: "worker", workerFactory });
if (!workerAdapter || !workerAdapter.id.includes("-worker-") || workerAdapter.workerMode !== "worker") { console.error("FAIL: worker id", workerAdapter); process.exit(1); }
const worker = await workerAdapter.loadRuntime();
const wPrefill = await workerAdapter.prefill(null, "hello worker test");
const wDecode = await workerAdapter.decode(worker, wPrefill, 32);
if (wDecode.mode !== "worker" || !wDecode.text.startsWith("worker mode reply")) { console.error("FAIL: worker decode", wDecode); process.exit(1); }

let t1 = false;
try { sketch.buildRealWorkerUxAdapter({ pipeline: await stubPipeline(), env: stubEnv, mode: "bogus" }); } catch { t1 = true; }
if (!t1) { console.error("FAIL: bad mode"); process.exit(1); }

let t2 = false;
try { sketch.buildRealWorkerUxAdapter({ pipeline: await stubPipeline(), env: stubEnv, mode: "worker" }); } catch { t2 = true; }
if (!t2) { console.error("FAIL: worker mode without factory"); process.exit(1); }

const stubLoader = async () => ({ pipeline: await stubPipeline(), env: stubEnv });
const registry = fakeWindow.__aiWebGpuLabRuntimeRegistry;
const r = await sketch.connectRealWorkerUx({ registry, loader: stubLoader, version: "3.0.0", modelId: "Xenova/Phi-3-mini-4k-instruct-q4f16", mode: "main" });
if (!r.adapter.id.includes("-main-")) { console.error("FAIL: connect"); process.exit(1); }

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("worker-ux-")) { console.error("FAIL: describe", stub); process.exit(1); }

let t3 = false;
try { await sketch.connectRealWorkerUx({ registry: null, loader: stubLoader }); } catch { t3 = true; }
if (!t3) { console.error("FAIL: missing registry"); process.exit(1); }

let t4 = false;
try { sketch.buildRealWorkerUxAdapter({ pipeline: null, env: stubEnv, mode: "main" }); } catch { t4 = true; }
if (!t4) { console.error("FAIL: null pipeline"); process.exit(1); }

console.log("OK real worker-ux sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real worker-ux sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-worker-ux-sketch test passed"
