#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/p0/bench-runtime-shootout/public/runtime-adapter.js"

DRIVER="${TMP_DIR}/driver.mjs"
cat >"${DRIVER}" <<'EOF'
import { pathToFileURL } from "node:url";

const adapterPath = process.argv[2];

const fakeWindow = {};
globalThis.window = fakeWindow;
globalThis.URLSearchParams = URLSearchParams;

await import(pathToFileURL(adapterPath).href);

const registry = fakeWindow.__aiWebGpuLabRuntimeRegistry;
if (!registry) {
  console.error("FAIL: registry was not attached to window");
  process.exit(1);
}

const stubBefore = registry.describe("adapter-stub");
if (stubBefore.status !== "not-connected") {
  console.error("FAIL: expected not-connected, got", stubBefore.status);
  process.exit(1);
}
if (stubBefore.isReal !== false) {
  console.error("FAIL: expected isReal=false on stub");
  process.exit(1);
}

let threw = false;
try {
  registry.register({ id: "incomplete" });
} catch (error) {
  threw = true;
}
if (!threw) {
  console.error("FAIL: registering incomplete adapter should throw");
  process.exit(1);
}

const fakeAdapter = {
  id: "fake-runtime",
  label: "Fake Runtime",
  version: "0.0.1",
  capabilities: ["prefill", "decode"],
  loadType: "async",
  async loadRuntime() { return {}; },
  async prefill() { return { promptTokens: 0, prefillMs: 0 }; },
  async decode() { return { tokens: 0, decodeMs: 0 }; }
};
const id = registry.register(fakeAdapter);
if (id !== "fake-runtime") {
  console.error("FAIL: register did not return adapter id");
  process.exit(1);
}

const stubAfter = registry.describe("adapter-stub");
if (stubAfter.status !== "connected") {
  console.error("FAIL: expected connected after register, got", stubAfter.status);
  process.exit(1);
}
if (stubAfter.id !== "fake-runtime") {
  console.error("FAIL: stub describe should return registered adapter id");
  process.exit(1);
}
if (stubAfter.isReal !== true) {
  console.error("FAIL: connected stub should report isReal=true");
  process.exit(1);
}

const det = registry.describe("webgpu");
if (det.status !== "deterministic") {
  console.error("FAIL: webgpu mode should report deterministic");
  process.exit(1);
}

const list = registry.list();
if (!Array.isArray(list) || list.length !== 1 || list[0].id !== "fake-runtime") {
  console.error("FAIL: list() should return registered adapters");
  process.exit(1);
}

console.log("OK adapter registry contract");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" 2>&1)"
echo "${OUTPUT}"

if [[ "${OUTPUT}" != *"OK adapter registry contract"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "runtime-adapter-contract test passed"
