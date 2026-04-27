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
  "exp-three-webgpu-core": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-three-scene-readiness",
        label: "Three Scene Readiness",
        probeExpectedScenario: "three-webgpu-scene-pending",
        expectedScenario: "three-webgpu-scene-readiness",
        probeButton: "#probe-capability",
        runButton: "#run-scene",
        runOnProbeStatuses: ["success", "partial"],
        runWaitMs: 1500
      }
    ]
  },
  "exp-babylon-webgpu-core": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-babylon-scene-readiness",
        label: "Babylon Scene Readiness",
        probeExpectedScenario: "babylon-webgpu-scene-pending",
        expectedScenario: "babylon-webgpu-scene-readiness",
        probeButton: "#probe-capability",
        runButton: "#run-scene",
        runOnProbeStatuses: ["success", "partial"],
        runWaitMs: 1500
      }
    ]
  },
  "exp-playcanvas-webgpu-core": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-playcanvas-scene-readiness",
        label: "PlayCanvas Scene Readiness",
        probeExpectedScenario: "playcanvas-webgpu-scene-pending",
        expectedScenario: "playcanvas-webgpu-scene-readiness",
        probeButton: "#probe-capability",
        runButton: "#run-scene",
        runOnProbeStatuses: ["success", "partial"],
        runWaitMs: 1500
      }
    ]
  },
  "exp-blackhole-three-singularity": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-blackhole-singularity-readiness",
        label: "Blackhole Singularity Readiness",
        probeExpectedScenario: "blackhole-three-singularity-pending",
        expectedScenario: "blackhole-three-singularity-readiness",
        probeButton: "#probe-capability",
        runButton: "#run-scene",
        runOnProbeStatuses: ["success", "partial"],
        runWaitMs: 1500
      }
    ]
  },
  "exp-blackhole-kerr-engine": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-kerr-engine-readiness",
        label: "Kerr Engine Readiness",
        probeExpectedScenario: "blackhole-kerr-engine-pending",
        expectedScenario: "blackhole-kerr-engine-readiness",
        probeButton: "#probe-capability",
        runButton: "#run-scene",
        runOnProbeStatuses: ["success", "partial"],
        runWaitMs: 1500
      }
    ]
  },
  "exp-blackhole-webgpu-fromscratch": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-raw-webgpu-blackhole-readiness",
        label: "Raw WebGPU Blackhole Readiness",
        probeExpectedScenario: "blackhole-webgpu-fromscratch-pending",
        expectedScenario: "blackhole-webgpu-fromscratch-readiness",
        probeButton: "#probe-capability",
        runButton: "#run-scene",
        runOnProbeStatuses: ["success", "partial"],
        runWaitMs: 1500
      }
    ]
  },
  "exp-nbody-webgpu-core": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-nbody-compute-readiness",
        label: "N-Body Compute Readiness",
        probeExpectedScenario: "nbody-webgpu-core-pending",
        expectedScenario: "nbody-webgpu-core-readiness",
        probeButton: "#probe-capability",
        runButton: "#run-simulation",
        runOnProbeStatuses: ["success", "partial"],
        runWaitMs: 1800
      }
    ]
  },
  "exp-fluid-webgpu-core": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-fluid-compute-readiness",
        label: "Fluid Compute Readiness",
        probeExpectedScenario: "fluid-webgpu-core-pending",
        expectedScenario: "fluid-webgpu-core-readiness",
        probeButton: "#probe-capability",
        runButton: "#run-simulation",
        runOnProbeStatuses: ["success", "partial"],
        runWaitMs: 1800
      }
    ]
  },
  "exp-three-webgpu-particles-stress": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-three-particles-stress-readiness",
        label: "Three Particles Stress Readiness",
        probeExpectedScenario: "three-webgpu-particles-stress-pending",
        expectedScenario: "three-webgpu-particles-stress-readiness",
        probeButton: "#probe-capability",
        runButton: "#run-stress",
        runOnProbeStatuses: ["success", "partial"],
        runWaitMs: 1800
      }
    ]
  },
  "bench-compute-stress-suite": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-compute-stress-suite-benchmark",
        label: "Compute Stress Suite Benchmark",
        button: "#run-benchmark",
        expectedScenario: "compute-stress-suite-benchmark",
        runWaitMs: 1800
      }
    ]
  },
  "bench-atomics-and-memory": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-atomics-and-memory-benchmark",
        label: "Atomics and Memory Benchmark",
        button: "#run-benchmark",
        expectedScenario: "atomics-and-memory-benchmark",
        runWaitMs: 1800
      }
    ]
  },
  "bench-texture-upload-and-streaming": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-texture-upload-and-streaming-benchmark",
        label: "Texture Upload and Streaming Benchmark",
        button: "#run-benchmark",
        expectedScenario: "texture-upload-and-streaming-benchmark",
        runWaitMs: 1800
      }
    ]
  },
  ".github": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-dotgithub-community-baseline",
        label: ".github Community Audit",
        button: "#run-baseline",
        expectedScenario: "dotgithub-community-baseline",
        runWaitMs: 1200
      }
    ]
  },
  "shared-webgpu-capability": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-shared-webgpu-capability-baseline",
        label: "shared-webgpu-capability Probe",
        probeExpectedScenario: "shared-webgpu-capability-pending",
        expectedScenario: "shared-webgpu-capability-baseline",
        probeButton: "#probe-capability",
        runButton: "#run-capability",
        runOnProbeStatuses: ["success", "partial"],
        runWaitMs: 1500
      }
    ]
  },
  "shared-bench-schema": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-shared-bench-schema-baseline",
        label: "shared-bench-schema Audit",
        button: "#run-baseline",
        expectedScenario: "shared-bench-schema-baseline",
        runWaitMs: 1200
      }
    ]
  },
  "shared-github-actions": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-shared-github-actions-baseline",
        label: "shared-github-actions Inventory",
        button: "#run-baseline",
        expectedScenario: "shared-github-actions-baseline",
        runWaitMs: 1200
      }
    ]
  },
  "docs-lab-roadmap": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-docs-lab-roadmap-baseline",
        label: "docs-lab-roadmap Inventory",
        button: "#run-baseline",
        expectedScenario: "docs-lab-roadmap-baseline",
        runWaitMs: 1200
      }
    ]
  },
  "exp-pixi-webgpu-2d": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-pixi-2d-readiness",
        label: "Pixi 2D Readiness",
        probeExpectedScenario: "pixi-webgpu-2d-pending",
        expectedScenario: "pixi-webgpu-2d-readiness",
        probeButton: "#probe-capability",
        runButton: "#run-scene",
        runOnProbeStatuses: ["success", "partial"],
        runWaitMs: 1500
      }
    ]
  },
  "exp-luma-webgpu-viz": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-luma-viz-readiness",
        label: "Luma Viz Readiness",
        probeExpectedScenario: "luma-webgpu-viz-pending",
        expectedScenario: "luma-webgpu-viz-readiness",
        probeButton: "#probe-capability",
        runButton: "#run-scene",
        runOnProbeStatuses: ["success", "partial"],
        runWaitMs: 1500
      }
    ]
  },
  "exp-deckgl-webgpu-readiness": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-deckgl-readiness",
        label: "Deck.gl Readiness",
        probeExpectedScenario: "deckgl-webgpu-pending",
        expectedScenario: "deckgl-webgpu-readiness",
        probeButton: "#probe-capability",
        runButton: "#run-scene",
        runOnProbeStatuses: ["success", "partial"],
        runWaitMs: 1500
      }
    ]
  },
  "bench-blackhole-render-shootout": {
    scenarios: [
      {
        id: "01-blackhole-render-webgpu",
        label: "Blackhole Render Shootout / WebGPU",
        urlSearch: "?mode=webgpu",
        button: "#run-benchmark",
        expectedScenario: "blackhole-render-shootout-webgpu"
      },
      {
        id: "02-blackhole-render-fallback",
        label: "Blackhole Render Shootout / Fallback",
        urlSearch: "?mode=fallback",
        button: "#run-benchmark",
        expectedScenario: "blackhole-render-shootout-fallback"
      }
    ]
  },
  "bench-renderer-shootout": {
    scenarios: [
      {
        id: "01-renderer-shootout-webgpu",
        label: "Renderer Shootout / WebGPU",
        urlSearch: "?mode=webgpu",
        button: "#run-benchmark",
        expectedScenario: "renderer-shootout-webgpu"
      },
      {
        id: "02-renderer-shootout-fallback",
        label: "Renderer Shootout / Fallback",
        urlSearch: "?mode=fallback",
        button: "#run-benchmark",
        expectedScenario: "renderer-shootout-fallback"
      }
    ]
  },
  "exp-embeddings-browser-throughput": {
    scenarios: [
      {
        id: "01-cold-index-webgpu",
        label: "Cold Index / WebGPU",
        urlSearch: "?mode=webgpu",
        button: "#run-cold",
        expectedScenario: "synthetic-embeddings-cold-webgpu"
      },
      {
        id: "02-warm-query-webgpu",
        label: "Warm Query / WebGPU",
        urlSearch: "?mode=webgpu",
        button: "#run-warm",
        expectedScenario: "synthetic-embeddings-warm-webgpu"
      },
      {
        id: "03-cold-index-fallback",
        label: "Cold Index / Fallback",
        urlSearch: "?mode=fallback",
        button: "#run-cold",
        expectedScenario: "synthetic-embeddings-cold-fallback"
      },
      {
        id: "04-warm-query-fallback",
        label: "Warm Query / Fallback",
        urlSearch: "?mode=fallback",
        button: "#run-warm",
        expectedScenario: "synthetic-embeddings-warm-fallback"
      }
    ]
  },
  "bench-embeddings-latency-quality": {
    scenarios: [
      {
        id: "01-embeddings-quality-webgpu",
        label: "Embeddings Quality / WebGPU",
        urlSearch: "?mode=webgpu",
        button: "#run-benchmark",
        expectedScenario: "embeddings-latency-quality-webgpu"
      },
      {
        id: "02-embeddings-quality-fallback",
        label: "Embeddings Quality / Fallback",
        urlSearch: "?mode=fallback",
        button: "#run-benchmark",
        expectedScenario: "embeddings-latency-quality-fallback"
      }
    ]
  },
  "bench-reranker-latency": {
    scenarios: [
      {
        id: "01-reranker-latency-webgpu",
        label: "Reranker Latency / WebGPU",
        urlSearch: "?mode=webgpu",
        button: "#run-benchmark",
        expectedScenario: "reranker-latency-webgpu"
      },
      {
        id: "02-reranker-latency-fallback",
        label: "Reranker Latency / Fallback",
        urlSearch: "?mode=fallback",
        button: "#run-benchmark",
        expectedScenario: "reranker-latency-fallback"
      }
    ]
  },
  "bench-rag-endtoend": {
    scenarios: [
      {
        id: "01-rag-endtoend-webgpu",
        label: "RAG End-to-End / WebGPU",
        urlSearch: "?mode=webgpu",
        button: "#run-benchmark",
        expectedScenario: "rag-endtoend-webgpu"
      },
      {
        id: "02-rag-endtoend-fallback",
        label: "RAG End-to-End / Fallback",
        urlSearch: "?mode=fallback",
        button: "#run-benchmark",
        expectedScenario: "rag-endtoend-fallback"
      }
    ]
  },
  "bench-llm-prefill-decode": {
    scenarios: [
      {
        id: "01-llm-prefill-decode-webgpu",
        label: "LLM Prefill Decode / WebGPU",
        urlSearch: "?mode=webgpu",
        button: "#run-benchmark",
        expectedScenario: "llm-prefill-decode-webgpu"
      },
      {
        id: "02-llm-prefill-decode-fallback",
        label: "LLM Prefill Decode / Fallback",
        urlSearch: "?mode=fallback",
        button: "#run-benchmark",
        expectedScenario: "llm-prefill-decode-fallback"
      }
    ]
  },
  "bench-stt-streaming-latency": {
    scenarios: [
      {
        id: "01-stt-streaming-webgpu",
        label: "STT Streaming / WebGPU",
        urlSearch: "?mode=webgpu",
        button: "#run-benchmark",
        expectedScenario: "stt-streaming-latency-webgpu"
      },
      {
        id: "02-stt-streaming-fallback",
        label: "STT Streaming / Fallback",
        urlSearch: "?mode=fallback",
        button: "#run-benchmark",
        expectedScenario: "stt-streaming-latency-fallback"
      }
    ]
  },
  "bench-voice-roundtrip": {
    scenarios: [
      {
        id: "01-voice-roundtrip-webgpu",
        label: "Voice Roundtrip / WebGPU",
        urlSearch: "?mode=webgpu",
        button: "#run-benchmark",
        expectedScenario: "voice-roundtrip-webgpu"
      },
      {
        id: "02-voice-roundtrip-fallback",
        label: "Voice Roundtrip / Fallback",
        urlSearch: "?mode=fallback",
        button: "#run-benchmark",
        expectedScenario: "voice-roundtrip-fallback"
      }
    ]
  },
  "bench-multimodal-latency": {
    scenarios: [
      {
        id: "01-multimodal-latency-webgpu",
        label: "Multimodal Latency / WebGPU",
        urlSearch: "?mode=webgpu",
        button: "#run-benchmark",
        expectedScenario: "multimodal-latency-webgpu"
      },
      {
        id: "02-multimodal-latency-fallback",
        label: "Multimodal Latency / Fallback",
        urlSearch: "?mode=fallback",
        button: "#run-benchmark",
        expectedScenario: "multimodal-latency-fallback"
      }
    ]
  },
  "bench-diffusion-browser-shootout": {
    scenarios: [
      {
        id: "01-diffusion-browser-shootout-webgpu",
        label: "Diffusion Shootout / WebGPU",
        urlSearch: "?mode=webgpu",
        button: "#run-benchmark",
        expectedScenario: "diffusion-browser-shootout-webgpu"
      },
      {
        id: "02-diffusion-browser-shootout-fallback",
        label: "Diffusion Shootout / Fallback",
        urlSearch: "?mode=fallback",
        button: "#run-benchmark",
        expectedScenario: "diffusion-browser-shootout-fallback"
      }
    ]
  },
  "bench-agent-step-latency": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-agent-step-latency-webgpu",
        label: "Agent Step Latency / WebGPU",
        urlSearch: "?mode=webgpu",
        button: "#run-benchmark",
        expectedScenario: "agent-step-latency-webgpu"
      },
      {
        id: "02-agent-step-latency-fallback",
        label: "Agent Step Latency / Fallback",
        urlSearch: "?mode=fallback",
        button: "#run-benchmark",
        expectedScenario: "agent-step-latency-fallback"
      }
    ]
  },
  "bench-webgpu-vs-wasm-parity": {
    scenarios: [
      {
        id: "01-parity-webgpu",
        label: "WebGPU Wasm Parity / WebGPU",
        urlSearch: "?mode=webgpu",
        button: "#run-benchmark",
        expectedScenario: "webgpu-wasm-parity-webgpu"
      },
      {
        id: "02-parity-fallback",
        label: "WebGPU Wasm Parity / Fallback",
        urlSearch: "?mode=fallback",
        button: "#run-benchmark",
        expectedScenario: "webgpu-wasm-parity-fallback"
      }
    ]
  },
  "exp-llm-chat-runtime-shootout": {
    scenarios: [
      {
        id: "01-webllm-style-webgpu",
        label: "WebLLM-style / WebGPU",
        urlSearch: "?mode=webgpu",
        button: "#run-webllm",
        expectedScenario: "runtime-profile-webllm-style-webgpu"
      },
      {
        id: "02-transformersjs-style-webgpu",
        label: "Transformers.js-style / WebGPU",
        urlSearch: "?mode=webgpu",
        button: "#run-transformers",
        expectedScenario: "runtime-profile-transformersjs-style-webgpu"
      },
      {
        id: "03-webllm-style-fallback",
        label: "WebLLM-style / Fallback",
        urlSearch: "?mode=fallback",
        button: "#run-webllm",
        expectedScenario: "runtime-profile-webllm-style-fallback"
      },
      {
        id: "04-transformersjs-style-fallback",
        label: "Transformers.js-style / Fallback",
        urlSearch: "?mode=fallback",
        button: "#run-transformers",
        expectedScenario: "runtime-profile-transformersjs-style-fallback"
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
  "exp-voice-assistant-local": {
    scenarios: [
      {
        id: "01-voice-assistant-local-readiness",
        label: "Voice Assistant Local Readiness",
        button: "#run-assistant",
        expectedScenario: "voice-assistant-local-readiness"
      }
    ]
  },
  "exp-vlm-browser-multimodal": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-vlm-browser-multimodal-readiness",
        label: "Browser VLM Multimodal Readiness",
        probeExpectedScenario: "vlm-browser-multimodal-pending",
        expectedScenario: "vlm-browser-multimodal-readiness",
        probeButton: "#probe-capability",
        runButton: "#run-lab",
        runOnProbeStatuses: ["success", "partial"],
        runWaitMs: 1800
      }
    ]
  },
  "exp-diffusion-webgpu-browser": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-diffusion-browser-readiness",
        label: "Diffusion Browser Readiness",
        probeExpectedScenario: "diffusion-webgpu-browser-pending",
        expectedScenario: "diffusion-webgpu-browser-readiness",
        probeButton: "#probe-capability",
        runButton: "#run-generation",
        runOnProbeStatuses: ["success", "partial"],
        runWaitMs: 2200
      }
    ]
  },
  "exp-browser-agent-local": {
    resultSelector: "#result-json",
    scenarios: [
      {
        id: "01-browser-agent-local-readiness",
        label: "Browser Agent Local Readiness",
        probeExpectedScenario: "browser-agent-local-pending",
        expectedScenario: "browser-agent-local-readiness",
        probeButton: "#probe-capability",
        runButton: "#run-agent",
        runOnProbeStatuses: ["success", "partial"],
        runWaitMs: 2000
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
  "exp-reranker-browser": {
    scenarios: [
      {
        id: "01-browser-reranker",
        label: "Browser Reranker",
        button: "#run-reranker",
        expectedScenario: "browser-reranker-readiness"
      }
    ]
  },
  "exp-ort-webgpu-baseline": {
    scenarios: [
      {
        id: "01-ort-webgpu-provider",
        label: "ORT WebGPU Provider",
        urlSearch: "?mode=webgpu",
        button: "#run-inference",
        expectedScenario: "ort-webgpu-baseline-webgpu"
      },
      {
        id: "02-ort-wasm-fallback",
        label: "ORT Wasm Fallback",
        urlSearch: "?mode=fallback",
        button: "#run-inference",
        expectedScenario: "ort-webgpu-baseline-fallback"
      }
    ]
  },
  "app-private-rag-lab": {
    scenarios: [
      {
        id: "01-private-rag-lab",
        label: "Private RAG Lab",
        button: "#run-lab",
        expectedScenario: "private-rag-lab-demo"
      }
    ]
  },
  "app-voice-agent-lab": {
    scenarios: [
      {
        id: "01-voice-agent-lab",
        label: "Voice Agent Lab",
        button: "#run-lab",
        expectedScenario: "voice-agent-lab-demo"
      }
    ]
  },
  "app-browser-image-lab": {
    scenarios: [
      {
        id: "01-browser-image-lab",
        label: "Browser Image Lab",
        button: "#run-lab",
        expectedScenario: "browser-image-lab-demo"
      }
    ]
  },
  "app-blackhole-observatory": {
    scenarios: [
      {
        id: "01-blackhole-observatory",
        label: "Blackhole Observatory",
        button: "#run-observatory",
        expectedScenario: "blackhole-observatory-demo"
      }
    ]
  },
  "exp-webllm-browser-chat": {
    scenarios: [
      {
        id: "01-webllm-browser-chat",
        label: "WebLLM Browser Chat",
        button: "#run-chat",
        expectedScenario: "webllm-browser-chat-readiness-webgpu"
      }
    ]
  },
  "exp-llm-worker-ux": {
    scenarios: [
      {
        id: "01-llm-worker-mode",
        label: "LLM Worker Mode",
        urlSearch: "?mode=worker",
        button: "#run-turn",
        expectedScenario: "llm-worker-ux-worker",
        typingSelector: "#probe-input"
      },
      {
        id: "02-llm-main-mode",
        label: "LLM Main Mode",
        urlSearch: "?mode=main",
        button: "#run-turn",
        expectedScenario: "llm-worker-ux-main",
        typingSelector: "#probe-input"
      }
    ]
  },
  "bench-runtime-shootout": {
    scenarios: [
      {
        id: "01-runtime-benchmark-webgpu",
        label: "Runtime Benchmark / WebGPU",
        urlSearch: "?mode=webgpu",
        button: "#run-benchmark",
        expectedScenarioPrefix: "runtime-benchmark-"
      },
      {
        id: "02-runtime-benchmark-fallback",
        label: "Runtime Benchmark / Fallback",
        urlSearch: "?mode=fallback",
        button: "#run-benchmark",
        expectedScenarioPrefix: "runtime-benchmark-"
      },
      {
        id: "03-runtime-benchmark-real-runtime",
        label: "Runtime Benchmark / Real Runtime (Transformers.js)",
        urlSearch: "?mode=real-runtime",
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
  },
  "app-local-chat-arena": {
    scenarios: [
      {
        id: "01-local-chat-arena",
        label: "Local Chat Arena",
        button: "#run-arena",
        expectedScenario: "local-chat-arena-demo"
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

function resolveScenarioUrl(baseUrl, scenario) {
  const url = new URL(baseUrl);
  url.search = scenario.urlSearch || "";
  return url.toString();
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

function probeScenarioConfig(scenario) {
  if (!scenario.probeExpectedScenario && !scenario.probeExpectedScenarioPrefix) {
    return scenario;
  }

  return {
    ...scenario,
    expectedScenario: scenario.probeExpectedScenario,
    expectedScenarioPrefix: scenario.probeExpectedScenarioPrefix
  };
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
    `url_search=${scenario.urlSearch || "(default)"}`,
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

    for (const scenario of repoConfig.scenarios) {
      const consoleStart = consoleLines.length;
      await page.goto(resolveScenarioUrl(serverContext.url, scenario), {
        waitUntil: "load",
        timeout: options.timeoutMs
      });
      await page.locator(resolveResultSelector(repoConfig, scenario)).waitFor({
        state: "visible",
        timeout: options.timeoutMs
      });

      let previousText = (await readResultPayload(page, repoConfig, scenario)) || "";
      const stopSignal = { done: false };
      const typingTask = scenario.typingSelector
        ? driveProbeInput(page, scenario.typingSelector, stopSignal)
        : Promise.resolve();

      if (scenario.probeButton) {
        await page.locator(scenario.probeButton).click();
        const probeResult = await waitForResult(page, repoConfig, probeScenarioConfig(scenario), previousText, options.timeoutMs, ["success", "partial"]);
        previousText = JSON.stringify(probeResult, null, 2);

        const runOnProbeStatuses = scenario.runOnProbeStatuses || ["success"];
        if (scenario.runButton && runOnProbeStatuses.includes(probeResult.status)) {
          const postRunPrevious = await readResultPayload(page, repoConfig, scenario);
          await page.locator(scenario.runButton).click();
          await waitForResult(page, repoConfig, scenario, postRunPrevious, options.timeoutMs);
          await page.waitForTimeout(scenario.runWaitMs || 1000);
        }
      } else {
        await page.locator(scenario.button).click();
        await waitForResult(page, repoConfig, scenario, previousText, options.timeoutMs, scenario.acceptedStatuses || ["success"]);
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
      result.meta.capture_scenario_id = scenario.id;
      if (scenario.urlSearch) {
        result.meta.capture_url_search = scenario.urlSearch;
      }
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
        fullPage: true,
        timeout: Math.max(options.timeoutMs, 120000)
      });
      await fs.writeFile(
        path.join(logDir, `${baseName}.log`),
        buildLogText({
          repoName,
          scenario,
          result,
          captureContext,
          consoleLines: consoleLines.slice(consoleStart)
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
