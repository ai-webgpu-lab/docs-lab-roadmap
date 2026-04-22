#!/usr/bin/env node

import http from "node:http";
import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

import { renderResultsSummary } from "./render-results-summary.mjs";

const execFile = promisify(execFileCallback);

const CAPTURE_CONFIG = {
  "tpl-webgpu-vanilla": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-minimal-webgpu-starter",
        label: "Minimal WebGPU Starter",
        expectedScenario: "minimal-webgpu-starter",
        probeButton: "#probe-capability",
        runButton: "#run-sample",
        runWaitMs: 1500
      }
    ]
  },
  "tpl-webgpu-react": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-react-webgpu-starter",
        label: "React WebGPU Starter",
        expectedScenario: "react-webgpu-starter",
        probeButton: "#probe-capability",
        runButton: "#run-sample",
        runWaitMs: 1500
      }
    ]
  },
  "exp-embeddings-browser-throughput": {
    scenarios: [
      {
        id: "01-cold-index",
        label: "Cold Index",
        button: "#run-cold",
        expectedScenario: "synthetic-embeddings-cold"
      },
      {
        id: "02-warm-query",
        label: "Warm Query",
        button: "#run-warm",
        expectedScenario: "synthetic-embeddings-warm"
      }
    ]
  },
  "exp-llm-chat-runtime-shootout": {
    scenarios: [
      {
        id: "01-webllm-style",
        label: "WebLLM-style",
        button: "#run-webllm",
        expectedScenario: "runtime-profile-webllm-style"
      },
      {
        id: "02-transformersjs-style",
        label: "Transformers.js-style",
        button: "#run-transformers",
        expectedScenario: "runtime-profile-transformersjs-style"
      }
    ]
  },
  "exp-stt-whisper-webgpu": {
    scenarios: [
      {
        id: "01-file-transcription",
        label: "File Transcription",
        button: "#run-transcription",
        expectedScenario: "file-transcription-readiness"
      }
    ]
  },
  "exp-rag-browser-pipeline": {
    scenarios: [
      {
        id: "01-browser-rag-fixture",
        label: "Browser RAG Fixture",
        button: "#run-pipeline",
        expectedScenario: "browser-rag-fixture"
      }
    ]
  },
  "bench-runtime-shootout": {
    scenarios: [
      {
        id: "01-runtime-benchmark",
        label: "Runtime Benchmark",
        button: "#run-benchmark",
        expectedScenarioPrefix: "runtime-benchmark-"
      }
    ]
  },
  "bench-model-load-and-cache": {
    scenarios: [
      {
        id: "01-cold-load",
        label: "Cold Load",
        button: "#run-cold",
        expectedScenario: "model-load-cold"
      },
      {
        id: "02-warm-load",
        label: "Warm Load",
        button: "#run-warm",
        expectedScenario: "model-load-warm"
      }
    ]
  },
  "bench-worker-isolation-and-ui-jank": {
    scenarios: [
      {
        id: "01-main-thread",
        label: "Main Thread Burn",
        button: "#run-main",
        expectedScenario: "worker-isolation-main",
        typingSelector: "#probe-input"
      },
      {
        id: "02-worker-thread",
        label: "Worker Burn",
        button: "#run-worker",
        expectedScenario: "worker-isolation-worker",
        typingSelector: "#probe-input"
      }
    ]
  }
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

function parseArgs(argv) {
  const options = {
    headless: true,
    timeoutMs: 120000
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--repo-dir") {
      options.repoDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--repo-name") {
      options.repoName = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--commit") {
      options.commit = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--owner") {
      options.owner = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--captured-by") {
      options.capturedBy = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--headful") {
      options.headless = false;
      continue;
    }

    if (token === "--skip-render") {
      options.skipRender = true;
      continue;
    }

    if (token === "--timeout-ms") {
      options.timeoutMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (!options.repoDir) {
    throw new Error("Missing required argument: --repo-dir");
  }

  return options;
}

async function detectCommit(repoDir) {
  try {
    const { stdout } = await execFile("git", ["-C", repoDir, "rev-parse", "--short", "HEAD"]);
    return stdout.trim();
  } catch (error) {
    return "working-tree";
  }
}

async function ensureDirectories(repoDir) {
  const rawDir = path.join(repoDir, "reports", "raw");
  const screenshotDir = path.join(repoDir, "reports", "screenshots");
  const logDir = path.join(repoDir, "reports", "logs");

  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(screenshotDir, { recursive: true });
  await fs.mkdir(logDir, { recursive: true });

  return { rawDir, screenshotDir, logDir };
}

async function clearGeneratedArtifacts(dir, extensions) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (!extensions.some((extension) => entry.name.endsWith(extension))) {
      continue;
    }
    await fs.unlink(path.join(dir, entry.name));
  }
}

