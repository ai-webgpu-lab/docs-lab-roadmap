#!/usr/bin/env node
// Rollout family adapter contracts and real sketches into per-repo scaffolds.
//
// For each family-mapped repo under repo-scaffolds/{repos,p0}/<repo>/public/:
//   1. Ensure each family adapter file exists (copy from shared/adapters/).
//   2. Ensure each family real sketch exists (copy from shared/real-sketches/).
//   3. Patch index.html to load adapter(s) before sketch(es), preserving any
//      existing custom script tags.
//
// Idempotent: safe to re-run. Files already present are left untouched.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCsv } from "./lib/csv.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const ADAPTER_FILE = {
  renderer: "renderer-adapter.js",
  runtime: "runtime-adapter.js",
  "app-surface": "app-surface-adapter.js",
  benchmark: "benchmark-adapter.js"
};

const SKETCH_FILE = {
  renderer: "real-renderer-sketch.js",
  runtime: "real-runtime-sketch.js",
  "app-surface": "real-surface-sketch.js",
  benchmark: "real-benchmark-sketch.js"
};

const SHARED_ADAPTER = (family) =>
  path.join(REPO_ROOT, "repo-scaffolds/shared/adapters", `${family}-adapter.js`);
const SHARED_SKETCH = (family) => {
  const stem = family === "app-surface" ? "app-surface" : family;
  return path.join(REPO_ROOT, "repo-scaffolds/shared/real-sketches", `${stem}.js`);
};

const SKIP_REPOS = new Set([
  ".github",
  "tpl-webgpu-vanilla",
  "tpl-webgpu-react",
  "shared-webgpu-capability",
  "shared-bench-schema",
  "shared-github-actions",
  "docs-lab-roadmap"
]);

const RENDERER_BENCH = new Set([
  "bench-blackhole-render-shootout",
  "bench-renderer-shootout",
  "bench-compute-stress-suite",
  "bench-atomics-and-memory",
  "bench-texture-upload-and-streaming"
]);

function familiesForRepo(repo, category) {
  if (SKIP_REPOS.has(repo)) return [];
  switch (category) {
    case "graphics":
    case "blackhole":
      return ["renderer"];
    case "ml":
    case "llm":
    case "audio":
    case "multimodal":
    case "agent":
      return ["runtime"];
    case "app":
      return ["app-surface"];
    case "benchmark":
      return RENDERER_BENCH.has(repo)
        ? ["benchmark", "renderer"]
        : ["benchmark", "runtime"];
    default:
      return [];
  }
}

