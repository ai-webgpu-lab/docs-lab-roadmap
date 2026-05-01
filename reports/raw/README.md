# Phase 3 Real Measurement Drop Zone

This directory holds **real browser measurement results** committed during Phase 3.
Files placed here are picked up by `scripts/render-benchmark-summary.mjs` and
listed under "Future real runs" in `docs/BENCHMARK-SUMMARY.md`. They are the
required source for promoting a "pending real run" row to a measured row.

## Layout

```
reports/raw/
  <repo-name>/
    <env>-<cache_state>-<timestamp>.json
```

Examples:

```
reports/raw/bench-runtime-shootout/chromium146-cold-2026-05-15T12-34-56Z.json
reports/raw/bench-runtime-shootout/chromium146-warm-2026-05-15T12-40-12Z.json
reports/raw/exp-stt-whisper-webgpu/firefox-nightly-cold-2026-05-16T08-00-00Z.json
```

## Required JSON shape

Every file MUST conform to `docs/RESULT-SCHEMA.md`. The required top-level
fields are `meta`, `environment`, `workload`, `metrics`, `status`, and
`artifacts`. `scripts/validate-result-schema.mjs` runs in CI and rejects
files that miss any required field.

## Capture procedure (manual, current)

The current pending real-measurement queue is `bench-runtime-shootout`,
`exp-stt-whisper-webgpu`, and `bench-renderer-shootout` (see
`docs/BENCHMARK-SUMMARY.md` "pending real run" rows).

1. Open the repo's deployed Pages URL with the real-mode query, e.g.
   `https://ai-webgpu-lab.github.io/bench-runtime-shootout/?mode=real-runtime`.
2. Reload once to capture cold; do not clear cache then reload again to
   capture warm in the same browser session.
3. Export the harness JSON (the harness logs a copy-ready block to the
   browser console when a run finishes).
4. Drop the JSON into `reports/raw/<repo>/<env>-<cache_state>-<timestamp>.json`.
5. Run `node scripts/validate-result-schema.mjs` and fix any reported gaps.
6. Run `node scripts/render-benchmark-summary.mjs` — the new file should
   appear under "Raw Result Index" and the matching pending row should
   collapse into a measured row.
7. Commit the JSON together with the regenerated dashboard.

## Notes

- Do not commit screenshots or logs here. Use `reports/screenshots/` and
  `reports/logs/` instead, then link them via `artifacts.*` in the JSON.
- Deterministic regression anchors stay in `tests/fixtures/results/`. Files
  here are exclusively real-browser captures with non-synthetic adapters.
- The per-repo `.gitkeep` files exist only to keep the empty drop slots
  tracked. Delete the `.gitkeep` in the same commit that adds the first
  real JSON for that repo — it has served its purpose once measured
  evidence lands.
