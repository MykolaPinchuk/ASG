# 2026-01-30 — Cerebras `gpt-oss-120b` repeatability (v06)

Goal: establish whether Cerebras `gpt-oss-120b` is repeatably strong **and** reliably produces valid turns (low PASS/error) under the v0/v0.x guardrails.

## Config (fixed)

- Scenario: `scenarios/scenario_01.json`
- Opponent: `mix`
- Horizon: `turnCapPlies=30`
- Seeds: `3..7` (5 games; max allowed by default guardrails)
- Provider: `cerebras` (OpenAI-compatible)
- Base URL: `https://api.cerebras.ai/v1`
- Request shape:
  - `--reasoning-effort high`
  - `--max-tokens 8000`
  - `--use-tools false`
  - `--tools-mode off`
  - `--stream off`
  - `--timeout-ms 70000`
  - `--temperature 0`
  - `--prompt-mode compact`

Command (no secrets):

```bash
npm run -s agent:eval-vs-mix -- \
  --provider-name cerebras \
  --base-url https://api.cerebras.ai/v1 \
  --keys-file secrets/provider_apis.txt \
  --models gpt-oss-120b \
  --opponent mix \
  --seed 3 \
  --games 5 \
  --turn-cap-plies 30 \
  --timeout-ms 70000 \
  --max-tokens 8000 \
  --temperature 0 \
  --prompt-mode compact \
  --use-tools false \
  --tools-mode off \
  --stream off \
  --reasoning-effort high \
  --stop-after-errors 100 \
  --replays-dir replays/model_evals/cerebras_gpt-oss-120b_repeatability_2026-01-30T23-24-49-476Z \
  --out runs/experiments/cerebras_gpt-oss-120b_repeatability_2026-01-30T23-24-49-476Z.json
```

Outputs:
- Replays: `replays/model_evals/cerebras_gpt-oss-120b_repeatability_2026-01-30T23-24-49-476Z`
- Run summary JSON: `runs/experiments/cerebras_gpt-oss-120b_repeatability_2026-01-30T23-24-49-476Z.json`

## Results (from `npm run -s analyze:replays`)

Summary (5 games):
- Outcomes: 4 win / 1 draw / 0 loss (win rate 80%)
- PASS turn rate: ~70.6%
- ERROR turn rate: ~70.6% (matches PASS rate; likely error→pass fallback turns)
- INVALID turn rate: 0%
- Fallback turn rate: 0% (controller fallback is not flagged as `usedFallback` in these replays)
- Latency (ok turns only): p50 ~7.3s, p95 ~8.0s

Interpretation:
- The model can win very quickly when it gets clean turns, but across these seeds it is **not reliably producing non-error turns** (majority of agent turns were error/pass).
- This means “strength” is not the bottleneck; **request/response reliability** is.

## Next follow-ups (to isolate root cause)

1) Repeat the same seeds with a different `--reasoning-effort` (low/medium) to test whether “high” is causing request shape/provider instability.
2) Try `--max-tokens 4000` (still large) to see if huge output budgets correlate with error/pass behavior on Cerebras.
3) If errors are HTTP/5xx or schema issues, add a small per-call retry/backoff in `openai_compat` specifically for Cerebras and re-run the same 5 seeds.

