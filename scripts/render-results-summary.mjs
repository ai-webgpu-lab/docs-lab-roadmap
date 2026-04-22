#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const REPO_QUESTIONS = {
  "tpl-webgpu-vanilla": [
    "최소 WebGPU 스타터가 현재 브라우저에서 adapter/device 획득 또는 fallback 보고를 제대로 남기는가",
    "triangle sample frame pacing이 첫 baseline result로 재현 가능한가",
    "이 결과를 downstream raw WebGPU 실험의 출발점으로 사용할 수 있는가"
  ],
  "tpl-webgpu-react": [
    "React shell 위에서도 capability probe와 canvas mount flow를 결과 문서로 고정할 수 있는가",
    "no-build React starter가 fallback 또는 WebGPU 경로를 명확히 기록하는가",
    "후속 React 기반 실험 저장소의 첫 baseline으로 재사용 가능한가"
  ],
  "exp-embeddings-browser-throughput": [
    "cold index build와 warm query reuse 차이가 브라우저 내 deterministic fixture에서도 명확하게 드러나는가",
    "같은 fixture에서 recall@10과 throughput이 안정적으로 재현되는가",
    "cache state를 분리 기록했을 때 이후 실제 embedder 교체 전 baseline으로 쓸 수 있는가"
  ],
  "exp-llm-chat-runtime-shootout": [
    "같은 프롬프트와 출력 예산에서 runtime profile별 TTFT와 decode throughput 차이가 분명한가",
    "worker/main execution mode 차이가 결과 메타데이터에 남는가",
    "실제 runtime을 붙이기 전 deterministic readiness harness로 비교 프로토콜을 고정할 수 있는가"
  ],
  "exp-stt-whisper-webgpu": [
    "segment 단위 partial emission과 최종 완료 시간이 안정적으로 측정되는가",
    "reference transcript 기준 WER/CER가 보고 포맷에 그대로 반영되는가",
    "실제 Whisper runtime 연결 전 파일 전사 baseline 경로를 검증할 수 있는가"
  ],
  "exp-rag-browser-pipeline": [
    "browser-only ingest, chunk, retrieve, rerank, answer loop가 단일 보고 흐름으로 남는가",
    "citation hit-rate와 answer latency를 함께 기록할 수 있는가",
    "실제 embedder와 generator를 붙이기 전 deterministic fixture로 end-to-end 경로를 고정할 수 있는가"
  ],
  "bench-runtime-shootout": [
    "동일 prompt/output budget에서 runtime profile별 상대 우위를 단일 benchmark draft로 고정할 수 있는가",
    "winner selection과 비교 메모가 raw JSON과 RESULTS.md 양쪽에 일관되게 남는가",
    "실제 runtime 교체 전 fixed-scenario benchmark protocol이 재현 가능한가"
  ],
  "bench-model-load-and-cache": [
    "cold load와 warm load의 total/init delta가 cache state와 함께 재현되는가",
    "prepared artifact hit 여부가 raw JSON과 결과 문서에서 같이 보이는가",
    "실제 model/runtime 교체 전 cache benchmark 프로토콜을 고정할 수 있는가"
  ],
  "bench-worker-isolation-and-ui-jank": [
    "같은 burn profile에서 main thread와 worker execution의 responsiveness 차이가 측정되는가",
    "frame pacing, timer lag, input lag 관련 메모를 결과 문서에 연결할 수 있는가",
    "실제 heavy runtime을 붙이기 전 UI jank benchmark baseline으로 쓸 수 있는가"
  ]
};

const SCENARIO_LABELS = {
  "tpl-webgpu-vanilla": {
    "minimal-webgpu-starter": "Minimal WebGPU Starter"
  },
  "tpl-webgpu-react": {
    "react-webgpu-starter": "React WebGPU Starter"
  },
  "exp-embeddings-browser-throughput": {
    "synthetic-embeddings-cold": "Cold Index",
    "synthetic-embeddings-warm": "Warm Query"
  },
  "exp-llm-chat-runtime-shootout": {
    "runtime-profile-webllm-style": "WebLLM-style",
    "runtime-profile-transformersjs-style": "Transformers.js-style"
  },
  "exp-stt-whisper-webgpu": {
    "file-transcription-readiness": "File Transcription"
  },
  "exp-rag-browser-pipeline": {
    "browser-rag-fixture": "Browser RAG Fixture"
  },
  "bench-runtime-shootout": {
    "runtime-benchmark-webllm-style": "Runtime Benchmark Winner: WebLLM-style",
    "runtime-benchmark-transformersjs-style": "Runtime Benchmark Winner: Transformers.js-style",
    "runtime-benchmark-ort-webgpu-style": "Runtime Benchmark Winner: ORT WebGPU-style"
  },
  "bench-model-load-and-cache": {
    "model-load-cold": "Cold Load",
    "model-load-warm": "Warm Load"
  },
  "bench-worker-isolation-and-ui-jank": {
    "worker-isolation-main": "Main Thread Burn",
    "worker-isolation-worker": "Worker Burn"
  }
};

