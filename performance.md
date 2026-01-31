# Performance (Focus-20 models)

Updated (Pacific): 01/30/2026 20:05:02

This file is generated from saved replay JSONs. It summarizes Focus-20 model performance under v0/v0.x guardrails (plies <= 30).

## How to update

```bash
npm run -s perf:top20
```

## Data coverage

- Focus list: `docs/focus20_models.md` (20 entries)
- Replay roots scanned: `replays`, `runs`
- JSON files considered: 2870
- Replays parsed (plies <= 30): 551

## Caveats

- Replays currently do not persist full run config (e.g. `reasoning-effort`, `tools-mode`, `max-tokens`).
- If Focus-20 contains multiple rows for the same provider+model with different config labels, metrics cannot be split reliably yet; this generator avoids double-counting by attributing replays to the first matching row.

## Summary (vs MixBot, plies <= 30)

| provider | model | games | W-D-L | win | avg ok latency (ms) | avg plies to win | ok turns | pass | invalid | error | fallback | captures/game |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| openrouter | x-ai/grok-4.1-fast | 6 | 6-0-0 | 100% | 42561 | 5 | 89% | 11% | 0% | 11% | 0% | 6 |
| chutes | tngtech/DeepSeek-R1T-Chimera | 9 | 8-1-0 | 89% | 6138 | 13 | 100% | 0% | 7% | 0% | 0% | 6 |
| chutes | deepseek-ai/DeepSeek-V3-0324-TEE | 8 | 7-1-0 | 88% | 12358 | 18 | 100% | 1% | 6% | 0% | 0% | 9 |
| nanogpt | deepseek-ai/DeepSeek-V3.1-Terminus | 7 | 5-2-0 | 71% | 31743 | 15 | 98% | 14% | 14% | 2% | 0% | 6 |
| chutes | openai/gpt-oss-120b-TEE | 10 | 4-6-0 | 40% | 19745 | 15 | 99% | 2% | 1% | 1% | 0% | 7 |
| chutes | openai/gpt-oss-120b-TEE | 0 | 0-0-0 | — | — | — | — | — | — | — | — | — |
| chutes | openai/gpt-oss-20b | 1 | 0-1-0 | 0% | 23764 | — | 100% | 7% | 0% | 0% | 0% | 8 |
| cerebras | gpt-oss-120b | 28 | 19-9-0 | 68% | 3959 | 11 | 65% | 36% | 0% | 35% | 0% | 6 |
| nanogpt | Qwen/Qwen3-235B-A22B-Thinking-2507 | 4 | 1-3-0 | 25% | 18159 | 13 | 100% | 15% | 0% | 0% | 0% | 3 |
| nanogpt | deepseek-ai/DeepSeek-V3.1-Terminus:thinking | 4 | 0-4-0 | 0% | 22355 | — | 97% | 12% | 0% | 3% | 0% | 4 |
| nanogpt | zai-org/GLM-4.5:thinking | 2 | 0-2-0 | 0% | 41200 | — | 100% | 25% | 0% | 0% | 0% | 4 |
| chutes | chutesai/Mistral-Small-3.1-24B-Instruct-2503 | 8 | 3-5-0 | 38% | 12667 | 19 | 100% | 0% | 9% | 0% | 0% | 6 |
| chutes | chutesai/Mistral-Small-3.2-24B-Instruct-2506 | 2 | 0-2-0 | 0% | 10513 | — | 100% | 0% | 17% | 0% | 0% | 10 |
| chutes | moonshotai/Kimi-K2-Instruct-0905 | 6 | 3-3-0 | 50% | 8055 | 15 | 100% | 7% | 12% | 0% | 0% | 7 |
| chutes | Qwen/Qwen3-Next-80B-A3B-Instruct | 14 | 0-14-0 | 0% | 6646 | — | 99% | 1% | 0% | 1% | 0% | 5 |
| chutes | Qwen/Qwen2.5-VL-32B-Instruct | 2 | 0-2-0 | 0% | 5028 | — | 100% | 0% | 3% | 0% | 0% | 4 |
| chutes | deepseek-ai/DeepSeek-R1-Distill-Llama-70B | 2 | 0-2-0 | 0% | 4027 | — | 100% | 0% | 50% | 0% | 0% | 10 |
| chutes | deepseek-ai/DeepSeek-V3.2-TEE | 3 | 1-2-0 | 33% | 19267 | 25 | 100% | 6% | 3% | 0% | 0% | 6 |
| nanogpt | deepseek-ai/DeepSeek-V3.1 | 4 | 1-3-0 | 25% | 10640 | 21 | 100% | 0% | 0% | 0% | 0% | 5 |
| nanogpt | Qwen/Qwen3-Next-80B-A3B-Instruct | 2 | 0-2-0 | 0% | 20553 | — | 100% | 0% | 0% | 0% | 0% | 3 |

