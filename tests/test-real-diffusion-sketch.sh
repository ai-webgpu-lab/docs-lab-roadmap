#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/runtime-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/exp-diffusion-webgpu-browser/public/real-runtime-sketch.js"

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

for (const exportName of ["connectRealDiffusion", "buildRealDiffusionAdapter", "loadDiffuserFromCdn"]) {
  if (typeof sketch[exportName] !== "function") {
    console.error(`FAIL: missing export ${exportName}`);
    process.exit(1);
  }
}

const stubImage = { width: 256, height: 256 };
const stubPipeline = async () => async () => [stubImage];
const stubEnv = { allowRemoteModels: false };

const adapter = sketch.buildRealDiffusionAdapter({
  pipeline: await stubPipeline(),
  env: stubEnv,
  version: "3.0.0",
  modelId: "Xenova/sd-turbo"
});
if (!adapter || !adapter.id.startsWith("diffusion-")) {
  console.error("FAIL: unexpected adapter id", adapter && adapter.id);
  process.exit(1);
}
for (const method of ["loadRuntime", "prefill", "decode"]) {
  if (typeof adapter[method] !== "function") {
    console.error(`FAIL: adapter missing ${method}`);
    process.exit(1);
  }
}

const prefillResult = await adapter.prefill(null, "a serene blackhole observatory");
if (prefillResult.promptTokens !== 4) {
  console.error("FAIL: prefill metadata wrong", prefillResult);
  process.exit(1);
}

const decodeResult = await adapter.decode(await stubPipeline(), prefillResult, 4);
if (decodeResult.widthPx !== 256 || decodeResult.heightPx !== 256) {
  console.error("FAIL: decode image dimensions unexpected", decodeResult);
  process.exit(1);
}
if (decodeResult.tokens !== 4) {
  console.error("FAIL: decode tokens unexpected", decodeResult);
  process.exit(1);
}

let threwOnNoRuntime = false;
const fresh = sketch.buildRealDiffusionAdapter({
  pipeline: await stubPipeline(),
  env: stubEnv,
  version: "3.0.0",
  modelId: "Xenova/sd-turbo"
});
try { await fresh.decode(null, prefillResult, 4); } catch (error) { threwOnNoRuntime = true; }
if (!threwOnNoRuntime) {
  console.error("FAIL: decode should throw without active runtime");
  process.exit(1);
}

const stubLoader = async () => ({ pipeline: await stubPipeline(), env: stubEnv });
const registry = fakeWindow.__aiWebGpuLabRuntimeRegistry;
const result = await sketch.connectRealDiffusion({ registry, loader: stubLoader, version: "3.0.0", modelId: "Xenova/sd-turbo" });
if (!result.adapter.id.startsWith("diffusion-")) {
  console.error("FAIL: connectRealDiffusion returned wrong adapter");
  process.exit(1);
}

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("diffusion-")) {
  console.error("FAIL: stub describe should reflect connected diffusion", stub);
  process.exit(1);
}

let threwOnMissingRegistry = false;
try { await sketch.connectRealDiffusion({ registry: null, loader: stubLoader }); } catch (error) { threwOnMissingRegistry = true; }
if (!threwOnMissingRegistry) { console.error("FAIL: connectRealDiffusion should throw without registry"); process.exit(1); }

let threwOnBadPipeline = false;
try { sketch.buildRealDiffusionAdapter({ pipeline: null }); } catch (error) { threwOnBadPipeline = true; }
if (!threwOnBadPipeline) { console.error("FAIL: buildRealDiffusionAdapter should throw without pipeline"); process.exit(1); }

console.log("OK real diffusion sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real diffusion sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-diffusion-sketch test passed"