function parseArgs(argv) {
  const options = {
    output: "RESULTS.md"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--repo-dir") {
      options.repoDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--output") {
      options.output = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--stdout") {
      options.stdout = true;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (!options.repoDir) {
    throw new Error("Missing required argument: --repo-dir");
  }

  return options;
}

function shortCommit(commit) {
  if (!commit) {
    return "unknown";
  }

  return String(commit).slice(0, 12);
}

function round(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }

  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function formatNumber(value, digits = 2) {
  const rounded = round(value, digits);
  return rounded === null ? "-" : String(rounded);
}

function formatNumberWithUnit(value, unit, digits = 2) {
  const rounded = round(value, digits);
  return rounded === null ? "-" : `${rounded} ${unit}`;
}

function formatBoolean(value) {
  if (value === true) {
    return "true";
  }

  if (value === false) {
    return "false";
  }

  return "unknown";
}

function uniqueValues(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))];
}

function summarizeValues(values, fallback = "-") {
  const unique = uniqueValues(values);
  if (!unique.length) {
    return fallback;
  }

  return unique.length === 1 ? String(unique[0]) : unique.join(", ");
}

function summarizeRange(values, unit = "", digits = 2) {
  const numbers = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (!numbers.length) {
    return "-";
  }

  const min = round(Math.min(...numbers), digits);
  const max = round(Math.max(...numbers), digits);
  const suffix = unit ? ` ${unit}` : "";
  return min === max ? `${min}${suffix}` : `${min} ~ ${max}${suffix}`;
}

function compareRuns(left, right) {
  return new Date(left.meta.timestamp).getTime() - new Date(right.meta.timestamp).getTime();
}

function scenarioLabel(repoName, result) {
  return SCENARIO_LABELS[repoName]?.[result.meta.scenario] || result.meta.scenario;
}

function experimentType(repoName, result) {
  if (repoName.startsWith("bench-")) {
    return "benchmark";
  }

  if (repoName.startsWith("app-")) {
    return "integration";
  }

  const track = result.meta.track;
  if (track === "audio") {
    return "audio";
  }

  if (track === "llm") {
    return "llm";
  }

  if (track === "benchmark") {
    return "benchmark";
  }

  return track || "integration";
}

