#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/runtime-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/p0/exp-stt-whisper-webgpu/public/real-runtime-sketch.js"

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

for (const exportName of ["connectRealWhisper", "buildRealWhisperAdapter", "loadWhisperFromCdn"]) {
  if (typeof sketch[exportName] !== "function") {
    console.error(`FAIL: missing export ${exportName}`);
    process.exit(1);
  }
}

const stubPipeline = async () => async () => ({ text: "alpha beta gamma delta echo" });
const stubEnv = { allowRemoteModels: false };

const adapter = sketch.buildRealWhisperAdapter({
  pipeline: await stubPipeline(),
  env: stubEnv,
  version: "3.0.0",
  modelId: "Xenova/whisper-tiny"
});

if (!adapter || !adapter.id.startsWith("whisper-")) {
  console.error("FAIL: unexpected adapter id", adapter && adapter.id);
  process.exit(1);
}
if (adapter.isReal !== true || adapter.backendHint !== "webgpu") {
  console.error("FAIL: adapter metadata incorrect", adapter);
  process.exit(1);
}
for (const method of ["loadRuntime", "prefill", "decode"]) {
  if (typeof adapter[method] !== "function") {
    console.error(`FAIL: adapter missing ${method}`);
    process.exit(1);
  }
}

const audioBuf = new Float32Array(16000);
const prefillResult = await adapter.prefill(null, audioBuf);
if (prefillResult.promptTokens !== audioBuf.length) {
  console.error("FAIL: prefill should report sample count", prefillResult);
  process.exit(1);
}

const decodeResult = await adapter.decode(await stubPipeline(), prefillResult, 32);
if (!Number.isFinite(decodeResult.tokens) || decodeResult.tokens <= 0) {
  console.error("FAIL: decode tokens not positive", decodeResult);
  process.exit(1);
}
if (typeof decodeResult.text !== "string" || decodeResult.text.length === 0) {
  console.error("FAIL: decode text empty", decodeResult);
  process.exit(1);
}

let threwOnNoRuntime = false;
const adapterNoRuntime = sketch.buildRealWhisperAdapter({
  pipeline: await stubPipeline(),
  env: stubEnv,
  version: "3.0.0",
  modelId: "Xenova/whisper-tiny"
});
try {
  await adapterNoRuntime.decode(null, prefillResult, 32);
} catch (error) {
  threwOnNoRuntime = true;
}
if (!threwOnNoRuntime) {
  console.error("FAIL: decode should throw without active runtime");
  process.exit(1);
}

const stubLoader = async () => ({ pipeline: await stubPipeline(), env: stubEnv });
const registry = fakeWindow.__aiWebGpuLabRuntimeRegistry;
const result = await sketch.connectRealWhisper({ registry, loader: stubLoader, version: "3.0.0", modelId: "Xenova/whisper-tiny" });
if (!result.adapter.id.startsWith("whisper-")) {
  console.error("FAIL: connectRealWhisper returned wrong adapter");
  process.exit(1);
}

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("whisper-")) {
  console.error("FAIL: stub describe should reflect connected whisper", stub);
  process.exit(1);
}

let threwOnMissingRegistry = false;
try {
  await sketch.connectRealWhisper({ registry: null, loader: stubLoader });
} catch (error) {
  threwOnMissingRegistry = true;
}
if (!threwOnMissingRegistry) {
  console.error("FAIL: connectRealWhisper should throw without registry");
  process.exit(1);
}

let threwOnBadPipeline = false;
try {
  sketch.buildRealWhisperAdapter({ pipeline: null });
} catch (error) {
  threwOnBadPipeline = true;
}
if (!threwOnBadPipeline) {
  console.error("FAIL: buildRealWhisperAdapter should throw without pipeline");
  process.exit(1);
}

console.log("OK real whisper sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real whisper sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-whisper-sketch test passed"
