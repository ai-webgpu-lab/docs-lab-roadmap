#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/repos/app-blackhole-observatory/public/app-surface-adapter.js"

DRIVER="${TMP_DIR}/driver.mjs"
cat >"${DRIVER}" <<'EOF'
import { pathToFileURL } from "node:url";

const adapterPath = process.argv[2];
const fakeWindow = {};
globalThis.window = fakeWindow;
globalThis.URLSearchParams = URLSearchParams;

await import(pathToFileURL(adapterPath).href);

const registry = fakeWindow.__aiWebGpuLabAppSurfaceRegistry;
if (!registry) {
  console.error("FAIL: app surface registry not attached to window");
  process.exit(1);
}

const stubBefore = registry.describe("adapter-stub");
if (stubBefore.status !== "not-connected" || stubBefore.isReal !== false) {
  console.error("FAIL: expected not-connected stub, got", stubBefore);
  process.exit(1);
}

let threw = false;
try { registry.register({ id: "incomplete" }); } catch (error) { threw = true; }
if (!threw) { console.error("FAIL: incomplete adapter should throw"); process.exit(1); }

const fakeAdapter = {
  id: "fake-observatory",
  label: "Fake Observatory",
  version: "0.0.1",
  capabilities: ["preset-replay", "telemetry-record"],
  surfaceType: "production",
  async loadDataset() { return {}; },
  async renderSurface() { return {}; },
  async recordTelemetry() { return {}; }
};

const id = registry.register(fakeAdapter);
if (id !== "fake-observatory") { console.error("FAIL: register did not return id"); process.exit(1); }

const stubAfter = registry.describe("adapter-stub");
if (stubAfter.status !== "connected" || stubAfter.id !== "fake-observatory") {
  console.error("FAIL: expected connected after register, got", stubAfter);
  process.exit(1);
}

const det = registry.describe("default");
if (det.status !== "deterministic") { console.error("FAIL: default mode should be deterministic"); process.exit(1); }

const list = registry.list();
if (list.length !== 1 || list[0].surfaceType !== "production") {
  console.error("FAIL: list should reflect registered adapter", list);
  process.exit(1);
}

console.log("OK app surface adapter registry contract");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK app surface adapter registry contract"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "app-surface-adapter-contract test passed"