function runTableMetrics(repoName, result) {
  switch (repoName) {
    case "exp-embeddings-browser-throughput":
      return {
        mean: formatNumber(result.metrics.embeddings?.docs_per_sec),
        p95: formatNumber(result.metrics.embeddings?.p95_ms),
        notes: `queries/s=${formatNumber(result.metrics.embeddings?.queries_per_sec)}, recall@10=${formatNumber(result.metrics.embeddings?.recall_at_10)}, metric=docs/s`
      };
    case "tpl-webgpu-vanilla":
    case "tpl-webgpu-react":
      return {
        mean: formatNumber(result.metrics.graphics?.avg_fps),
        p95: formatNumber(result.metrics.graphics?.p95_frametime_ms),
        notes: `scene_load=${formatNumber(result.metrics.graphics?.scene_load_ms)} ms, fallback=${formatBoolean(result.environment.fallback_triggered)}`
      };
    case "exp-llm-chat-runtime-shootout":
      return {
        mean: formatNumber(result.metrics.llm?.decode_tok_per_sec),
        p95: formatNumber(result.metrics.llm?.ttft_ms),
        notes: `prefill=${formatNumber(result.metrics.llm?.prefill_tok_per_sec)} tok/s, metric=decode tok/s / TTFT ms`
      };
    case "exp-stt-whisper-webgpu":
      return {
        mean: formatNumber(result.metrics.stt?.audio_sec_per_sec),
        p95: formatNumber(result.metrics.stt?.final_latency_ms),
        notes: `first_partial=${formatNumber(result.metrics.stt?.first_partial_ms)} ms, WER=${formatNumber(result.metrics.stt?.wer, 4)}`
      };
    case "exp-rag-browser-pipeline":
      return {
        mean: formatNumber(result.metrics.rag?.answer_total_ms),
        p95: formatNumber(result.metrics.rag?.answer_ttft_ms),
        notes: `retrieve=${formatNumber(result.metrics.rag?.retrieve_ms)} ms, citation_hit_rate=${formatNumber(result.metrics.rag?.citation_hit_rate)}`
      };
    case "bench-runtime-shootout":
      return {
        mean: formatNumber(result.metrics.llm?.decode_tok_per_sec),
        p95: formatNumber(result.metrics.llm?.ttft_ms),
        notes: `winner=${scenarioLabel(repoName, result)}, metric=decode tok/s / TTFT ms`
      };
    case "bench-model-load-and-cache":
      return {
        mean: formatNumber(result.metrics.common?.init_ms),
        p95: "-",
        notes: `cache=${result.environment.cache_state}, preparedHit=${String(result.meta.notes || "").includes("preparedHit=true")}`
      };
    case "bench-worker-isolation-and-ui-jank":
      return {
        mean: formatNumber(result.metrics.graphics?.avg_fps),
        p95: formatNumber(result.metrics.graphics?.p95_frametime_ms),
        notes: `scene_load=${formatNumber(result.metrics.graphics?.scene_load_ms)} ms, worker_mode=${result.environment.worker_mode}`
      };
    default:
      return {
        mean: formatNumber(result.metrics.common?.init_ms),
        p95: "-",
        notes: result.meta.notes || "-"
      };
  }
}

function repoMetricSummary(repoName, results) {
  switch (repoName) {
    case "tpl-webgpu-vanilla":
    case "tpl-webgpu-react":
      return [
        `- avg_fps: ${summarizeRange(results.map((result) => result.metrics.graphics?.avg_fps))}`,
        `- p95_frametime_ms: ${summarizeRange(results.map((result) => result.metrics.graphics?.p95_frametime_ms), "ms")}`,
        `- scene_load_ms: ${summarizeRange(results.map((result) => result.metrics.graphics?.scene_load_ms), "ms")}`,
        `- fallback states: ${summarizeValues(results.map((result) => String(result.environment.fallback_triggered)))}`,
        `- backends: ${summarizeValues(results.map((result) => result.environment.backend))}`
      ];
    case "exp-embeddings-browser-throughput":
      return [
        `- docs_per_sec: ${summarizeRange(results.map((result) => result.metrics.embeddings?.docs_per_sec))}`,
        `- queries_per_sec: ${summarizeRange(results.map((result) => result.metrics.embeddings?.queries_per_sec))}`,
        `- p95_ms: ${summarizeRange(results.map((result) => result.metrics.embeddings?.p95_ms), "ms")}`,
        `- recall_at_10: ${summarizeRange(results.map((result) => result.metrics.embeddings?.recall_at_10))}`,
        `- index_build_ms: ${summarizeRange(results.map((result) => result.metrics.embeddings?.index_build_ms), "ms")}`
      ];
    case "exp-llm-chat-runtime-shootout":
    case "bench-runtime-shootout":
      return [
        `- ttft_ms: ${summarizeRange(results.map((result) => result.metrics.llm?.ttft_ms), "ms")}`,
        `- prefill_tok_per_sec: ${summarizeRange(results.map((result) => result.metrics.llm?.prefill_tok_per_sec), "tok/s")}`,
        `- decode_tok_per_sec: ${summarizeRange(results.map((result) => result.metrics.llm?.decode_tok_per_sec), "tok/s")}`,
        `- turn_latency_ms: ${summarizeRange(results.map((result) => result.metrics.llm?.turn_latency_ms), "ms")}`
      ];
    case "exp-stt-whisper-webgpu":
      return [
        `- audio_sec_per_sec: ${summarizeRange(results.map((result) => result.metrics.stt?.audio_sec_per_sec))}`,
        `- first_partial_ms: ${summarizeRange(results.map((result) => result.metrics.stt?.first_partial_ms), "ms")}`,
        `- final_latency_ms: ${summarizeRange(results.map((result) => result.metrics.stt?.final_latency_ms), "ms")}`,
        `- wer: ${summarizeRange(results.map((result) => result.metrics.stt?.wer), "", 4)}`,
        `- cer: ${summarizeRange(results.map((result) => result.metrics.stt?.cer), "", 4)}`
      ];
    case "exp-rag-browser-pipeline":
      return [
        `- ingest_ms_per_page: ${summarizeRange(results.map((result) => result.metrics.rag?.ingest_ms_per_page), "ms")}`,
        `- chunk_count: ${summarizeRange(results.map((result) => result.metrics.rag?.chunk_count), "", 0)}`,
        `- embed_total_ms: ${summarizeRange(results.map((result) => result.metrics.rag?.embed_total_ms), "ms")}`,
        `- retrieve_ms: ${summarizeRange(results.map((result) => result.metrics.rag?.retrieve_ms), "ms")}`,
        `- rerank_ms: ${summarizeRange(results.map((result) => result.metrics.rag?.rerank_ms), "ms")}`,
        `- answer_total_ms: ${summarizeRange(results.map((result) => result.metrics.rag?.answer_total_ms), "ms")}`,
        `- citation_hit_rate: ${summarizeRange(results.map((result) => result.metrics.rag?.citation_hit_rate))}`
      ];
    case "bench-model-load-and-cache":
      return [
        `- init_ms: ${summarizeRange(results.map((result) => result.metrics.common?.init_ms), "ms")}`,
        `- cache states: ${summarizeValues(results.map((result) => result.environment.cache_state))}`,
        `- prepared hit states: ${summarizeValues(results.map((result) => String(result.meta.notes || "").includes("preparedHit=true")))}`
      ];
    case "bench-worker-isolation-and-ui-jank":
      return [
        `- avg_fps: ${summarizeRange(results.map((result) => result.metrics.graphics?.avg_fps))}`,
        `- p95_frametime_ms: ${summarizeRange(results.map((result) => result.metrics.graphics?.p95_frametime_ms), "ms")}`,
        `- scene_load_ms: ${summarizeRange(results.map((result) => result.metrics.graphics?.scene_load_ms), "ms")}`,
        `- worker modes: ${summarizeValues(results.map((result) => result.environment.worker_mode))}`
      ];
    default:
      return [];
  }
}

