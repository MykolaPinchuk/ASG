# agent_logs/current.md

## Agent
- id: agent03

## Timestamp (Pacific)
- start: 2026-01-27

## Intent
- Continue pre-v1 hardening on `v05`: reduce `openai_compat` provider/parse errors and keep OSS eval tooling stable.

## Notes
- Do not commit secrets or bulky artifacts (see `.gitignore`).

## Log

- 2026-01-27 16:04:52 PST — Onboarded (read current state + MVP spec; focused files: `src/providers/openaiCompat.ts`, `src/cli/agentVsRandom.ts`, `src/llm/models.ts`, `viewer/index.html`). Next: run quick `typecheck` + 1 short match smoke; then pick a small, measurable reliability slice (parsing edge cases or retries) and validate via `analyze:agent-io`.
- 2026-01-27 19:40:00 PST — OSS hardening: added streaming early-stop, stricter response validation, better retries/failover, and raised non-sweep defaults (`--max-tokens=600`, client timeout=70s). Ran multi-model micro-sweeps (NanoGPT + Chutes) and root-caused common failures (timeouts + “budget-empty” empty outputs). Documentation: `docs/diagnostics/2026-01-27_oss_openai_compat_debugging.md`.
- 2026-01-27 19:40:30 PST — Removed strategy-like prompt guidance to keep prompts mechanics-only (per evaluation fairness requirement): checkpoint `cd39e17`.
- 2026-01-27 19:45:00 PST — Re-ran the same multi-model micro-sweeps with strategy guidance removed; win-rate gains largely disappeared (confirming the wins were driven by hints). New sweep outputs: `runs/live/sweep_agent03_nanogpt_noStrategy_2026-01-28T13-00-01Z.jsonl` and `runs/live/sweep_agent03_chutes_noStrategy_2026-01-28T13-08-07Z.jsonl`. Notes added to `docs/diagnostics/2026-01-27_oss_openai_compat_debugging.md`.
