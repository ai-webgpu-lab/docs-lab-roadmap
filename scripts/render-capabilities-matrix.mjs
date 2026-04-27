#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const FAMILY_BY_FILENAME = {
  "real-renderer-sketch.js": "renderer",
  "real-runtime-sketch.js": "runtime",
  "real-surface-sketch.js": "app-surface",
  "real-benchmark-sketch.js": "benchmark"
};

const KNOWN_CAPABILITY_TAGS = [
  "prefill",
  "decode",
  "fixed-output-budget",
  "streaming-output",
  "embeddings",
  "reranker",
  "stt",
  "asr",
  "tts",
  "rag",
  "agent",
  "multimodal",
  "vlm",
  "diffusion",
  "image",
  "audio",
  "stream",
  "worker",
  "main-thread",
  "compute",
  "atomics",
  "subgroups",
  "fp16",
  "timestamp-query",
  "storage-buffer",
  "render",
  "particles",
  "scene-graph",
  "shader",
  "wgsl",
  "post-process",
  "webgpu",
  "webgl",
  "wasm",
  "raf",
  "cache-storage",
  "indexeddb",
  "session-storage"
];

const CAPABILITY_HEURISTICS = [
  { tag: "webgpu", patterns: [/navigator\.gpu/i, /requestAdapter\b/i, /createComputePipeline/i, /createShaderModule/i, /WGSLLanguageFeatures/i] },
  { tag: "compute", patterns: [/createComputePipeline/i, /beginComputePass/i, /dispatchWorkgroups/i] },
  { tag: "wgsl", patterns: [/`@group\(/i, /workgroup_size/i, /createShaderModule/i] },
  { tag: "atomics", patterns: [/atomic_/i, /atomicLoad/i, /atomicStore/i, /atomicAdd/i] },
  { tag: "subgroups", patterns: [/subgroup/i] },
  { tag: "timestamp-query", patterns: [/timestamp-query/i, /writeTimestamp/i] },
  { tag: "storage-buffer", patterns: [/STORAGE\b/i, /\bstorage,\s*read/i, /\bGPUBufferUsage\.STORAGE/i] },
  { tag: "fp16", patterns: [/f16\b/i, /shader-f16/i, /enable f16/i] },
  { tag: "webgl", patterns: [/getContext\(["']webgl/i, /WebGLRenderer/i] },
  { tag: "wasm", patterns: [/wasm-execution-providers/i, /\.wasm["'`]/i, /WebAssembly\b/i] },
  { tag: "worker", patterns: [/new Worker\(/i, /Worker\(/i, /workerThreads/i, /post(?:Message|Frame)/i] },
  { tag: "main-thread", patterns: [/main-thread/i, /mainThreadBurn/i] },
  { tag: "raf", patterns: [/requestAnimationFrame/i] },
  { tag: "cache-storage", patterns: [/caches\.open/i, /Cache Storage/i, /cacheStorage/i] },
  { tag: "indexeddb", patterns: [/indexedDB\.open/i, /IDBDatabase/i] },
  { tag: "transformers.js", patterns: [/@huggingface\/transformers/i, /transformers\.js/i, /transformersjs/i, /Xenova\//i] },
  { tag: "onnx-runtime-web", patterns: [/onnxruntime-web/i, /InferenceSession/i, /\bort\b/i] },
  { tag: "webllm", patterns: [/@mlc-ai\/web-llm/i, /webllm/i, /MLCEngine/i] },
  { tag: "three.js", patterns: [/three@/i, /THREE\./i, /WebGPURenderer/i] },
  { tag: "babylon.js", patterns: [/@babylonjs\/core/i, /BABYLON\./i] },
  { tag: "playcanvas", patterns: [/playcanvas/i, /pc\.Application/i] },
  { tag: "pixi.js", patterns: [/pixi\.js/i, /PIXI\./i] },
  { tag: "luma.gl", patterns: [/luma\.gl/i, /@luma\.gl/i] },
  { tag: "deck.gl", patterns: [/deck\.gl/i, /@deck\.gl/i] },
  { tag: "benchmark.js", patterns: [/benchmark@/i, /Benchmark\.Suite/i, /new Benchmark\(/i] },
  { tag: "diffusion", patterns: [/diffusion/i, /sd-turbo/i, /stable-diffusion/i] },
  { tag: "stt", patterns: [/whisper/i, /\bSTT\b/i, /speech-to-text/i, /transcribe/i] },
  { tag: "tts", patterns: [/\bTTS\b/i, /text-to-speech/i] },
  { tag: "embeddings", patterns: [/embeddings/i, /feature-extraction/i, /sentence-transformer/i] },
  { tag: "reranker", patterns: [/reranker/i, /rerank/i, /cross-encoder/i] },
  { tag: "rag", patterns: [/\brag\b/i, /retriev/i, /vector\s*store/i] },
  { tag: "vlm", patterns: [/\bvlm\b/i, /multimodal/i, /image-to-text/i] }
];

async function* walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
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

function extractRepoName(filePath) {
  const match = filePath.match(/repo-scaffolds\/(?:repos|p0)\/([^/]+)\/public\/real-/);
  return match ? match[1] : path.basename(path.dirname(path.dirname(filePath)));
}

function deriveCapabilities(source) {
  const out = new Set();

  // 1. Explicit capabilities: [...] arrays
  const capArrayMatches = source.matchAll(/capabilities:\s*\[([^\]]*)\]/g);
  for (const m of capArrayMatches) {
    const tokens = m[1].split(",").map((t) => t.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    for (const t of tokens) out.add(t);
  }

  // 2. Heuristic fingerprints
  for (const { tag, patterns } of CAPABILITY_HEURISTICS) {
    if (patterns.some((p) => p.test(source))) out.add(tag);
  }

  return Array.from(out).sort();
}

function summarizeSketch(filePath, source) {
  const filename = path.basename(filePath);
  const family = FAMILY_BY_FILENAME[filename] || "unknown";
  return {
    repo: extractRepoName(filePath),
    family,
    file: path.relative(REPO_ROOT, filePath),
    capabilities: deriveCapabilities(source)
  };
}

async function main() {
  const args = process.argv.slice(2);
  const options = { output: path.join(REPO_ROOT, "docs/CAPABILITIES-MATRIX.md"), stdout: false };
  for (let i = 0; i < args.length; i += 1) {
    const tok = args[i];
    if (tok === "--output") {
      options.output = args[i + 1];
      i += 1;
    } else if (tok === "--stdout") {
      options.stdout = true;
    } else if (tok === "--help" || tok === "-h") {
      console.log("Usage: node scripts/render-capabilities-matrix.mjs [--output <md>] [--stdout]");
      process.exit(0);
    }
  }

  const sketches = [];
  for await (const file of walk(path.join(REPO_ROOT, "repo-scaffolds"))) {
    if (file.includes("/shared/real-sketches/")) continue;
    const src = await fs.readFile(file, "utf8");
    sketches.push(summarizeSketch(file, src));
  }
  sketches.sort((a, b) => a.family.localeCompare(b.family) || a.repo.localeCompare(b.repo));

  const capabilityCounts = new Map();
  for (const s of sketches) {
    for (const c of s.capabilities) capabilityCounts.set(c, (capabilityCounts.get(c) || 0) + 1);
  }
  const orderedCaps = [...capabilityCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const familyCapPresence = new Map();
  for (const s of sketches) {
    if (!familyCapPresence.has(s.family)) familyCapPresence.set(s.family, new Map());
    const fmap = familyCapPresence.get(s.family);
    for (const c of s.capabilities) fmap.set(c, (fmap.get(c) || 0) + 1);
  }

  const lines = [
    "# Capabilities Matrix",
    "",
    `_Generated by \`scripts/render-capabilities-matrix.mjs\` on ${new Date().toISOString()}._`,
    "",
    "Each row is one repo-attached `real-*-sketch.js`. Capability tags blend explicit `capabilities: [...]` declarations with heuristic fingerprints (CDN, browser-API, library identifiers).",
    "",
    "## Counts",
    "",
    `- Total sketches: ${sketches.length}`,
    `- Distinct capability tags: ${capabilityCounts.size}`,
    "",
    "## Top capability frequency",
    ""
  ];
  for (const [tag, count] of orderedCaps.slice(0, 30)) {
    lines.push(`- \`${tag}\` × ${count}`);
  }

  lines.push("", "## By family", "");
  for (const [family, fmap] of [...familyCapPresence.entries()].sort()) {
    const sorted = [...fmap.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const top = sorted.slice(0, 10).map(([tag, count]) => `\`${tag}\`×${count}`).join(", ");
    lines.push(`- **${family}** — top: ${top || "—"}`);
  }

  lines.push("", "## Per-sketch matrix", "");
  lines.push("| Repo | Family | Capabilities |");
  lines.push("|---|---|---|");
  for (const s of sketches) {
    const caps = s.capabilities.length ? s.capabilities.map((c) => `\`${c}\``).join(", ") : "—";
    lines.push(`| \`${s.repo}\` | ${s.family} | ${caps} |`);
  }
  lines.push("");

  const text = lines.join("\n");

  if (options.stdout) {
    process.stdout.write(`${text}\n`);
  } else {
    await fs.mkdir(path.dirname(options.output), { recursive: true });
    await fs.writeFile(options.output, `${text}\n`, "utf8");
    console.log(`capabilities matrix written to ${options.output}`);
    console.log(`- sketches: ${sketches.length}`);
    console.log(`- capabilities: ${capabilityCounts.size}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