function repoObservations(repoName, results) {
  const first = results[0];
  const notes = [];

  if (repoName === "tpl-webgpu-vanilla" || repoName === "tpl-webgpu-react") {
    notes.push(`- starter backend는 ${first.environment.backend}이고 fallback_triggered=${formatBoolean(first.environment.fallback_triggered)}로 기록됐다.`);
    notes.push(`- frame pacing summary는 avg_fps=${formatNumber(first.metrics.graphics?.avg_fps)}, p95_frametime_ms=${formatNumber(first.metrics.graphics?.p95_frametime_ms)}였다.`);
  } else if (repoName === "exp-embeddings-browser-throughput") {
    const cold = results.find((result) => result.environment.cache_state === "cold");
    const warm = results.find((result) => result.environment.cache_state === "warm");
    if (cold && warm) {
      const delta = round((warm.metrics.embeddings?.docs_per_sec || 0) - (cold.metrics.embeddings?.docs_per_sec || 0));
      notes.push(`- warm run docs_per_sec는 ${formatNumber(warm.metrics.embeddings?.docs_per_sec)}이고 cold 대비 delta는 ${formatNumber(delta)}였다.`);
      notes.push(`- recall@10은 cold=${formatNumber(cold.metrics.embeddings?.recall_at_10)}, warm=${formatNumber(warm.metrics.embeddings?.recall_at_10)}로 유지됐다.`);
    }
  } else if (repoName === "exp-llm-chat-runtime-shootout") {
    const sorted = [...results].sort((left, right) => (right.metrics.llm?.decode_tok_per_sec || 0) - (left.metrics.llm?.decode_tok_per_sec || 0));
    notes.push(`- 최고 decode throughput은 ${scenarioLabel(repoName, sorted[0])}의 ${formatNumber(sorted[0].metrics.llm?.decode_tok_per_sec)} tok/s였다.`);
    notes.push(`- 가장 낮은 TTFT는 ${scenarioLabel(repoName, [...results].sort((left, right) => (left.metrics.llm?.ttft_ms || 0) - (right.metrics.llm?.ttft_ms || 0))[0])}에서 관찰됐다.`);
  } else if (repoName === "exp-stt-whisper-webgpu") {
    notes.push(`- partial emission은 ${formatNumber(first.metrics.stt?.first_partial_ms)} ms에 시작됐고 최종 latency는 ${formatNumber(first.metrics.stt?.final_latency_ms)} ms였다.`);
    notes.push(`- deterministic transcript fixture 기준 WER=${formatNumber(first.metrics.stt?.wer, 4)}, CER=${formatNumber(first.metrics.stt?.cer, 4)}가 기록됐다.`);
  } else if (repoName === "exp-rag-browser-pipeline") {
    notes.push(`- end-to-end answer_total_ms는 ${formatNumber(first.metrics.rag?.answer_total_ms)} ms, citation_hit_rate는 ${formatNumber(first.metrics.rag?.citation_hit_rate)}였다.`);
    notes.push(`- 이 baseline은 fixture 기반 extractive answer여서 retrieval/rerank 경로 검증용으로 해석하는 편이 맞다.`);
  } else if (repoName === "bench-runtime-shootout") {
    notes.push(`- benchmark draft winner는 ${scenarioLabel(repoName, first)}였고 decode_tok_per_sec=${formatNumber(first.metrics.llm?.decode_tok_per_sec)}였다.`);
    notes.push(`- 비교 세부값은 raw JSON meta.notes에 profile별 TTFT/decode/turn latency로 함께 남겼다.`);
  } else if (repoName === "bench-model-load-and-cache") {
    const cold = results.find((result) => result.environment.cache_state === "cold");
    const warm = results.find((result) => result.environment.cache_state === "warm");
    if (cold && warm) {
      const delta = round((cold.metrics.common?.init_ms || 0) - (warm.metrics.common?.init_ms || 0));
      notes.push(`- cold init_ms=${formatNumber(cold.metrics.common?.init_ms)} ms, warm init_ms=${formatNumber(warm.metrics.common?.init_ms)} ms, delta=${formatNumber(delta)} ms였다.`);
      notes.push(`- warm run meta.notes에는 preparedHit=true가 남아 cache reuse 경로가 실제로 기록됐다.`);
    }
  } else if (repoName === "bench-worker-isolation-and-ui-jank") {
    const main = results.find((result) => result.environment.worker_mode === "main");
    const worker = results.find((result) => result.environment.worker_mode === "worker");
    if (main && worker) {
      notes.push(`- worker run avg_fps=${formatNumber(worker.metrics.graphics?.avg_fps)}, main run avg_fps=${formatNumber(main.metrics.graphics?.avg_fps)}였다.`);
      notes.push(`- p95 frametime은 main=${formatNumber(main.metrics.graphics?.p95_frametime_ms)} ms, worker=${formatNumber(worker.metrics.graphics?.p95_frametime_ms)} ms로 비교됐다.`);
    }
  }

  const captureContext = first.meta.capture_context;
  if (captureContext) {
    notes.push(`- ${captureContext.tool}로 수집된 automation baseline이며 headless=${formatBoolean(captureContext.headless)}, browser=${captureContext.browser_name || first.environment.browser?.name} ${captureContext.browser_version || first.environment.browser?.version}.`);
  } else {
    notes.push(`- automation baseline capture로 seed된 첫 raw result이며 브라우저는 ${first.environment.browser?.name || "unknown"} ${first.environment.browser?.version || ""} 환경이었다.`);
  }

  notes.push("- 실제 runtime/model/renderer 교체 전 deterministic harness 결과이므로, 절대 성능보다 보고 경로와 재현성 확인에 우선 의미가 있다.");
  return notes;
}

