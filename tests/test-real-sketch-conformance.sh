#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

DRIVER="${TMP_DIR}/driver.mjs"
cat >"${DRIVER}" <<'EOF'
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.argv[2];

async function* walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && /^real-[a-z0-9-]+-sketch\.js$/.test(entry.name)) {
      yield full;
    }
  }
}

const sketches = [];
for await (const entry of walk(path.join(repoRoot, "repo-scaffolds"))) {
  sketches.push(entry);
}

if (sketches.length === 0) {
  console.error("FAIL: no real-*-sketch.js files found");
  process.exit(1);
}

const errors = [];
let passCount = 0;

const fakeWindow = {};
globalThis.window = fakeWindow;
globalThis.URLSearchParams = URLSearchParams;

for (const sketchPath of sketches) {
  const relative = path.relative(repoRoot, sketchPath);
  let module;
  try {
    module = await import(pathToFileURL(sketchPath).href);
  } catch (error) {
    errors.push(`${relative}: import failed (${error.message})`);
    continue;
  }

  const exportNames = Object.keys(module);
  const hasConnect = exportNames.some((name) => /^connect[A-Z]/.test(name) && typeof module[name] === "function");
  const hasBuild = exportNames.some((name) => /^build[A-Z]/.test(name) && typeof module[name] === "function");
  const hasLoad = exportNames.some((name) => /^load[A-Z]/.test(name) && typeof module[name] === "function");

  const issues = [];
  if (!hasConnect) issues.push("missing connect* export");
  if (!hasBuild) issues.push("missing build* export");
  if (!hasLoad) issues.push("missing load* export");

  if (issues.length === 0) {
    passCount += 1;
  } else {
    errors.push(`${relative}: ${issues.join(", ")}`);
  }
}

if (errors.length) {
  console.error(`FAIL: real-*-sketch contract violations (${errors.length})`);
  for (const message of errors) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log(`OK real-*-sketch contract conformance (${passCount} sketch${passCount === 1 ? "" : "es"})`);
EOF

OUTPUT="$(node "${DRIVER}" "${REPO_ROOT}" 2>&1)"
echo "${OUTPUT}"
if [[ "${OUTPUT}" != *"OK real-*-sketch contract conformance"* ]]; then
  echo "test failed: missing success line" >&2
  exit 1
fi

echo "real-sketch-conformance test passed"