## Leaderboard (Top 6, vs MixBot)

| rank | provider | model | config | games | W-D-L | win | avg ok latency (ms) | avg plies to win | ok turns |
|---:|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | openrouter | x-ai/grok-4.1-fast |  | 6 | 6-0-0 | 100% | 42561 | 5 | 89% |
| 2 | chutes | tngtech/DeepSeek-R1T-Chimera |  | 9 | 8-1-0 | 89% | 6138 | 13 | 100% |
| 3 | chutes | deepseek-ai/DeepSeek-V3-0324-TEE |  | 8 | 7-1-0 | 88% | 12358 | 18 | 100% |
| 4 | chutes | openai/gpt-oss-120b-TEE | reasoning-effort=low | 10 | 4-6-0 | 40% | 19745 | 15 | 99% |
| 5 | nanogpt | deepseek-ai/DeepSeek-V3.1-Terminus |  | 7 | 5-2-0 | 71% | 31743 | 15 | 98% |
| 6 | cerebras | gpt-oss-120b | reasoning-effort=high, max-tokens=8000, stream=off, tools=off | 28 | 19-9-0 | 68% | 3959 | 11 | 65% |

## Details (Focus-20 order)

### openrouter / x-ai/grok-4.1-fast

- Focus: Beats Mix reliably
- MixBot: games=6 W-D-L=6-0-0 win=100% avgOkLatencyMs=42561 avgPliesToWin=5 okTurns=89% p50/p95OkLatencyMs=38249/58639
  - pass=11% invalid=0% error=11% fallback=0%
  - captures/game=6 ttfCaptureAvgPly=0 supplyYield@10=— supplyYieldEnd=2
  - seeds(outcome): 3:W, 3:W, 3:W, 3:W, 3:W, 4:W
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T05-09-47PST_openrouter6/openrouter`, `replays/model_evals/seed3_vs_mix/openrouter_1game_tc120`, `replays/model_evals/seed3_vs_mix/openrouter_1game_tc120_2026-01-26T23-41-48Z`, `replays/model_evals/seed3_vs_mix/openrouter_1game_tc120_fixed_2026-01-26T23-55-02Z`, `replays/model_evals/top6_2games_2026-01-31T00-41-39-071Z/openrouter`
- GreedyBot: games=3 W-D-L=3-0-0 win=100% avgOkLatencyMs=— avgPliesToWin=8 okTurns=100% p50/p95OkLatencyMs=—/—
  - pass=0% invalid=0% error=0% fallback=0%
  - captures/game=8 ttfCaptureAvgPly=1 supplyYield@10=4 supplyYieldEnd=4
  - seeds(outcome): 3:W, 4:W, 5:W
  - sources: `replays/model_evals/grok_vs_greedy_2026-01-26T16-38-41PST`

### chutes / tngtech/DeepSeek-R1T-Chimera

- Focus: Beats Mix reliably
- MixBot: games=9 W-D-L=8-1-0 win=89% avgOkLatencyMs=6138 avgPliesToWin=13 okTurns=100% p50/p95OkLatencyMs=6066/8817
  - pass=0% invalid=7% error=0% fallback=0%
  - captures/game=6 ttfCaptureAvgPly=1 supplyYield@10=1 supplyYieldEnd=1
  - seeds(outcome): 3:D, 3:W, 3:W, 3:W, 3:W, 3:W, 4:W, 4:W, 5:W
  - sources: `replays/chutes_baselines_vs_mix_30ply_40s_1g_2026-01-28T18-31-00PST`, `replays/chutes_reasoning_vs_mix_30ply_40s_1g_2026-01-28T18-23-38PST`, `replays/model_evals/2026-01-27T13-12-05-086Z`, `replays/model_evals/2026-01-27T20-51-39-539Z`, `replays/model_evals/top6_2games_2026-01-31T00-41-39-071Z/chutes`, `replays/oss_vs_mix_30ply_60s_1g_2026-01-28T17-40-47PST/chutes`
- GreedyBot: games=4 W-D-L=4-0-0 win=100% avgOkLatencyMs=11165 avgPliesToWin=17 okTurns=100% p50/p95OkLatencyMs=10091/17392
  - pass=0% invalid=25% error=0% fallback=0%
  - captures/game=10 ttfCaptureAvgPly=0 supplyYield@10=3 supplyYieldEnd=3
  - seeds(outcome): 3:W, 3:W, 4:W, 5:W
  - sources: `replays/model_evals/2026-01-27T21-25-47-548Z`, `replays/model_evals/2026-01-27T23-06-01-188Z`

### chutes / deepseek-ai/DeepSeek-V3-0324-TEE

- Focus: Beats Mix reliably
- MixBot: games=8 W-D-L=7-1-0 win=88% avgOkLatencyMs=12358 avgPliesToWin=18 okTurns=100% p50/p95OkLatencyMs=10661/21949
  - pass=1% invalid=6% error=0% fallback=0%
  - captures/game=9 ttfCaptureAvgPly=1 supplyYield@10=2 supplyYieldEnd=2
  - seeds(outcome): 3:D, 3:W, 3:W, 3:W, 3:W, 4:W, 4:W, 5:W
  - sources: `replays/chutes_baselines_vs_mix_30ply_40s_1g_2026-01-28T18-31-00PST`, `replays/model_evals/2026-01-27T13-12-05-086Z`, `replays/model_evals/2026-01-27T20-51-39-539Z`, `replays/model_evals/top6_2games_2026-01-31T00-41-39-071Z/chutes`, `replays/oss_vs_mix_30ply_60s_1g_2026-01-28T17-40-47PST/chutes`
- GreedyBot: games=5 W-D-L=4-1-0 win=80% avgOkLatencyMs=— avgPliesToWin=14 okTurns=100% p50/p95OkLatencyMs=—/—
  - pass=14% invalid=11% error=0% fallback=0%
  - captures/game=8 ttfCaptureAvgPly=1 supplyYield@10=3 supplyYieldEnd=3
  - seeds(outcome): 3:W, 3:W, 4:W, 4:D, 5:W
  - sources: `replays/model_evals/2026-01-27T21-07-47-937Z`, `replays/model_evals/2026-01-27T21-25-47-548Z`

### nanogpt / deepseek-ai/DeepSeek-V3.1-Terminus

- Focus: Beats Mix (borderline)
- MixBot: games=7 W-D-L=5-2-0 win=71% avgOkLatencyMs=31743 avgPliesToWin=15 okTurns=98% p50/p95OkLatencyMs=30801/40582
  - pass=14% invalid=14% error=2% fallback=0%
  - captures/game=6 ttfCaptureAvgPly=1 supplyYield@10=2 supplyYieldEnd=2
  - seeds(outcome): 3:W, 3:W, 3:W, 3:D, 3:W, 4:D, 4:W
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T05-09-47PST_oss30/nanogpt`, `replays/model_evals/2026-01-27T13-37-19-798Z`, `replays/model_evals/2026-01-27T21-40-43-867Z`, `replays/model_evals/2026-01-27T21-50-55-462Z`, `replays/model_evals/top6_2games_2026-01-31T00-41-39-071Z/nanogpt`
- GreedyBot: games=22 W-D-L=3-19-0 win=14% avgOkLatencyMs=21977 avgPliesToWin=10 okTurns=100% p50/p95OkLatencyMs=17889/50385
  - pass=2% invalid=7% error=0% fallback=0%
  - captures/game=5 ttfCaptureAvgPly=2 supplyYield@10=2 supplyYieldEnd=2
  - seeds(outcome): 1:D, 1:D, 1:D, 1:D, 2:D, 2:D, 2:D, 2:D, 3:W, 3:W, 3:D, 3:D, 3:D, 4:D, 4:D, 4:D, 4:D, 4:D, 5:W, 5:D …
  - sources: `replays/model_evals/2026-01-27T21-46-07-370Z`, `runs/experiments/2026-01-30T04-32-59Z_v06_memory_repair/control/replays`, `runs/experiments/2026-01-30T04-32-59Z_v06_memory_repair/memory_inline/replays`, `runs/experiments/2026-01-30T04-32-59Z_v06_memory_repair/repair/replays`, `runs/experiments/2026-01-30T04-32-59Z_v06_memory_repair/warmup_separate/replays`