async function readInventory() {
  return readCsv(path.join(REPO_ROOT, "docs/repo-inventory.csv"));
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function detectScaffoldRoot(repo) {
  const candidates = [
    path.join(REPO_ROOT, "repo-scaffolds/p0", repo),
    path.join(REPO_ROOT, "repo-scaffolds/repos", repo)
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

async function copyIfMissing(source, dest) {
  if (await fileExists(dest)) return false;
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(source, dest);
  return true;
}

function buildScriptTags(families) {
  const adapterTags = families.map(
    (family) => `    <script type="module" src="./${ADAPTER_FILE[family]}"></script>`
  );
  const sketchTags = families.map(
    (family) => `    <script type="module" src="./${SKETCH_FILE[family]}"></script>`
  );
  return { adapterTags, sketchTags };
}

async function patchIndexHtml(publicDir, families) {
  const indexPath = path.join(publicDir, "index.html");
  if (!(await fileExists(indexPath))) return false;
  const original = await fs.readFile(indexPath, "utf8");
  let updated = original;

  // Make sure each adapter script tag is present.
  for (const family of families) {
    const adapterRef = `./${ADAPTER_FILE[family]}`;
    if (updated.includes(adapterRef)) continue;
    const sketchRef = `./${SKETCH_FILE[family]}`;
    const sketchTagRegex = new RegExp(
      `([ \\t]*)<script[^>]*src="${sketchRef.replace(/[.]/g, "\\.")}"[^>]*></script>`,
      "m"
    );
    const match = updated.match(sketchTagRegex);
    const adapterTag = `<script type="module" src="${adapterRef}"></script>`;
    if (match) {
      const indent = match[1] || "    ";
      updated = updated.replace(sketchTagRegex, `${indent}${adapterTag}\n${match[0]}`);
    } else {
      // Insert before </body>
      const bodyClose = updated.indexOf("</body>");
      if (bodyClose >= 0) {
        const insertion = `    ${adapterTag}\n  `;
        updated = `${updated.slice(0, bodyClose)}${insertion}${updated.slice(bodyClose)}`;
      } else {
        updated = `${updated}\n    ${adapterTag}\n`;
      }
    }
  }

  // Ensure each sketch script tag is present.
  for (const family of families) {
    const sketchRef = `./${SKETCH_FILE[family]}`;
    if (updated.includes(sketchRef)) continue;
    const sketchTag = `<script type="module" src="${sketchRef}"></script>`;
    // Insert just before app.js script tag, else before </body>.
    const appTagRegex = /([ \t]*)<script[^>]*src="\.\/app\.js"[^>]*><\/script>/;
    const appMatch = updated.match(appTagRegex);
    if (appMatch) {
      const indent = appMatch[1] || "    ";
      updated = updated.replace(appTagRegex, `${indent}${sketchTag}\n${appMatch[0]}`);
    } else {
      const bodyClose = updated.indexOf("</body>");
      if (bodyClose >= 0) {
        const insertion = `    ${sketchTag}\n  `;
        updated = `${updated.slice(0, bodyClose)}${insertion}${updated.slice(bodyClose)}`;
      } else {
        updated += `\n    ${sketchTag}\n`;
      }
    }
  }

  if (updated === original) return false;
  await fs.writeFile(indexPath, updated, "utf8");
  return true;
}

async function rolloutRepo(repo, category) {
  const families = familiesForRepo(repo, category);
  if (families.length === 0) return null;

  const scaffold = await detectScaffoldRoot(repo);
  if (!scaffold) return { repo, families, skipped: "no scaffold dir" };

  const publicDir = path.join(scaffold, "public");
  await fs.mkdir(publicDir, { recursive: true });

  const adapterAdded = [];
  const sketchAdded = [];
  for (const family of families) {
    const dest = path.join(publicDir, ADAPTER_FILE[family]);
    if (await copyIfMissing(SHARED_ADAPTER(family), dest)) adapterAdded.push(family);
    const sketchDest = path.join(publicDir, SKETCH_FILE[family]);
    if (await copyIfMissing(SHARED_SKETCH(family), sketchDest)) sketchAdded.push(family);
  }

  const htmlPatched = await patchIndexHtml(publicDir, families);
  return { repo, families, adapterAdded, sketchAdded, htmlPatched };
}

async function main() {
  const inventory = await readInventory();
  const summary = {
    inventoryCount: inventory.length,
    processed: 0,
    skipped: 0,
    adaptersAdded: 0,
    sketchesAdded: 0,
    htmlPatched: 0
  };
  const detail = [];
  for (const row of inventory) {
    const result = await rolloutRepo(row.repo, row.category);
    if (!result) {
      summary.skipped += 1;
      continue;
    }
    summary.processed += 1;
    summary.adaptersAdded += result.adapterAdded?.length || 0;
    summary.sketchesAdded += result.sketchAdded?.length || 0;
    if (result.htmlPatched) summary.htmlPatched += 1;
    if ((result.adapterAdded && result.adapterAdded.length) ||
        (result.sketchAdded && result.sketchAdded.length) ||
        result.htmlPatched) {
      detail.push(result);
    }
  }

  console.log(`Processed ${summary.processed} family-mapped repos (${summary.skipped} skipped)`);
  console.log(`  adapter files added: ${summary.adaptersAdded}`);
  console.log(`  sketch files added: ${summary.sketchesAdded}`);
  console.log(`  index.html files patched: ${summary.htmlPatched}`);
  if (detail.length) {
    console.log("\nChanges per repo:");
    for (const d of detail) {
      const parts = [];
      if (d.adapterAdded?.length) parts.push(`adapters[${d.adapterAdded.join(",")}]`);
      if (d.sketchAdded?.length) parts.push(`sketches[${d.sketchAdded.join(",")}]`);
      if (d.htmlPatched) parts.push("html-patched");
      console.log(`  - ${d.repo}: ${parts.join(", ")}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
