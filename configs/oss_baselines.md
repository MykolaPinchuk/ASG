# OSS baselines (agent evaluation)

These are the current “good baseline” OSS models: high win rate, and no/very-low provider errors in recent runs.

## Chutes
- `tngtech/DeepSeek-R1T-Chimera` (strong + stable)
- `chutesai/Mistral-Small-3.1-24B-Instruct-2503` (stable + cheaper)

Recommended usage (vs GreedyBot, 3 games, seeds 3/4/5):
```bash
npm run agent:eval-vs-mix -- --provider-name chutes --opponent greedy --base-url https://llm.chutes.ai/v1 --models tngtech/DeepSeek-R1T-Chimera,chutesai/Mistral-Small-3.1-24B-Instruct-2503 --games 3 --seed-start 3
```

## Notes
- Baselines are intentionally a *small* list; keep the broader OSS allowlists in `configs/oss_models.json` unchanged.
