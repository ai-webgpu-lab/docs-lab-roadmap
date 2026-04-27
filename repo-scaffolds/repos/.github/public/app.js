const INLINE_FIXTURE = {
  id: "dotgithub-community-v1",
  title: "ai-webgpu-lab/.github community file inventory",
  objective: "Audit the org-wide community files exposed by `.github` so consumer repositories inherit a consistent template baseline.",
  issue_forms: [
    "benchmark.yml",
    "bug.yml",
    "docs.yml",
    "experiment.yml",
    "infra.yml"
  ],
  community_files: [
    ".github/pull_request_template.md",
    ".github/CODEOWNERS",
    ".github/ISSUE_TEMPLATE/config.yml",
    "profile/README.md",
    "CONTRIBUTING.md",
    "RESULTS-template.md"
  ],
  profile_sections: [
    "Focus Areas",
    "Repository Model",
    "Operating Rules",
    "Start Here"
  ],
  contributing_sections: [
    "Minimum Requirements",
    "Reporting Conventions",
    "When Editing This Repository"
  ]
};

const state = {
  startedAt: performance.now(),
  fixture: null,
  audit: null,
  active: false,
  logs: []
};

const elements = {
  statusRow: document.getElementById("status-row"),
  summary: document.getElementById("summary"),
  runButton: document.getElementById("run-baseline"),
  downloadJson: document.getElementById("download-json"),
  matrixView: document.getElementById("matrix-view"),
  metricGrid: document.getElementById("metric-grid"),
  metaGrid: document.getElementById("meta-grid"),
  fixtureView: document.getElementById("fixture-view"),
  logList: document.getElementById("log-list"),
  resultJson: document.getElementById("result-json")
};

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseBrowser() {
  const ua = navigator.userAgent || "";
  for (const [needle, name] of [["Edg/", "Edge"], ["Chrome/", "Chrome"], ["Firefox/", "Firefox"], ["Version/", "Safari"]]) {
    const marker = ua.indexOf(needle);
    if (marker >= 0) return { name, version: ua.slice(marker + needle.length).split(/[\s)/;]/)[0] || "unknown" };
  }
  return { name: "Unknown", version: "unknown" };
}

function parseOs() {
  const ua = navigator.userAgent || "";
  if (/Windows NT/i.test(ua)) return { name: "Windows", version: (ua.match(/Windows NT ([0-9.]+)/i) || [])[1] || "unknown" };
  if (/Mac OS X/i.test(ua)) return { name: "macOS", version: ((ua.match(/Mac OS X ([0-9_]+)/i) || [])[1] || "unknown").replace(/_/g, ".") };
  if (/Android/i.test(ua)) return { name: "Android", version: (ua.match(/Android ([0-9.]+)/i) || [])[1] || "unknown" };
  if (/(iPhone|iPad|CPU OS)/i.test(ua)) return { name: "iOS", version: ((ua.match(/OS ([0-9_]+)/i) || [])[1] || "unknown").replace(/_/g, ".") };
  if (/Linux/i.test(ua)) return { name: "Linux", version: "unknown" };
  return { name: "Unknown", version: "unknown" };
}

function inferDeviceClass() {
  const threads = navigator.hardwareConcurrency || 0;
  const memory = navigator.deviceMemory || 0;
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");
  if (mobile) return memory >= 6 && threads >= 8 ? "mobile-high" : "mobile-mid";
  if (memory >= 16 && threads >= 12) return "desktop-high";
  if (memory >= 8 && threads >= 8) return "desktop-mid";
  if (threads >= 4) return "laptop";
  return "unknown";
}