function repoConclusions(repoName, results) {
  switch (repoName) {
    case "tpl-webgpu-vanilla":
      return [
        "- raw WebGPU starter의 첫 baseline raw result와 summary 문서가 연결됐다.",
        "- 다음 단계는 같은 결과 형식을 유지한 채 downstream raw WebGPU 실험 저장소로 전파하는 것이다.",
        "- 실제 device/browser 다변화와 WebGPU/fallback 비교를 추가해야 템플릿 검증이 충분해진다."
      ];
    case "tpl-webgpu-react":
      return [
        "- React WebGPU starter도 첫 baseline raw result와 summary 문서를 갖게 됐다.",
        "- 다음 단계는 build-driven React repo로 승격하면서 동일 결과 구조를 유지하는 것이다.",
        "- 실제 app repo에서 state, worker, cache 경로를 덧붙여야 템플릿 검증이 완료된다."
      ];
    case "exp-embeddings-browser-throughput":
      return [
        "- cold/warm embeddings baseline 결과와 문서화 경로가 처음으로 연결됐다.",
        "- 다음 단계는 synthetic embedder를 실제 browser runtime으로 치환하고 동일한 결과 파일명을 유지하는 것이다.",
        "- WebGPU vs fallback 비교는 실제 runtime integration 후 같은 fixture로 추가해야 한다."
      ];
    case "exp-llm-chat-runtime-shootout":
      return [
        "- runtime readiness 비교가 raw JSON과 RESULTS.md 둘 다에서 반복 가능해졌다.",
        "- 다음 단계는 WebLLM, Transformers.js, ORT 계열 실제 runtime을 같은 prompt budget으로 연결하는 것이다.",
        "- worker/main mode 차이는 유지하되 실제 model load와 cache state를 추가 기록해야 한다."
      ];
    case "exp-stt-whisper-webgpu":
      return [
        "- 파일 전사 baseline의 timing, transcript, error scoring 경로가 실제 결과로 고정됐다.",
        "- 다음 단계는 Whisper runtime과 real audio asset을 연결해 같은 보고 포맷으로 교체하는 것이다.",
        "- partial latency와 final latency를 브라우저/모드별로 반복 측정할 필요가 있다."
      ];
    case "exp-rag-browser-pipeline":
      return [
        "- deterministic RAG pipeline baseline의 raw result와 요약 문서가 처음으로 채워졌다.",
        "- 다음 단계는 실제 embedder, retriever, reranker를 붙여 같은 질문 세트를 유지하는 것이다.",
        "- citation hit-rate와 answer latency를 브라우저별로 누적해야 계획 기준에 도달한다."
      ];
    case "bench-runtime-shootout":
      return [
        "- fixed-scenario runtime benchmark draft가 raw artifact와 summary 문서 양쪽에서 재현 가능해졌다.",
        "- 다음 단계는 synthetic profile을 실제 runtime implementation으로 바꾸되 동일한 prompt/output budget을 유지하는 것이다.",
        "- benchmark summary v1을 만들려면 추가 브라우저와 cache-state 반복 측정이 필요하다."
      ];
    case "bench-model-load-and-cache":
      return [
        "- cold/warm load delta가 처음으로 raw JSON과 RESULTS.md 둘 다에 기록됐다.",
        "- 다음 단계는 실제 model asset과 cache eviction 조건을 추가해 warm hit/miss 경계를 더 분명히 하는 것이다.",
        "- 브라우저별 storage path 차이와 fallback mode를 별도 결과로 누적해야 한다."
      ];
    case "bench-worker-isolation-and-ui-jank":
      return [
        "- main vs worker jank benchmark baseline이 실제 raw 결과와 summary 문서로 연결됐다.",
        "- 다음 단계는 실제 inference/compute workload를 같은 harness에 붙여 responsiveness 차이를 재측정하는 것이다.",
        "- 입력 지연과 frame pacing을 브라우저/디바이스별로 누적해야 계획 기준에 맞는다."
      ];
    default:
      return [
        "- 첫 raw result와 summary 문서가 연결됐다.",
        "- 다음 단계는 deterministic harness를 실제 workload로 교체하는 것이다.",
        "- 브라우저와 cache-state 반복 측정이 더 필요하다."
      ];
  }
}

