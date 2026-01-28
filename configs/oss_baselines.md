# OSS baselines (agent evaluation)

These are the current “good baseline” OSS models: high win rate, and no/very-low provider errors in recent runs.

## Chutes
- `tngtech/DeepSeek-R1T-Chimera` (strong + stable)
- `chutesai/Mistral-Small-3.1-24B-Instruct-2503` (stable + cheaper)
- `deepseek-ai/DeepSeek-V3-0324-TEE` (strong; sometimes higher latency)

Recommended usage (vs GreedyBot, 3 games, seeds 3/4/5):
```bash
npm run agent:eval-vs-mix -- --provider-name chutes --opponent greedy --base-url https://llm.chutes.ai/v1 --models tngtech/DeepSeek-R1T-Chimera,chutesai/Mistral-Small-3.1-24B-Instruct-2503 --games 3 --seed-start 3
```

## NanoGPT
- `deepseek/deepseek-v3.2` (strong; generally good latency)
- `mistralai/devstral-2-123b-instruct-2512` (strong; can be slower)

Recommended usage (vs GreedyBot, 3 games, seeds 3/4/5):
```bash
npm run agent:eval-vs-mix -- --provider-name nanogpt --opponent greedy --keys-file secrets/provider_apis.txt --models deepseek/deepseek-v3.2,mistralai/devstral-2-123b-instruct-2512 --games 3 --seed-start 3
```

## Notes
- Baselines are intentionally a *small* list; keep the broader OSS allowlists in `configs/oss_models.json` unchanged.
- Baselines are also available as an auto-pick config: `configs/oss_baselines.json` (priority ordered, used for `--model auto`).