async function startStaticServer(rootDir) {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const requestedPath = decodeURIComponent(url.pathname);
      const normalized = path.normalize(requestedPath === "/" ? "/index.html" : requestedPath);
      const filePath = path.join(rootDir, normalized);
      const relative = path.relative(rootDir, filePath);

      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const content = await fs.readFile(filePath);
      response.writeHead(200, {
        "content-type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
        "cache-control": "no-store"
      });
      response.end(content);
    } catch (error) {
      response.writeHead(error && error.code === "ENOENT" ? 404 : 500);
      response.end(error && error.code === "ENOENT" ? "Not Found" : "Server Error");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind local static server");
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}/`
  };
}

async function stopStaticServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function resolveResultSelector(repoConfig, scenario) {
  return scenario.resultSelector || repoConfig.resultSelector || "#result-json";
}

async function readResultPayload(page, repoConfig, scenario) {
  const selector = resolveResultSelector(repoConfig, scenario);
  const payload = await page.locator(selector).textContent();
  if (!payload) {
    throw new Error(`Missing result payload from selector: ${selector}`);
  }
  return payload;
}

function matchesExpectedScenario(parsed, scenario) {
  if (scenario.expectedScenario && parsed.meta?.scenario !== scenario.expectedScenario) {
    return false;
  }
  if (scenario.expectedScenarioPrefix && !String(parsed.meta?.scenario || "").startsWith(scenario.expectedScenarioPrefix)) {
    return false;
  }
  return true;
}

async function waitForResult(page, repoConfig, scenario, previousText, timeoutMs, acceptedStatuses = ["success"]) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const text = await readResultPayload(page, repoConfig, scenario);
    if (text && text !== previousText) {
      try {
        const parsed = JSON.parse(text);
        if (acceptedStatuses.includes(parsed.status) && matchesExpectedScenario(parsed, scenario)) {
          return parsed;
        }
      } catch (error) {
        // Keep polling until the payload is valid JSON.
      }
    }

    await page.waitForTimeout(100);
  }

  throw new Error(`Timed out waiting for ${scenario.label} result`);
}

async function parseResultJson(page, repoConfig, scenario) {
  const payload = await readResultPayload(page, repoConfig, scenario);
  return JSON.parse(payload);
}

async function driveProbeInput(page, selector, stopSignal) {
  const locator = page.locator(selector);
  let iteration = 0;

  while (!stopSignal.done) {
    await locator.fill(`probe-${iteration}`);
    await page.waitForTimeout(45);
    iteration += 1;
  }
}

function buildLogText({ repoName, scenario, result, captureContext, consoleLines }) {
  const sections = [
    `repo=${repoName}`,
    `scenario=${scenario.label}`,
    `captured_at=${captureContext.captured_at}`,
    `browser=${captureContext.browser_name} ${captureContext.browser_version}`,
    `headless=${captureContext.headless}`,
    `meta_scenario=${result.meta.scenario}`,
    `status=${result.status}`,
    "",
    "[page-console]"
  ];

  if (consoleLines.length) {
    sections.push(...consoleLines);
  } else {
    sections.push("(none)");
  }

  sections.push("", "[harness-logs]");
  if (Array.isArray(result.artifacts?.raw_logs) && result.artifacts.raw_logs.length) {
    sections.push(...result.artifacts.raw_logs);
  } else {
    sections.push("(none)");
  }

  sections.push("", "[result-json]", JSON.stringify(result, null, 2));
  return sections.join("\n");
}

async function runCapture(options) {
  const repoDir = path.resolve(options.repoDir);
  const repoName = options.repoName || path.basename(repoDir);
  const repoConfig = CAPTURE_CONFIG[repoName];

  if (!repoConfig) {
    throw new Error(`Unsupported repo for capture: ${repoName}`);
  }

  const commit = options.commit || await detectCommit(repoDir);
  const owner = options.owner || "ai-webgpu-lab";
  const capturedBy = options.capturedBy || process.env.USER || "automation";
  const { rawDir, screenshotDir, logDir } = await ensureDirectories(repoDir);
  await clearGeneratedArtifacts(rawDir, [".json"]);
  await clearGeneratedArtifacts(screenshotDir, [".png"]);
  await clearGeneratedArtifacts(logDir, [".log"]);

  const serverContext = await startStaticServer(path.join(repoDir, "public"));
  const browser = await chromium.launch({
    headless: options.headless,
    args: [
      "--no-sandbox",
      "--enable-unsafe-webgpu",
      "--use-angle=swiftshader"
    ]
  });

  try {
    const browserVersion = browser.version();
    const context = await browser.newContext({
      viewport: {
        width: 1440,
        height: 1100
      }
    });
    const page = await context.newPage();
    const consoleLines = [];

    page.on("console", (message) => {
      consoleLines.push(`[console:${message.type()}] ${message.text()}`);
    });

    await page.goto(serverContext.url, {
      waitUntil: "load",
      timeout: options.timeoutMs
    });
    await page.locator(repoConfig.resultSelector || "#result-json").waitFor({
      state: "visible",
      timeout: options.timeoutMs
    });

    for (const scenario of repoConfig.scenarios) {
      let previousText = (await readResultPayload(page, repoConfig, scenario)) || "";
      const stopSignal = { done: false };
      const typingTask = scenario.typingSelector
        ? driveProbeInput(page, scenario.typingSelector, stopSignal)
        : Promise.resolve();

      if (scenario.probeButton) {
        await page.locator(scenario.probeButton).click();
        const probeResult = await waitForResult(page, repoConfig, scenario, previousText, options.timeoutMs, ["success", "partial"]);
        previousText = JSON.stringify(probeResult, null, 2);

        if (scenario.runButton && probeResult.status === "success") {
          await page.locator(scenario.runButton).click();
          const postRunPrevious = await readResultPayload(page, repoConfig, scenario);
          await page.waitForTimeout(scenario.runWaitMs || 1000);
          const refreshed = await readResultPayload(page, repoConfig, scenario);
          if (refreshed === postRunPrevious) {
            await page.waitForTimeout(300);
          }
        }
      } else {
        await page.locator(scenario.button).click();
        await waitForResult(page, repoConfig, scenario, previousText, options.timeoutMs);
      }

      stopSignal.done = true;
      await typingTask;
      await page.waitForTimeout(100);

      const result = await parseResultJson(page, repoConfig, scenario);
      const captureContext = {
        tool: "playwright-chromium",
        browser_name: "Chromium",
        browser_version: browserVersion,
        headless: options.headless,
        captured_at: new Date().toISOString(),
        captured_by: capturedBy
      };
      const baseName = scenario.id;
      const screenshotRelative = `./reports/screenshots/${baseName}.png`;
      const logRelative = `./reports/logs/${baseName}.log`;

      result.meta.commit = commit;
      result.meta.owner = owner;
      result.meta.capture_context = captureContext;
      result.meta.notes = result.meta.notes
        ? `${result.meta.notes}; automation=playwright-chromium`
        : "automation=playwright-chromium";
      result.artifacts = {
        ...result.artifacts,
        screenshots: [screenshotRelative],
        raw_logs: [logRelative]
      };

      await page.screenshot({
        path: path.join(screenshotDir, `${baseName}.png`),
        fullPage: true
      });
      await fs.writeFile(
        path.join(logDir, `${baseName}.log`),
        buildLogText({
          repoName,
          scenario,
          result,
          captureContext,
          consoleLines
        }),
        "utf8"
      );
      await fs.writeFile(
        path.join(rawDir, `${baseName}.json`),
        `${JSON.stringify(result, null, 2)}\n`,
        "utf8"
      );
    }

    if (!options.skipRender) {
      await renderResultsSummary({
        repoDir
      });
    }
  } finally {
    await browser.close();
    await stopStaticServer(serverContext.server);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await runCapture(options);
}

try {
  if (import.meta.url === `file://${process.argv[1]}`) {
    await main();
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
}