### chutes / openai/gpt-oss-120b-TEE (reasoning-effort=low)

- Focus: Keeps strength but reduces thinking time
- MixBot: games=10 W-D-L=4-6-0 win=40% avgOkLatencyMs=19745 avgPliesToWin=15 okTurns=99% p50/p95OkLatencyMs=16494/47514
  - pass=2% invalid=1% error=1% fallback=0%
  - captures/game=7 ttfCaptureAvgPly=1 supplyYield@10=1 supplyYieldEnd=2
  - seeds(outcome): 3:W, 3:W, 3:D, 3:W, 3:D, 3:D, 3:D, 4:D, 4:W, 4:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T16-07-45PST_chutes_gptoss/chutes`, `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T16-27-17PST_chutes_gptoss120b_effort_low/chutes`, `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T16-35-27PST_chutes_gptoss120b_effort_medium/chutes`, `replays/mix_30ply_70s_advert40_rationale_3to5_2026-01-29T16-37-40PST_chutes_gptoss120b_effort_medium/chutes`, `replays/model_evals/gpt_oss_120b_sweep_2026-01-31T02-27-29-383Z/chutes_low`, `replays/model_evals/gpt_oss_120b_sweep_2026-01-31T02-27-29-383Z/chutes_medium`, …
- GreedyBot: games=0 W-D-L=0-0-0 win=— avgOkLatencyMs=— avgPliesToWin=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### chutes / openai/gpt-oss-120b-TEE (reasoning-effort=medium)

- Focus: Keep as slower/stronger variant
- MixBot: games=0 W-D-L=0-0-0 win=— avgOkLatencyMs=— avgPliesToWin=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —
- GreedyBot: games=0 W-D-L=0-0-0 win=— avgOkLatencyMs=— avgPliesToWin=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### chutes / openai/gpt-oss-20b

- Focus: Keep (slow; mostly works)
- MixBot: games=1 W-D-L=0-1-0 win=0% avgOkLatencyMs=23764 avgPliesToWin=— okTurns=100% p50/p95OkLatencyMs=14725/51395
  - pass=7% invalid=0% error=0% fallback=0%
  - captures/game=8 ttfCaptureAvgPly=4 supplyYield@10=0 supplyYieldEnd=0
  - seeds(outcome): 3:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T16-07-45PST_chutes_gptoss/chutes`
