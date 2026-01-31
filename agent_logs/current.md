# agent_logs/current.md

## Agent
- id: agent??

## Timestamp (Pacific)
- start: 2026-01-31

## Intent
- v07: increase game-mechanics complexity step-by-step and evaluate baseline models (`gpt-oss-120b`, Chimera, Grok) under the stable protocol.

## Next agent checklist
- Read `docs/planning/V07_COMPLEXITY_EXPERIMENT.md`.
- Keep prompts mechanics-only; avoid strategic “hints”.
- Use small fixed seeds first (`3,4`), then confirm with a wider set (`3..7`).
- Update `performance.md` via `npm run -s perf:top20`.

## Notes
- Do not commit secrets or bulky artifacts (see `.gitignore`).
- Keep v0 / v0.x eval guardrails by default (`turnCapPlies<=30`, `games<=5`, always save replays, persist `turns[*].latencyMs`).
