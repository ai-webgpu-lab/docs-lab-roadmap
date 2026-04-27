#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/runtime-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/exp-ort-webgpu-baseline/public/real-runtime-sketch.js"

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

for (const exportName of ["connectRealOrt", "buildRealOrtAdapter", "loadOrtFromCdn"]) {
  if (typeof sketch[exportName] !== "function") { console.error(`FAIL: missing ${exportName}`); process.exit(1); }
}

const stubSession = { run: async () => ({ logits: { dims: [1, 384], data: new Float32Array(384) } }) };
const StubInferenceSession = { create: async () => stubSession };
const StubTensor = class {};

const adapter = sketch.buildRealOrtAdapter({ ort: { InferenceSession: StubInferenceSession }, InferenceSession: StubInferenceSession, Tensor: StubTensor, version: "1.20.0", modelUrl: "https://example/model.onnx" });
if (!adapter || !adapter.id.startsWith("ort-webgpu-")) { console.error("FAIL: id", adapter); process.exit(1); }
for (const m of ["loadRuntime", "prefill", "decode"]) {
  if (typeof adapter[m] !== "function") { console.error(`FAIL: missing ${m}`); process.exit(1); }
}

await adapter.loadRuntime();
const prefill = await adapter.prefill(null, { tokens: 12, inputs: { ids: { data: new Int32Array(12) } } });
if (prefill.promptTokens !== 12) { console.error("FAIL: prefill", prefill); process.exit(1); }

const decode = await adapter.decode(stubSession, prefill, 1);
if (decode.outputCount !== 1 || decode.dimensions !== 384) { console.error("FAIL: decode", decode); process.exit(1); }

let t1 = false;
const fresh = sketch.buildRealOrtAdapter({ ort: { InferenceSession: StubInferenceSession }, InferenceSession: StubInferenceSession, Tensor: StubTensor, version: "1.20.0" });
try { await fresh.decode(null, prefill, 1); } catch { t1 = true; }
if (!t1) { console.error("FAIL: decode without runtime"); process.exit(1); }

const stubLoader = async () => ({ ort: { InferenceSession: StubInferenceSession }, InferenceSession: StubInferenceSession, Tensor: StubTensor });
const registry = fakeWindow.__aiWebGpuLabRuntimeRegistry;
const r = await sketch.connectRealOrt({ registry, loader: stubLoader, version: "1.20.0" });
if (!r.adapter.id.startsWith("ort-webgpu-")) { console.error("FAIL: connect"); process.exit(1); }

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("ort-webgpu-")) { console.error("FAIL: describe", stub); process.exit(1); }

let t2 = false;
try { await sketch.connectRealOrt({ registry: null, loader: stubLoader }); } catch { t2 = true; }
if (!t2) { console.error("FAIL: missing registry"); process.exit(1); }

let t3 = false;
try { sketch.buildRealOrtAdapter({ InferenceSession: null }); } catch { t3 = true; }
if (!t3) { console.error("FAIL: null InferenceSession"); process.exit(1); }

console.log("OK real ort sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real ort sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-ort-sketch test passed"