- GreedyBot: games=0 W-D-L=0-0-0 win=— avgOkLatencyMs=— avgPliesToWin=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### cerebras / gpt-oss-120b (reasoning-effort=high, max-tokens=8000, stream=off, tools=off)

- Focus: Very strong when configured carefully
- MixBot: games=28 W-D-L=19-9-0 win=68% avgOkLatencyMs=3959 avgPliesToWin=11 okTurns=65% p50/p95OkLatencyMs=2970/10160
  - pass=36% invalid=0% error=35% fallback=0%
  - captures/game=6 ttfCaptureAvgPly=2 supplyYield@10=2 supplyYieldEnd=1
  - seeds(outcome): 3:D, 3:D, 3:W, 3:D, 3:D, 3:W, 3:W, 3:W, 3:W, 3:W, 4:W, 4:D, 4:W, 4:W, 4:W, 4:W, 5:W, 5:W, 5:W, 6:W …
  - sources: `replays/model_evals/2026-01-30T01-11-11-685Z`, `replays/model_evals/2026-01-30T01-12-41-825Z`, `replays/model_evals/2026-01-30T01-15-22-286Z`, `replays/model_evals/cerebras_gpt-oss-120b_repeatability_2026-01-30T23-22-19-235Z`, `replays/model_evals/cerebras_gpt-oss-120b_repeatability_2026-01-30T23-22-58-967Z`, `replays/model_evals/cerebras_gpt-oss-120b_repeatability_2026-01-30T23-24-49-476Z`, …
