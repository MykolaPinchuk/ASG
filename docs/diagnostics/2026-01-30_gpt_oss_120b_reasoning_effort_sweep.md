# 2026-01-30 (PT) — `gpt-oss-120b` reasoning-effort sweep (OR / Chutes / Cerebras)

Goal: compare `gpt-oss-120b` family behavior across providers and `--reasoning-effort` settings under v0/v0.x guardrails (MixBot opponent, `turnCapPlies=30`).

Run id:
- `2026-01-31T02-27-29-383Z` (UTC; ~2026-01-30 PT)

Replay root:
- `replays/model_evals/gpt_oss_120b_sweep_2026-01-31T02-27-29-383Z`

Common settings:
- Opponent: `mix`
- Seeds: `3,4` (2 games)
- `turnCapPlies=30`
- `timeout-ms=70000`, `temperature=0`, `prompt-mode=compact`

Provider-specific settings:
- OpenRouter: model `openai/gpt-oss-120b`, `--use-tools true`
- Chutes: model `openai/gpt-oss-120b-TEE`, `--use-tools false`
- Cerebras: model `gpt-oss-120b`, `--use-tools false --tools-mode off --stream off --max-tokens 8000`

## Results (from `npm run -s analyze:replays`)

| condition | provider | model | reasoning-effort | W-D-L | win | avg ok latency (ms) | p95 ok latency (ms) | avg plies to win | pass turn rate | error turn rate |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| `openrouter_low` | openrouter | openai/gpt-oss-120b | low | 0-2-0 | 0% | 21837 | 47291 | — | 3% | 3% |
| `openrouter_medium` | openrouter | openai/gpt-oss-120b | medium | 1-1-0 | 50% | 41497 | 58851 | 7 | 21% | 21% |
| `chutes_low` | chutes | openai/gpt-oss-120b-TEE | low | 0-2-0 | 0% | 9637 | 16936 | — | 0% | 0% |
| `chutes_medium` | chutes | openai/gpt-oss-120b-TEE | medium | 1-1-0 | 50% | 28961 | 53049 | 13 | 5% | 5% |
| `cerebras_medium`* | cerebras | gpt-oss-120b | medium | 2-0-0 | 100% | 1691 | 2562 | 25 | 0% | 0% |
| `cerebras_high`* | cerebras | gpt-oss-120b | high | 2-0-0 | 100% | 1615 | 2302 | 25 | 0% | 0% |

\* Cerebras runs used `--keys-name cerebras-paid` because `secrets/provider_apis.txt` stores the Cerebras key under `cerebras-paid` rather than `cerebras`.

## Notes / interpretation

- OpenRouter: medium reasoning was slower and had higher pass/error rates than low in this small sample, but did produce 1 win.
- Chutes: medium reasoning increased latency substantially and introduced some pass/error; low reasoning was stable but didn’t win in these 2 seeds.
- Cerebras: both medium/high were fast and won both seeds 3 and 4 here; this suggests Cerebras is currently the best-performing `gpt-oss-120b` path **when configured correctly** (keys-name, tools off, stream off, high max-tokens).

