#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ADAPTER_PATH="${REPO_ROOT}/repo-scaffolds/shared/adapters/app-surface-adapter.js"
SKETCH_PATH="${REPO_ROOT}/repo-scaffolds/repos/app-local-chat-arena/public/real-surface-sketch.js"

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

for (const exportName of ["connectRealChatArena", "buildRealChatArenaAdapter", "loadArenaManifest"]) {
  if (typeof sketch[exportName] !== "function") { console.error(`FAIL: missing ${exportName}`); process.exit(1); }
}

const stubManifest = {
  id: "arena-test",
  label: "Test Arena",
  version: "0.9.0",
  matchups: [
    { id: "m1", label: "Matchup 1" },
    { id: "m2", label: "Matchup 2" }
  ]
};
const sink = { items: [], push(x) { this.items.push(x); } };

const adapter = sketch.buildRealChatArenaAdapter({ manifest: stubManifest, telemetrySink: sink });
if (!adapter || adapter.id !== "chat-arena-arena-test-0.9.0") { console.error("FAIL: id", adapter); process.exit(1); }
if (adapter.surfaceType !== "real-chat-matchup") { console.error("FAIL: surfaceType", adapter); process.exit(1); }

let t1 = false;
try { await adapter.renderSurface({}); } catch { t1 = true; }
if (!t1) { console.error("FAIL: renderSurface before load"); process.exit(1); }

const loaded = await adapter.loadDataset({ matchupId: "m2" });
if (loaded.matchup.id !== "m2") { console.error("FAIL: loadDataset", loaded); process.exit(1); }

let t2 = false;
try { await adapter.loadDataset({ matchupId: "missing" }); } catch { t2 = true; }
if (!t2) { console.error("FAIL: missing matchup"); process.exit(1); }

await adapter.loadDataset({ matchupId: "m1" });
const rendered = await adapter.renderSurface({ frameIndex: 9 });
if (rendered.matchupId !== "m1" || rendered.frameIndex !== 9) { console.error("FAIL: render meta", rendered); process.exit(1); }

const tele = await adapter.recordTelemetry({ kind: "vote" });
if (tele.manifestId !== "arena-test" || sink.items.length !== 1) { console.error("FAIL: telemetry", tele); process.exit(1); }

const stubLoader = async () => stubManifest;
const registry = fakeWindow.__aiWebGpuLabAppSurfaceRegistry;
const r = await sketch.connectRealChatArena({ registry, loader: stubLoader, telemetrySink: sink });
if (!r.adapter.id.startsWith("chat-arena-")) { console.error("FAIL: connect"); process.exit(1); }

const stub = registry.describe("adapter-stub");
if (stub.status !== "connected" || !stub.id.startsWith("chat-arena-")) { console.error("FAIL: stub describe", stub); process.exit(1); }

let t3 = false;
try { await sketch.connectRealChatArena({ registry: null, loader: stubLoader }); } catch { t3 = true; }
if (!t3) { console.error("FAIL: missing registry"); process.exit(1); }

let t4 = false;
try { sketch.buildRealChatArenaAdapter({ manifest: null }); } catch { t4 = true; }
if (!t4) { console.error("FAIL: null manifest"); process.exit(1); }

console.log("OK real chat-arena sketch");
EOF

OUTPUT="$(node "${DRIVER}" "${ADAPTER_PATH}" "${SKETCH_PATH}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real chat-arena sketch"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-chat-arena-sketch test passed"