- GreedyBot: games=0 W-D-L=0-0-0 win=— avgOkLatencyMs=— avgPliesToWin=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### nanogpt / Qwen/Qwen3-235B-A22B-Thinking-2507

- Focus: Low error rate + thinking
- MixBot: games=4 W-D-L=1-3-0 win=25% avgOkLatencyMs=18159 avgPliesToWin=13 okTurns=100% p50/p95OkLatencyMs=17980/19837
  - pass=15% invalid=0% error=0% fallback=0%
  - captures/game=3 ttfCaptureAvgPly=7 supplyYield@10=1 supplyYieldEnd=1
  - seeds(outcome): 3:W, 3:D, 3:D, 3:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T05-09-47PST_oss30/nanogpt`, `replays/model_evals/2026-01-27T13-37-19-798Z`, `replays/model_evals/oss_selected_plus_glm_nanogpt_seed3_tc30`, `replays/model_evals/oss_zeroerr_vs_mix_nanogpt_seed3_1game_tc30`
- GreedyBot: games=0 W-D-L=0-0-0 win=— avgOkLatencyMs=— avgPliesToWin=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### nanogpt / deepseek-ai/DeepSeek-V3.1-Terminus:thinking

- Focus: Low error rate + thinking
- MixBot: games=4 W-D-L=0-4-0 win=0% avgOkLatencyMs=22355 avgPliesToWin=— okTurns=97% p50/p95OkLatencyMs=20271/36960
  - pass=12% invalid=0% error=3% fallback=0%
  - captures/game=4 ttfCaptureAvgPly=4 supplyYield@10=2 supplyYieldEnd=1
  - seeds(outcome): 3:D, 3:D, 3:D, 3:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-28T19-50-58PST/nanogpt`, `replays/model_evals/2026-01-27T13-37-19-798Z`, `replays/model_evals/one_game_2026-01-31T00-23-32-770Z/nanogpt_deepseek-ai_DeepSeek-V3.1-Terminus_thinking`, `replays/model_evals/oss_selected_plus_glm_nanogpt_seed3_tc30`
- GreedyBot: games=0 W-D-L=0-0-0 win=— avgOkLatencyMs=— avgPliesToWin=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### nanogpt / zai-org/GLM-4.5:thinking

- Focus: Slow + thinking (stress test)
- MixBot: games=2 W-D-L=0-2-0 win=0% avgOkLatencyMs=41200 avgPliesToWin=— okTurns=100% p50/p95OkLatencyMs=40583/41588
  - pass=25% invalid=0% error=0% fallback=0%
  - captures/game=4 ttfCaptureAvgPly=4 supplyYield@10=2 supplyYieldEnd=2
  - seeds(outcome): 3:D, 3:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T05-09-47PST_oss30/nanogpt`, `replays/model_evals/oss_selected_plus_glm_nanogpt_seed3_tc30`
- GreedyBot: games=0 W-D-L=0-0-0 win=— avgOkLatencyMs=— avgPliesToWin=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### chutes / chutesai/Mistral-Small-3.1-24B-Instruct-2503

- Focus: Very reliable baseline
- MixBot: games=8 W-D-L=3-5-0 win=38% avgOkLatencyMs=12667 avgPliesToWin=19 okTurns=100% p50/p95OkLatencyMs=10713/20941
  - pass=0% invalid=9% error=0% fallback=0%
  - captures/game=6 ttfCaptureAvgPly=1 supplyYield@10=2 supplyYieldEnd=2
  - seeds(outcome): 3:D, 3:D, 3:D, 3:W, 3:W, 3:D, 4:W, 5:D
  - sources: `replays/chutes_baselines_vs_mix_30ply_40s_1g_2026-01-28T18-31-00PST`, `replays/model_evals/2026-01-27T05-24-18-188Z`, `replays/model_evals/2026-01-27T05-28-51-625Z`, `replays/model_evals/2026-01-27T13-12-05-086Z`, `replays/model_evals/2026-01-27T20-51-39-539Z`, `replays/oss_vs_mix_30ply_60s_1g_2026-01-28T17-40-47PST/chutes`
- GreedyBot: games=7 W-D-L=4-3-0 win=57% avgOkLatencyMs=6959 avgPliesToWin=26 okTurns=100% p50/p95OkLatencyMs=7290/10643
  - pass=0% invalid=14% error=0% fallback=0%
  - captures/game=9 ttfCaptureAvgPly=0 supplyYield@10=2 supplyYieldEnd=2
  - seeds(outcome): 3:W, 3:W, 3:W, 4:D, 4:W, 5:D, 5:D
  - sources: `replays/model_evals/2026-01-27T21-07-47-937Z`, `replays/model_evals/2026-01-27T21-25-47-548Z`, `replays/model_evals/2026-01-27T23-06-01-188Z`

### chutes / chutesai/Mistral-Small-3.2-24B-Instruct-2506

- Focus: Very reliable baseline
- MixBot: games=2 W-D-L=0-2-0 win=0% avgOkLatencyMs=10513 avgPliesToWin=— okTurns=100% p50/p95OkLatencyMs=8254/18147
  - pass=0% invalid=17% error=0% fallback=0%
  - captures/game=10 ttfCaptureAvgPly=3 supplyYield@10=0 supplyYieldEnd=1
  - seeds(outcome): 3:D, 3:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T05-09-47PST_oss30/chutes`, `replays/model_evals/2026-01-27T13-12-05-086Z`
