#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/runtime-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/p0/exp-embeddings-browser-throughput/public/real-runtime-sketch.js"

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

for (const exportName of ["connectRealEmbedding", "buildRealEmbeddingAdapter", "loadEmbedderFromCdn"]) {
  if (typeof sketch[exportName] !== "function") {
    console.error(`FAIL: missing export ${exportName}`);
    process.exit(1);
  }
}

const stubVector = { dims: [1, 384] };
const stubPipeline = async () => async () => stubVector;
const stubEnv = { allowRemoteModels: false };

const adapter = sketch.buildRealEmbeddingAdapter({
  pipeline: await stubPipeline(),
  env: stubEnv,
  version: "3.0.0",
  modelId: "Xenova/bge-small-en-v1.5"
});
if (!adapter || !adapter.id.startsWith("embeddings-")) {
  console.error("FAIL: unexpected adapter id", adapter && adapter.id);
  process.exit(1);
}
for (const method of ["loadRuntime", "prefill", "decode"]) {
  if (typeof adapter[method] !== "function") {
    console.error(`FAIL: adapter missing ${method}`);
    process.exit(1);
  }
}

const prefillResult = await adapter.prefill(null, "embedding test prompt");
if (prefillResult.promptTokens !== 3 || prefillResult.text !== "embedding test prompt") {
  console.error("FAIL: prefill metadata wrong", prefillResult);
  process.exit(1);
}

const decodeResult = await adapter.decode(await stubPipeline(), prefillResult, 1);
if (decodeResult.dimensions !== 384) {
  console.error("FAIL: decode dimensions unexpected", decodeResult);
  process.exit(1);
}
if (!Number.isFinite(decodeResult.decodeMs)) {
  console.error("FAIL: decodeMs invalid", decodeResult);
  process.exit(1);
}

let threwOnNoRuntime = false;
const fresh = sketch.buildRealEmbeddingAdapter({
  pipeline: await stubPipeline(),
  env: stubEnv,
  version: "3.0.0",
  modelId: "Xenova/bge-small-en-v1.5"
});
try { await fresh.decode(null, prefillResult, 1); } catch (error) { threwOnNoRuntime = true; }
if (!threwOnNoRuntime) {
  console.error("FAIL: decode should throw without active runtime");
  process.exit(1);
}

const stubLoader = async () => ({ pipeline: await stubPipeline(), env: stubEnv });
const registry = fakeWindow.__aiWebGpuLabRuntimeRegistry;
const result = await sketch.connectRealEmbedding({ registry, loader: stubLoader, version: "3.0.0", modelId: "Xenova/bge-small-en-v1.5" });
if (!result.adapter.id.startsWith("embeddings-")) {
  console.error("FAIL: connectRealEmbedding returned wrong adapter");
  process.exit(1);
}

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("embeddings-")) {
  console.error("FAIL: stub describe should reflect connected embeddings", stub);
  process.exit(1);
}

let threwOnMissingRegistry = false;
try { await sketch.connectRealEmbedding({ registry: null, loader: stubLoader }); } catch (error) { threwOnMissingRegistry = true; }
if (!threwOnMissingRegistry) { console.error("FAIL: connectRealEmbedding should throw without registry"); process.exit(1); }

let threwOnBadPipeline = false;
try { sketch.buildRealEmbeddingAdapter({ pipeline: null }); } catch (error) { threwOnBadPipeline = true; }
if (!threwOnBadPipeline) { console.error("FAIL: buildRealEmbeddingAdapter should throw without pipeline"); process.exit(1); }

console.log("OK real embeddings sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real embeddings sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-embeddings-sketch test passed"