function buildMarkdown(repoName, results, artifacts) {
  const sortedResults = [...results].sort(compareRuns);
  const first = sortedResults[0];
  const last = sortedResults[sortedResults.length - 1];
  const status = sortedResults.every((result) => result.status === "success")
    ? "success"
    : sortedResults.some((result) => result.status === "failed")
      ? "failed"
      : "partial";
  const type = experimentType(repoName, first);
  const commits = summarizeValues(sortedResults.map((result) => shortCommit(result.meta.commit)));
  const timestamps = `${first.meta.timestamp} -> ${last.meta.timestamp}`;
  const browser = `${first.environment.browser?.name || "Unknown"} ${first.environment.browser?.version || "unknown"}`;
  const os = `${first.environment.os?.name || "Unknown"} ${first.environment.os?.version || "unknown"}`;
  const device = first.environment.device || {};
  const gpu = first.environment.gpu || {};
  const workloadValues = {
    scenarios: sortedResults.map((result) => scenarioLabel(repoName, result)),
    inputProfiles: sortedResults.map((result) => result.workload?.input_profile),
    datasets: sortedResults.map((result) => result.workload?.dataset),
    modelIds: sortedResults.map((result) => result.workload?.model_id),
    quantizations: sortedResults.map((result) => result.workload?.quantization),
    resolutions: sortedResults.map((result) => result.workload?.resolution),
    contextTokens: sortedResults.map((result) => result.workload?.context_tokens),
    outputTokens: sortedResults.map((result) => result.workload?.output_tokens)
  };

  const tableRows = sortedResults.map((result, index) => {
    const metrics = runTableMetrics(repoName, result);
    return `| ${index + 1} | ${scenarioLabel(repoName, result)} | ${result.environment.backend || "-"} | ${result.environment.cache_state || "-"} | ${metrics.mean} | ${metrics.p95} | ${metrics.notes} |`;
  }).join("\n");

  const attachments = {
    screenshots: artifacts.screenshots.length ? artifacts.screenshots.join(", ") : "-",
    logs: artifacts.logs.length ? artifacts.logs.join(", ") : "-",
    rawJson: artifacts.raw.length ? artifacts.raw.join(", ") : "-",
    deployUrls: summarizeValues(sortedResults.map((result) => result.artifacts?.deploy_url)),
    relatedIssues: summarizeValues(sortedResults.map((result) => result.artifacts?.related_issue)),
    relatedPrs: summarizeValues(sortedResults.map((result) => result.artifacts?.related_pr))
  };

  const lines = [
    "# Results",
    "",
    "## 1. 실험 요약",
    `- 저장소: ${repoName}`,
    `- 커밋 해시: ${commits}`,
    `- 실험 일시: ${timestamps}`,
    `- 담당자: ${summarizeValues(sortedResults.map((result) => result.meta.owner))}`,
    `- 실험 유형: \`${type}\``,
    `- 상태: \`${status}\``,
    "",
    "## 2. 질문",
    ...(REPO_QUESTIONS[repoName] || ["- 첫 baseline raw result를 실제 문서와 연결할 수 있는가"]).map((question) => `- ${question}`),
    "",
    "## 3. 실행 환경",
    "### 브라우저",
    `- 이름: ${browser.split(" ").slice(0, -1).join(" ") || first.environment.browser?.name || "Unknown"}`,
    `- 버전: ${first.environment.browser?.version || "unknown"}`,
    "",
    "### 운영체제",
    `- OS: ${first.environment.os?.name || "Unknown"}`,
    `- 버전: ${first.environment.os?.version || "unknown"}`,
    "",
    "### 디바이스",
    `- 장치명: ${device.name || "unknown"}`,
    `- device class: \`${device.class || "unknown"}\``,
    `- CPU: ${device.cpu || "unknown"}`,
    `- 메모리: ${device.memory_gb ? `${device.memory_gb} GB` : "unknown"}`,
    `- 전원 상태: \`${device.power_mode || "unknown"}\``,
    "",
    "### GPU / 실행 모드",
    `- adapter: ${gpu.adapter || "unknown"}`,
    `- backend: \`${first.environment.backend || "unknown"}\``,
    `- fallback triggered: \`${formatBoolean(first.environment.fallback_triggered)}\``,
    `- worker mode: \`${summarizeValues(sortedResults.map((result) => result.environment.worker_mode), "unknown")}\``,
    `- cache state: \`${summarizeValues(sortedResults.map((result) => result.environment.cache_state), "unknown")}\``,
    `- required features: ${JSON.stringify(gpu.required_features || [])}`,
    `- limits snapshot: ${JSON.stringify(gpu.limits || {})}`,
    "",
    "## 4. 워크로드 정의",
    `- 시나리오 이름: ${summarizeValues(workloadValues.scenarios)}`,
    `- 입력 프로필: ${summarizeValues(workloadValues.inputProfiles)}`,
    `- 데이터 크기: ${summarizeValues(sortedResults.map((result) => result.meta.notes))}`,
    `- dataset: ${summarizeValues(workloadValues.datasets)}`,
    `- model_id 또는 renderer: ${summarizeValues(workloadValues.modelIds)}`,
    `- 양자화/정밀도: ${summarizeValues(workloadValues.quantizations)}`,
    `- resolution: ${summarizeValues(workloadValues.resolutions)}`,
    `- context_tokens: ${summarizeValues(workloadValues.contextTokens)}`,
    `- output_tokens: ${summarizeValues(workloadValues.outputTokens)}`,
    "",
    "## 5. 측정 지표",
    "### 공통",
    `- time_to_interactive_ms: ${summarizeRange(sortedResults.map((result) => result.metrics.common?.time_to_interactive_ms), "ms")}`,
    `- init_ms: ${summarizeRange(sortedResults.map((result) => result.metrics.common?.init_ms), "ms")}`,
    `- success_rate: ${summarizeRange(sortedResults.map((result) => result.metrics.common?.success_rate))}`,
    `- peak_memory_note: ${summarizeValues(sortedResults.map((result) => result.metrics.common?.peak_memory_note))}`,
    `- error_type: ${summarizeValues(sortedResults.map((result) => result.metrics.common?.error_type))}`,
    "",
    `### ${type === "benchmark" && repoName === "bench-worker-isolation-and-ui-jank" ? "Graphics / Blackhole" : type === "llm" || repoName === "bench-runtime-shootout" || repoName === "bench-model-load-and-cache" ? "LLM / Benchmark" : type === "audio" ? "STT" : type === "ml" && repoName === "exp-rag-browser-pipeline" ? "RAG" : type === "ml" ? "Embeddings / ML" : "Workload"}`,
    ...repoMetricSummary(repoName, sortedResults),
    "",
    "## 6. 결과 표",
    "| Run | Scenario | Backend | Cache | Mean | P95 | Notes |",
    "|---|---|---:|---:|---:|---:|---|",
    tableRows,
    "",
    "## 7. 관찰",
    ...repoObservations(repoName, sortedResults),
    "",
    "## 8. 결론",
    ...repoConclusions(repoName, sortedResults),
    "",
    "## 9. 첨부",
    `- 스크린샷: ${attachments.screenshots}`,
    `- 로그 파일: ${attachments.logs}`,
    `- raw json: ${attachments.rawJson}`,
    `- 배포 URL: ${attachments.deployUrls}`,
    `- 관련 이슈/PR: ${[attachments.relatedIssues, attachments.relatedPrs].filter((item) => item && item !== "-").join(", ") || "-"}`,
    ""
  ];

  return lines.join("\n");
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function listRelativeFiles(rootDir, relativeDir, extension) {
  const absoluteDir = path.join(rootDir, relativeDir);
  try {
    const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
      .map((entry) => `./${path.posix.join(relativeDir, entry.name)}`)
      .sort();
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function renderResultsSummary({ repoDir, output = "RESULTS.md" }) {
  const rawDir = path.join(repoDir, "reports", "raw");
  const entries = await fs.readdir(rawDir, { withFileTypes: true });
  const rawFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(rawDir, entry.name))
    .sort();

  if (!rawFiles.length) {
    throw new Error(`No raw JSON files found in ${rawDir}`);
  }

  const results = [];
  for (const filePath of rawFiles) {
    results.push(await readJson(filePath));
  }

  results.sort(compareRuns);
  const repoName = results[0].meta.repo || path.basename(repoDir);
  const markdown = buildMarkdown(repoName, results, {
    raw: await listRelativeFiles(repoDir, "reports/raw", ".json"),
    screenshots: await listRelativeFiles(repoDir, "reports/screenshots", ".png"),
    logs: await listRelativeFiles(repoDir, "reports/logs", ".log")
  });

  await fs.writeFile(path.join(repoDir, output), markdown, "utf8");
  return markdown;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const markdown = await renderResultsSummary({
    repoDir: path.resolve(options.repoDir),
    output: options.output
  });

  if (options.stdout) {
    process.stdout.write(markdown);
  }
}

try {
  if (import.meta.url === `file://${process.argv[1]}`) {
    await main();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