- GreedyBot: games=0 W-D-L=0-0-0 win=— avgOkLatencyMs=— avgPliesToWin=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### chutes / moonshotai/Kimi-K2-Instruct-0905

- Focus: Strong non-reasoning contender
- MixBot: games=6 W-D-L=3-3-0 win=50% avgOkLatencyMs=8055 avgPliesToWin=15 okTurns=100% p50/p95OkLatencyMs=8184/10234
  - pass=7% invalid=12% error=0% fallback=0%
  - captures/game=7 ttfCaptureAvgPly=1 supplyYield@10=1 supplyYieldEnd=2
  - seeds(outcome): 3:D, 3:D, 3:W, 3:W, 4:D, 5:W
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-28T19-50-58PST/chutes`, `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-28T19-50-58PST/chutes_v2`, `replays/model_evals/2026-01-27T13-12-05-086Z`, `replays/model_evals/2026-01-27T20-51-39-539Z`
- GreedyBot: games=4 W-D-L=2-1-1 win=50% avgOkLatencyMs=— avgPliesToWin=25 okTurns=100% p50/p95OkLatencyMs=—/—
  - pass=4% invalid=22% error=0% fallback=0%
  - captures/game=11 ttfCaptureAvgPly=0 supplyYield@10=1 supplyYieldEnd=1
  - seeds(outcome): 3:D, 3:W, 4:W, 5:L
  - sources: `replays/model_evals/2026-01-27T21-07-47-937Z`, `replays/model_evals/2026-01-27T21-25-47-548Z`

### chutes / Qwen/Qwen3-Next-80B-A3B-Instruct

- Focus: Reliable + moderate latency
- MixBot: games=14 W-D-L=0-14-0 win=0% avgOkLatencyMs=6646 avgPliesToWin=— okTurns=99% p50/p95OkLatencyMs=4840/15976
  - pass=1% invalid=0% error=1% fallback=0%
  - captures/game=5 ttfCaptureAvgPly=4 supplyYield@10=1 supplyYieldEnd=1
  - seeds(outcome): 3:D, 3:D, 3:D, 3:D, 3:D, 3:D, 4:D, 4:D, 5:D, 5:D, 6:D, 6:D, 7:D, 7:D
  - sources: `replays/chutes_vs_mix_30ply_40s_1g_2026-01-28T17-57-33PST`, `replays/experiments/self_consistency_engine1ply_2026-01-30T23-52-27-453Z_chutes_qwen3_next80b/control`, `replays/experiments/self_consistency_engine1ply_2026-01-30T23-52-27-453Z_chutes_qwen3_next80b/select_k3_t0p2_until10`, `replays/model_evals/2026-01-27T13-12-05-086Z`, `replays/model_evals/one_game_2026-01-31T00-23-32-770Z/chutes_Qwen_Qwen3-Next-80B-A3B-Instruct`, `replays/model_evals/oss_zeroerr_vs_mix_chutes_seed3_1game_tc30`
- GreedyBot: games=0 W-D-L=0-0-0 win=— avgOkLatencyMs=— avgPliesToWin=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### chutes / Qwen/Qwen2.5-VL-32B-Instruct

- Focus: Reliable + moderate latency
- MixBot: games=2 W-D-L=0-2-0 win=0% avgOkLatencyMs=5028 avgPliesToWin=— okTurns=100% p50/p95OkLatencyMs=2912/12615
  - pass=0% invalid=3% error=0% fallback=0%
  - captures/game=4 ttfCaptureAvgPly=0 supplyYield@10=0 supplyYieldEnd=0
  - seeds(outcome): 3:D, 3:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T05-09-47PST_oss30/chutes`, `replays/model_evals/oss_zeroerr_vs_mix_chutes_seed3_1game_tc30`
