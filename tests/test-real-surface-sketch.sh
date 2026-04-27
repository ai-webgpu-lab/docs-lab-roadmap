#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/repos/app-blackhole-observatory/public/app-surface-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/app-blackhole-observatory/public/real-surface-sketch.js"

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

for (const exportName of ["connectRealSurface", "buildRealSurfaceAdapter", "loadDatasetManifest"]) {
  if (typeof sketch[exportName] !== "function") {
    console.error(`FAIL: missing export ${exportName}`);
    process.exit(1);
  }
}

const stubManifest = {
  id: "observatory-test",
  label: "Test Observatory",
  version: "0.9.0",
  presets: [
    { id: "p1", label: "Preset One", background: "#000", accent: "#fff" },
    { id: "p2", label: "Preset Two", background: "#111", accent: "#888" }
  ]
};
const stubLoader = async () => stubManifest;
const sink = { items: [], push(x) { this.items.push(x); } };

const adapter = sketch.buildRealSurfaceAdapter({ manifest: stubManifest, telemetrySink: sink });
if (!adapter || adapter.id !== "observatory-observatory-test-0.9.0") {
  console.error("FAIL: unexpected adapter id", adapter && adapter.id);
  process.exit(1);
}
if (adapter.isReal !== true || adapter.surfaceType !== "real-manifest") {
  console.error("FAIL: adapter metadata incorrect", adapter);
  process.exit(1);
}
for (const method of ["loadDataset", "renderSurface", "recordTelemetry"]) {
  if (typeof adapter[method] !== "function") {
    console.error(`FAIL: adapter missing ${method}`);
    process.exit(1);
  }
}

let threwOnNoLoad = false;
try {
  await adapter.renderSurface({ frameIndex: 0 });
} catch (error) {
  threwOnNoLoad = true;
}
if (!threwOnNoLoad) {
  console.error("FAIL: renderSurface should throw before loadDataset");
  process.exit(1);
}

const loaded = await adapter.loadDataset({ presetId: "p2" });
if (!loaded || !loaded.preset || loaded.preset.id !== "p2") {
  console.error("FAIL: loadDataset returned wrong preset", loaded);
  process.exit(1);
}

let threwOnBadPreset = false;
try {
  await adapter.loadDataset({ presetId: "missing" });
} catch (error) {
  threwOnBadPreset = true;
}
if (!threwOnBadPreset) {
  console.error("FAIL: loadDataset should throw on unknown preset");
  process.exit(1);
}

await adapter.loadDataset({ presetId: "p1" });
const rendered = await adapter.renderSurface({ frameIndex: 7 });
if (rendered.frameIndex !== 7 || rendered.presetId !== "p1") {
  console.error("FAIL: renderSurface returned wrong metadata", rendered);
  process.exit(1);
}

const telemetry = await adapter.recordTelemetry({ kind: "frame", value: 42 });
if (telemetry.kind !== "frame" || telemetry.value !== 42 || telemetry.manifestId !== "observatory-test") {
  console.error("FAIL: recordTelemetry did not enrich entry", telemetry);
  process.exit(1);
}
if (sink.items.length !== 1) {
  console.error("FAIL: telemetry sink not invoked", sink.items);
  process.exit(1);
}

const inspection = adapter.inspect();
if (!inspection.loadedDataset || inspection.telemetryRecords.length !== 1) {
  console.error("FAIL: inspect did not return state", inspection);
  process.exit(1);
}

const registry = fakeWindow.__aiWebGpuLabAppSurfaceRegistry;
const result = await sketch.connectRealSurface({ registry, loader: stubLoader, telemetrySink: sink });
if (result.adapter.id !== "observatory-observatory-test-0.9.0") {
  console.error("FAIL: connectRealSurface returned wrong adapter");
  process.exit(1);
}

const stubDescribe = registry.describe("adapter-stub");
if (stubDescribe.status !== "connected" || !stubDescribe.id.startsWith("observatory-")) {
  console.error("FAIL: stub describe should reflect connected real surface", stubDescribe);
  process.exit(1);
}

let threwOnMissingRegistry = false;
try {
  await sketch.connectRealSurface({ registry: null, loader: stubLoader });
} catch (error) {
  threwOnMissingRegistry = true;
}
if (!threwOnMissingRegistry) {
  console.error("FAIL: connectRealSurface should throw without registry");
  process.exit(1);
}

let threwOnBadManifest = false;
try {
  sketch.buildRealSurfaceAdapter({ manifest: null });
} catch (error) {
  threwOnBadManifest = true;
}
if (!threwOnBadManifest) {
  console.error("FAIL: buildRealSurfaceAdapter should throw on null manifest");
  process.exit(1);
}

const fakeFetch = async () => ({
  ok: true,
  async json() { return stubManifest; }
});
const manifestFromFetch = await sketch.loadDatasetManifest({ url: "https://example.invalid/m.json", fetchImpl: fakeFetch });
if (manifestFromFetch.id !== "observatory-test") {
  console.error("FAIL: loadDatasetManifest did not return manifest");
  process.exit(1);
}

console.log("OK real surface sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real surface sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-surface-sketch test passed"