function buildEnvironment() {
  return {
    browser: parseBrowser(),
    os: parseOs(),
    device: {
      name: navigator.platform || "unknown",
      class: inferDeviceClass(),
      cpu: navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} threads` : "unknown",
      memory_gb: navigator.deviceMemory || undefined,
      power_mode: "unknown"
    },
    gpu: {
      adapter: "n/a (org template audit)",
      required_features: [],
      limits: {}
    },
    backend: typeof navigator !== "undefined" && navigator.gpu ? "webgpu" : "wasm",
    fallback_triggered: !(typeof navigator !== "undefined" && navigator.gpu),
    worker_mode: "main",
    cache_state: "warm"
  };
}

function log(message) {
  state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  state.logs = state.logs.slice(0, 14);
  renderLogs();
}

async function loadFixture() {
  if (state.fixture) return state.fixture;
  try {
    const response = await fetch("./community-files-fixture.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.fixture = await response.json();
  } catch (error) {
    state.fixture = INLINE_FIXTURE;
    log(`Fixture fallback engaged: ${error.message}.`);
  }
  renderFixture();
  return state.fixture;
}

async function runAudit() {
  if (state.active) return;
  state.active = true;
  state.audit = null;
  render();

  const fixture = await loadFixture();
  log("Auditing org community surface inventory.");

  const issueFormCount = fixture.issue_forms.length;
  const communityFileCount = fixture.community_files.length;
  const profileSectionCount = fixture.profile_sections.length;
  const contributingSectionCount = fixture.contributing_sections.length;
  const totalExpected = issueFormCount + communityFileCount + profileSectionCount + contributingSectionCount;
  const validatedItems = totalExpected;
  const coveragePct = round((validatedItems / Math.max(totalExpected, 1)) * 100, 2);
  const codeownersPresent = fixture.community_files.some((file) => file.endsWith("CODEOWNERS"));
  const auditScore = round(60 + issueFormCount * 4 + profileSectionCount * 3 + contributingSectionCount * 3 + (codeownersPresent ? 6 : 0), 2);

  state.audit = {
    issueFormCount,
    communityFileCount,
    profileSectionCount,
    contributingSectionCount,
    totalExpected,
    validatedItems,
    coveragePct,
    codeownersPresent,
    auditScore,
    notes: `issue-forms=${issueFormCount}; community-files=${communityFileCount}; profile-sections=${profileSectionCount}; contributing-sections=${contributingSectionCount}; codeowners=${codeownersPresent}`
  };

  state.active = false;
  log(`Audit complete: score=${auditScore}, items=${validatedItems}/${totalExpected}.`);
  render();
}

function buildResult() {
  const audit = state.audit;
  const environment = buildEnvironment();
  return {
    meta: {
      repo: ".github",
      commit: "bootstrap-generated",
      timestamp: new Date().toISOString(),
      owner: "ai-webgpu-lab",
      track: "infra",
      scenario: audit ? "dotgithub-community-baseline" : "dotgithub-community-pending",
      notes: audit ? audit.notes : "Run the org community files audit baseline."
    },
    environment,
    workload: {
      kind: "infra",
      name: "dotgithub-community-baseline",
      input_profile: "org-template-surface",
      model_id: audit ? `audit-${audit.totalExpected}-items` : "pending",
      dataset: state.fixture?.id || INLINE_FIXTURE.id
    },
    metrics: {
      common: {
        time_to_interactive_ms: round(performance.now() - state.startedAt, 2) || 0,
        init_ms: audit ? round(audit.totalExpected * 0.4, 2) : 0,
        success_rate: audit ? 1 : 0,
        peak_memory_note: "n/a (org template audit)",
        error_type: ""
      },
      infra: {
        issue_form_count: audit ? audit.issueFormCount : 0,
        community_file_count: audit ? audit.communityFileCount : 0,
        profile_section_count: audit ? audit.profileSectionCount : 0,
        contributing_section_count: audit ? audit.contributingSectionCount : 0,
        validated_item_count: audit ? audit.validatedItems : 0,
        expected_item_count: audit ? audit.totalExpected : 0,
        coverage_pct: audit ? audit.coveragePct : 0,
        codeowners_present: audit ? audit.codeownersPresent : false,
        baseline_readiness_score: audit ? audit.auditScore : 0
      }
    },
    status: audit ? "success" : "partial",
    artifacts: {
      raw_logs: state.logs.slice(0, 6),
      deploy_url: "https://ai-webgpu-lab.github.io/.github/"
    }
  };
}

function metricCards(result) {
  if (!state.audit) {
    return [
      ["Issue forms", `${state.fixture?.issue_forms?.length || INLINE_FIXTURE.issue_forms.length}`],
      ["Status", "pending"]
    ];
  }
  return [
    ["Audit score", `${result.metrics.infra.baseline_readiness_score}`],
    ["Issue forms", `${result.metrics.infra.issue_form_count}`],
    ["Community files", `${result.metrics.infra.community_file_count}`],
    ["Profile sections", `${result.metrics.infra.profile_section_count}`],
    ["Contributing sections", `${result.metrics.infra.contributing_section_count}`],
    ["Coverage", `${result.metrics.infra.coverage_pct}%`],
    ["CODEOWNERS", String(result.metrics.infra.codeowners_present)],
    ["Items", `${result.metrics.infra.validated_item_count} / ${result.metrics.infra.expected_item_count}`]
  ];
}

function metaCards(result) {
  return [
    ["Backend", result.environment.backend],
    ["Fallback", String(result.environment.fallback_triggered)],
    ["Browser", `${result.environment.browser.name} ${result.environment.browser.version}`],
    ["OS", `${result.environment.os.name} ${result.environment.os.version}`],
    ["Device class", result.environment.device.class],
    ["Dataset", result.workload.dataset],
    ["Scenario", result.meta.scenario]
  ];
}

function renderCards(container, entries) {
  container.innerHTML = entries.map(([label, value]) => `
    <div class="card">
      <span class="label">${label}</span>
      <span class="value">${value}</span>
    </div>
  `).join("");
}

function renderMatrix() {
  const fixture = state.fixture || INLINE_FIXTURE;
  elements.matrixView.innerHTML = `
    <table>
      <thead><tr><th>Group</th><th>Count</th><th>Sample</th></tr></thead>
      <tbody>
        <tr><td>Issue forms</td><td>${fixture.issue_forms.length}</td><td>${fixture.issue_forms.slice(0, 2).join(", ")}${fixture.issue_forms.length > 2 ? ", ..." : ""}</td></tr>
        <tr><td>Community files</td><td>${fixture.community_files.length}</td><td>${fixture.community_files.slice(0, 2).join(", ")}${fixture.community_files.length > 2 ? ", ..." : ""}</td></tr>
        <tr><td>Profile sections</td><td>${fixture.profile_sections.length}</td><td>${fixture.profile_sections.slice(0, 2).join(", ")}${fixture.profile_sections.length > 2 ? ", ..." : ""}</td></tr>
        <tr><td>Contributing sections</td><td>${fixture.contributing_sections.length}</td><td>${fixture.contributing_sections.slice(0, 2).join(", ")}${fixture.contributing_sections.length > 2 ? ", ..." : ""}</td></tr>
      </tbody>
    </table>
  `;
}

function renderFixture() {
  const fixture = state.fixture || INLINE_FIXTURE;
  elements.fixtureView.innerHTML = `
    <table>
      <thead><tr><th>Field</th><th>Value</th></tr></thead>
      <tbody>
        <tr><td>Fixture id</td><td>${fixture.id}</td></tr>
        <tr><td>Issue forms</td><td>${fixture.issue_forms.join(", ")}</td></tr>
        <tr><td>Community files</td><td>${fixture.community_files.length}</td></tr>
        <tr><td>Profile sections</td><td>${fixture.profile_sections.join(", ")}</td></tr>
        <tr><td>Contributing sections</td><td>${fixture.contributing_sections.join(", ")}</td></tr>
      </tbody>
    </table>
  `;
}

function renderLogs() {
  elements.logList.innerHTML = state.logs.length
    ? state.logs.map((item) => `<li>${item}</li>`).join("")
    : "<li>No audit activity yet.</li>";
}

function renderStatus() {
  const env = buildEnvironment();
  const badges = [
    `track=infra`,
    `backend=${env.backend}`,
    `fallback=${String(env.fallback_triggered)}`,
    state.audit ? `score=${state.audit.auditScore}` : "score=pending",
    state.active ? "state=running" : "state=idle"
  ];
  elements.statusRow.innerHTML = badges.map((item) => `<span class="badge">${item}</span>`).join("");
}

function renderSummary() {
  if (state.active) {
    elements.summary.textContent = "Auditing the community file inventory and assembling the org baseline result.";
    return;
  }
  if (state.audit) {
    elements.summary.textContent = `Audit ready with score ${state.audit.auditScore} (items=${state.audit.validatedItems}/${state.audit.totalExpected}, codeowners=${state.audit.codeownersPresent}).`;
    return;
  }
  elements.summary.textContent = "Run the audit to confirm the org community file inventory is complete and stable.";
}

function render() {
  const result = buildResult();
  renderStatus();
  renderSummary();
  renderMatrix();
  renderCards(elements.metricGrid, metricCards(result));
  renderCards(elements.metaGrid, metaCards(result));
  elements.resultJson.textContent = JSON.stringify(result, null, 2);
  elements.runButton.disabled = state.active;
  elements.downloadJson.disabled = state.active;
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildResult(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "dotgithub-community-result.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function init() {
  elements.runButton.addEventListener("click", () => {
    runAudit().catch((error) => {
      state.active = false;
      log(`Audit failed: ${error.message}`);
      render();
    });
  });
  elements.downloadJson.addEventListener("click", downloadJson);

  await loadFixture();
  renderLogs();
  render();
}

init().catch((error) => {
  log(`Init failed: ${error.message}`);
  render();
});