- GreedyBot: games=0 W-D-L=0-0-0 win=— avgOkLatencyMs=— avgPliesToWin=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### chutes / deepseek-ai/DeepSeek-R1-Distill-Llama-70B

- Focus: Low pass/error; some promise
- MixBot: games=2 W-D-L=0-2-0 win=0% avgOkLatencyMs=4027 avgPliesToWin=— okTurns=100% p50/p95OkLatencyMs=3852/5775
  - pass=0% invalid=50% error=0% fallback=0%
  - captures/game=10 ttfCaptureAvgPly=0 supplyYield@10=4 supplyYieldEnd=4
  - seeds(outcome): 3:D, 3:D
  - sources: `replays/chutes_reasoning_vs_mix_30ply_40s_1g_2026-01-28T18-23-38PST`, `replays/chutes_vs_mix_30ply_40s_1g_2026-01-28T17-57-33PST`
- GreedyBot: games=0 W-D-L=0-0-0 win=— avgOkLatencyMs=— avgPliesToWin=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### chutes / deepseek-ai/DeepSeek-V3.2-TEE

- Focus: Reliable but higher pass rate
- MixBot: games=3 W-D-L=1-2-0 win=33% avgOkLatencyMs=19267 avgPliesToWin=25 okTurns=100% p50/p95OkLatencyMs=19678/25395
  - pass=6% invalid=3% error=0% fallback=0%
  - captures/game=6 ttfCaptureAvgPly=1 supplyYield@10=3 supplyYieldEnd=3
  - seeds(outcome): 3:W, 3:D, 3:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-28T19-50-58PST/chutes`, `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-28T19-50-58PST/chutes_v2`, `replays/model_evals/2026-01-27T13-12-05-086Z`
- GreedyBot: games=0 W-D-L=0-0-0 win=— avgOkLatencyMs=— avgPliesToWin=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### nanogpt / deepseek-ai/DeepSeek-V3.1

- Focus: Reliable + slow
- MixBot: games=4 W-D-L=1-3-0 win=25% avgOkLatencyMs=10640 avgPliesToWin=21 okTurns=100% p50/p95OkLatencyMs=8928/18558
  - pass=0% invalid=0% error=0% fallback=0%
  - captures/game=5 ttfCaptureAvgPly=4 supplyYield@10=1 supplyYieldEnd=1
  - seeds(outcome): 3:D, 3:D, 3:W, 3:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T05-09-47PST_oss30/nanogpt`, `replays/model_evals/2026-01-26T21-58-13-630Z`, `replays/model_evals/one_game_2026-01-31T00-23-32-770Z/nanogpt_deepseek-ai_DeepSeek-V3.1`, `replays/model_evals/oss_zeroerr_vs_mix_nanogpt_seed3_1game_tc30`
- GreedyBot: games=0 W-D-L=0-0-0 win=— avgOkLatencyMs=— avgPliesToWin=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### nanogpt / Qwen/Qwen3-Next-80B-A3B-Instruct

- Focus: Reliable + slow
- MixBot: games=2 W-D-L=0-2-0 win=0% avgOkLatencyMs=20553 avgPliesToWin=— okTurns=100% p50/p95OkLatencyMs=18206/34479
  - pass=0% invalid=0% error=0% fallback=0%
  - captures/game=3 ttfCaptureAvgPly=6 supplyYield@10=1 supplyYieldEnd=1
  - seeds(outcome): 3:D, 3:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T05-09-47PST_oss30/nanogpt`, `replays/model_evals/oss_zeroerr_vs_mix_nanogpt_seed3_1game_tc30`
- GreedyBot: games=0 W-D-L=0-0-0 win=— avgOkLatencyMs=— avgPliesToWin=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —
