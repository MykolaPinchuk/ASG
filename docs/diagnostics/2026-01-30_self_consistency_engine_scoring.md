# 2026-01-30 — Self-consistency + 1-ply engine scoring (v06)

Goal: improve win rate vs MixBot for models that already have ~100% ok turns (i.e. decision quality bottleneck, not parsing/legality), without adding human-authored strategy hints.

## What was implemented (opt-in)

Agent server (`src/cli/agentServer.ts`) supports a self-consistency selection mode:
- `--select-mode one_ply`
- `--select-k <K>` (number of candidate LLM calls per ply)
- `--select-candidate-temperature <t>` (temperature used for candidate generation)
- `--select-until-ply <N>` (only apply selection for early plies; later plies fall back to single-call baseline)

Mechanism per ply:
1) Call the model K times to get candidate action-lists.
2) Sanitize each candidate against the observation/rules.
3) Simulate one ply using `applyTurn` and score it (win-now, captures, supply-yield delta, distance-to-enemy-HQ, penalties).
4) Choose the highest-scoring candidate.

Notes:
- Combat simulation uses a deterministic PRNG seeded from `match_id|player|ply|candidateIndex` (not the match seed), so it is a heuristic for selection (not an exact replay of future combat randomness).

## A/B: Chutes `Qwen/Qwen3-Next-80B-A3B-Instruct` vs MixBot

Commands (no secrets):

Control:
```bash
npm run -s agent:vs-random -- \
  --provider-name chutes \
  --base-url https://llm.chutes.ai/v1 \
  --keys-file secrets/provider_apis.txt \
  --model "Qwen/Qwen3-Next-80B-A3B-Instruct" \
  --opponent mix \
  --start 3 \
  --count 5 \
  --turn-cap-plies 30 \
  --timeout-ms 70000 \
  --max-tokens 600 \
  --temperature 0 \
  --prompt-mode compact \
  --out-dir replays/experiments/self_consistency_engine1ply_2026-01-30T23-52-27-453Z_chutes_qwen3_next80b/control
```

Selection (K=3, early plies only):
```bash
npm run -s agent:vs-random -- \
  --provider-name chutes \
  --base-url https://llm.chutes.ai/v1 \
  --keys-file secrets/provider_apis.txt \
  --model "Qwen/Qwen3-Next-80B-A3B-Instruct" \
  --opponent mix \
  --start 3 \
  --count 5 \
  --turn-cap-plies 30 \
  --timeout-ms 70000 \
  --max-tokens 600 \
  --temperature 0 \
  --prompt-mode compact \
  --select-mode one_ply \
  --select-k 3 \
  --select-candidate-temperature 0.2 \
  --select-until-ply 10 \
  --out-dir replays/experiments/self_consistency_engine1ply_2026-01-30T23-52-27-453Z_chutes_qwen3_next80b/select_k3_t0p2_until10
```

Analysis:
```bash
npm run -s analyze:replays -- \
  --a replays/experiments/self_consistency_engine1ply_2026-01-30T23-52-27-453Z_chutes_qwen3_next80b/control \
  --b replays/experiments/self_consistency_engine1ply_2026-01-30T23-52-27-453Z_chutes_qwen3_next80b/select_k3_t0p2_until10
```

Headline results (seeds 3..7):
- Win rate: unchanged (0W-0L-5D for both).
- Reliability: unchanged (pass/invalid/error/fallback all 0% for both).
- Strategic progress:
  - captures/game: **6.4 → 4.2** (worse under selection)
  - time-to-first-capture: **4.0 → 3.6 plies** (slightly earlier)
  - supplyYield@ply10: **1.2 → 0.8** (worse under selection)
- Latency cost:
  - ply0 avg latency: **~2.8s → ~13.7s**
  - ok p95 latency: **~8.3s → ~19.2s**

Interpretation:
- This first scoring function did not improve win rate and significantly increased latency.
- The heuristic combat handling and the chosen scoring weights likely mis-rank candidates for “convert advantage into HQ capture” vs “farm captures”.

## Next iterations to try (if we continue this track)

1) Combat-agnostic scoring (avoid PRNG mismatch): reward safe captures/yield gains and avoid scoring through combat outcomes.
2) Add opponent-response rollout: simulate agent ply then a MixBot reply ply (still environment-derived, but more compute).
3) Trigger selection only when “stuck”: e.g. no captures in last N agent turns, or distance-to-HQ not decreasing.
4) Candidate diversity without higher temperature: add a “candidate_id” slot in the model prompt (requires prompt/schema change) to elicit distinct plans at `temperature=0`.

