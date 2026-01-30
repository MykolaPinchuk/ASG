# Performance (Focus-20 models)

Updated (Pacific): 01/30/2026 15:28:28

This file is generated from saved replay JSONs. It summarizes Focus-20 model performance under v0/v0.x guardrails (plies <= 30).

## How to update

```bash
npm run -s perf:top20
```

## Data coverage

- Focus list: `docs/focus20_models.md` (20 entries)
- Replay roots scanned: `replays`, `runs`
- JSON files considered: 2655
- Replays parsed (plies <= 30): 504

## Caveats

- Replays currently do not persist full run config (e.g. `reasoning-effort`, `tools-mode`, `max-tokens`).
- If Focus-20 contains multiple rows for the same provider+model with different config labels, metrics cannot be split reliably yet; this generator avoids double-counting by attributing replays to the first matching row.

## Summary (vs MixBot, plies <= 30)

| provider | model | games | W-D-L | win | ok turns | p95 ok latency (ms) | pass | invalid | error | fallback | captures/game |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| openrouter | x-ai/grok-4.1-fast | 4 | 4-0-0 | 100% | 100% | 35200 | 0% | 0% | 0% | 0% | 7 |
| chutes | tngtech/DeepSeek-R1T-Chimera | 7 | 6-1-0 | 86% | 100% | 8722 | 0% | 7% | 0% | 0% | 6 |
| chutes | deepseek-ai/DeepSeek-V3-0324-TEE | 6 | 5-1-0 | 83% | 100% | 21561 | 2% | 7% | 0% | 0% | 9 |
| nanogpt | deepseek-ai/DeepSeek-V3.1-Terminus | 5 | 3-2-0 | 60% | 100% | 38491 | 19% | 16% | 0% | 0% | 5 |
| chutes | openai/gpt-oss-120b-TEE | 4 | 3-1-0 | 75% | 100% | 57064 | 4% | 0% | 0% | 0% | 6 |
| chutes | openai/gpt-oss-120b-TEE | 0 | 0-0-0 | — | — | — | — | — | — | — | — |
| chutes | openai/gpt-oss-20b | 1 | 0-1-0 | 0% | 100% | 51395 | 7% | 0% | 0% | 0% | 8 |
| cerebras | gpt-oss-120b | 12 | 7-5-0 | 58% | 46% | 11724 | 59% | 0% | 54% | 0% | 4 |
| nanogpt | Qwen/Qwen3-235B-A22B-Thinking-2507 | 4 | 1-3-0 | 25% | 100% | 19837 | 15% | 0% | 0% | 0% | 3 |
| nanogpt | deepseek-ai/DeepSeek-V3.1-Terminus:thinking | 3 | 0-3-0 | 0% | 100% | 36960 | 9% | 0% | 0% | 0% | 5 |
| nanogpt | zai-org/GLM-4.5:thinking | 2 | 0-2-0 | 0% | 100% | 41588 | 25% | 0% | 0% | 0% | 4 |
| chutes | chutesai/Mistral-Small-3.1-24B-Instruct-2503 | 8 | 3-5-0 | 38% | 100% | 20941 | 0% | 9% | 0% | 0% | 6 |
| chutes | chutesai/Mistral-Small-3.2-24B-Instruct-2506 | 2 | 0-2-0 | 0% | 100% | 18147 | 0% | 17% | 0% | 0% | 10 |
| chutes | moonshotai/Kimi-K2-Instruct-0905 | 6 | 3-3-0 | 50% | 100% | 10234 | 7% | 12% | 0% | 0% | 7 |
| chutes | Qwen/Qwen3-Next-80B-A3B-Instruct | 3 | 0-3-0 | 0% | 100% | 8920 | 0% | 0% | 0% | 0% | 3 |
| chutes | Qwen/Qwen2.5-VL-32B-Instruct | 2 | 0-2-0 | 0% | 100% | 12615 | 0% | 3% | 0% | 0% | 4 |
| chutes | deepseek-ai/DeepSeek-R1-Distill-Llama-70B | 2 | 0-2-0 | 0% | 100% | 5775 | 0% | 50% | 0% | 0% | 10 |
| chutes | deepseek-ai/DeepSeek-V3.2-TEE | 3 | 1-2-0 | 33% | 100% | 25395 | 6% | 3% | 0% | 0% | 6 |
| nanogpt | deepseek-ai/DeepSeek-V3.1 | 3 | 0-3-0 | 0% | 100% | 19017 | 0% | 0% | 0% | 0% | 5 |
| nanogpt | Qwen/Qwen3-Next-80B-A3B-Instruct | 2 | 0-2-0 | 0% | 100% | 34479 | 0% | 0% | 0% | 0% | 3 |

## Details (Focus-20 order)

### openrouter / x-ai/grok-4.1-fast

- Focus: Beats Mix reliably
- MixBot: games=4 W-D-L=4-0-0 win=100% okTurns=100% p50/p95OkLatencyMs=35200/35200
  - pass=0% invalid=0% error=0% fallback=0%
  - captures/game=7 ttfCaptureAvgPly=0 supplyYield@10=— supplyYieldEnd=3
  - seeds(outcome): 3:W, 3:W, 3:W, 3:W
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T05-09-47PST_openrouter6/openrouter`, `replays/model_evals/seed3_vs_mix/openrouter_1game_tc120`, `replays/model_evals/seed3_vs_mix/openrouter_1game_tc120_2026-01-26T23-41-48Z`, `replays/model_evals/seed3_vs_mix/openrouter_1game_tc120_fixed_2026-01-26T23-55-02Z`
- GreedyBot: games=3 W-D-L=3-0-0 win=100% okTurns=100% p50/p95OkLatencyMs=—/—
  - pass=0% invalid=0% error=0% fallback=0%
  - captures/game=8 ttfCaptureAvgPly=1 supplyYield@10=4 supplyYieldEnd=4
  - seeds(outcome): 3:W, 4:W, 5:W
  - sources: `replays/model_evals/grok_vs_greedy_2026-01-26T16-38-41PST`

### chutes / tngtech/DeepSeek-R1T-Chimera

- Focus: Beats Mix reliably
- MixBot: games=7 W-D-L=6-1-0 win=86% okTurns=100% p50/p95OkLatencyMs=5921/8722
  - pass=0% invalid=7% error=0% fallback=0%
  - captures/game=6 ttfCaptureAvgPly=1 supplyYield@10=1 supplyYieldEnd=1
  - seeds(outcome): 3:D, 3:W, 3:W, 3:W, 3:W, 4:W, 5:W
  - sources: `replays/chutes_baselines_vs_mix_30ply_40s_1g_2026-01-28T18-31-00PST`, `replays/chutes_reasoning_vs_mix_30ply_40s_1g_2026-01-28T18-23-38PST`, `replays/model_evals/2026-01-27T13-12-05-086Z`, `replays/model_evals/2026-01-27T20-51-39-539Z`, `replays/oss_vs_mix_30ply_60s_1g_2026-01-28T17-40-47PST/chutes`
- GreedyBot: games=4 W-D-L=4-0-0 win=100% okTurns=100% p50/p95OkLatencyMs=10091/17392
  - pass=0% invalid=25% error=0% fallback=0%
  - captures/game=10 ttfCaptureAvgPly=0 supplyYield@10=3 supplyYieldEnd=3
  - seeds(outcome): 3:W, 3:W, 4:W, 5:W
  - sources: `replays/model_evals/2026-01-27T21-25-47-548Z`, `replays/model_evals/2026-01-27T23-06-01-188Z`

### chutes / deepseek-ai/DeepSeek-V3-0324-TEE

- Focus: Beats Mix reliably
- MixBot: games=6 W-D-L=5-1-0 win=83% okTurns=100% p50/p95OkLatencyMs=12576/21561
  - pass=2% invalid=7% error=0% fallback=0%
  - captures/game=9 ttfCaptureAvgPly=1 supplyYield@10=2 supplyYieldEnd=2
  - seeds(outcome): 3:D, 3:W, 3:W, 3:W, 4:W, 5:W
  - sources: `replays/chutes_baselines_vs_mix_30ply_40s_1g_2026-01-28T18-31-00PST`, `replays/model_evals/2026-01-27T13-12-05-086Z`, `replays/model_evals/2026-01-27T20-51-39-539Z`, `replays/oss_vs_mix_30ply_60s_1g_2026-01-28T17-40-47PST/chutes`
- GreedyBot: games=5 W-D-L=4-1-0 win=80% okTurns=100% p50/p95OkLatencyMs=—/—
  - pass=14% invalid=11% error=0% fallback=0%
  - captures/game=8 ttfCaptureAvgPly=1 supplyYield@10=3 supplyYieldEnd=3
  - seeds(outcome): 3:W, 3:W, 4:W, 4:D, 5:W
  - sources: `replays/model_evals/2026-01-27T21-07-47-937Z`, `replays/model_evals/2026-01-27T21-25-47-548Z`

### nanogpt / deepseek-ai/DeepSeek-V3.1-Terminus

- Focus: Beats Mix (borderline)
- MixBot: games=5 W-D-L=3-2-0 win=60% okTurns=100% p50/p95OkLatencyMs=21838/38491
  - pass=19% invalid=16% error=0% fallback=0%
  - captures/game=5 ttfCaptureAvgPly=0 supplyYield@10=2 supplyYieldEnd=2
  - seeds(outcome): 3:W, 3:W, 3:W, 3:D, 4:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T05-09-47PST_oss30/nanogpt`, `replays/model_evals/2026-01-27T13-37-19-798Z`, `replays/model_evals/2026-01-27T21-40-43-867Z`, `replays/model_evals/2026-01-27T21-50-55-462Z`
- GreedyBot: games=22 W-D-L=3-19-0 win=14% okTurns=100% p50/p95OkLatencyMs=17889/50385
  - pass=2% invalid=7% error=0% fallback=0%
  - captures/game=5 ttfCaptureAvgPly=2 supplyYield@10=2 supplyYieldEnd=2
  - seeds(outcome): 1:D, 1:D, 1:D, 1:D, 2:D, 2:D, 2:D, 2:D, 3:W, 3:W, 3:D, 3:D, 3:D, 4:D, 4:D, 4:D, 4:D, 4:D, 5:W, 5:D …
  - sources: `replays/model_evals/2026-01-27T21-46-07-370Z`, `runs/experiments/2026-01-30T04-32-59Z_v06_memory_repair/control/replays`, `runs/experiments/2026-01-30T04-32-59Z_v06_memory_repair/memory_inline/replays`, `runs/experiments/2026-01-30T04-32-59Z_v06_memory_repair/repair/replays`, `runs/experiments/2026-01-30T04-32-59Z_v06_memory_repair/warmup_separate/replays`

### chutes / openai/gpt-oss-120b-TEE (reasoning-effort=low)

- Focus: Keeps strength but reduces thinking time
- MixBot: games=4 W-D-L=3-1-0 win=75% okTurns=100% p50/p95OkLatencyMs=30115/57064
  - pass=4% invalid=0% error=0% fallback=0%
  - captures/game=6 ttfCaptureAvgPly=0 supplyYield@10=2 supplyYieldEnd=2
  - seeds(outcome): 3:W, 3:W, 3:D, 3:W
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T16-07-45PST_chutes_gptoss/chutes`, `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T16-27-17PST_chutes_gptoss120b_effort_low/chutes`, `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T16-35-27PST_chutes_gptoss120b_effort_medium/chutes`, `replays/mix_30ply_70s_advert40_rationale_3to5_2026-01-29T16-37-40PST_chutes_gptoss120b_effort_medium/chutes`
- GreedyBot: games=0 W-D-L=0-0-0 win=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### chutes / openai/gpt-oss-120b-TEE (reasoning-effort=medium)

- Focus: Keep as slower/stronger variant
- MixBot: games=0 W-D-L=0-0-0 win=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —
- GreedyBot: games=0 W-D-L=0-0-0 win=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### chutes / openai/gpt-oss-20b

- Focus: Keep (slow; mostly works)
- MixBot: games=1 W-D-L=0-1-0 win=0% okTurns=100% p50/p95OkLatencyMs=14725/51395
  - pass=7% invalid=0% error=0% fallback=0%
  - captures/game=8 ttfCaptureAvgPly=4 supplyYield@10=0 supplyYieldEnd=0
  - seeds(outcome): 3:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T16-07-45PST_chutes_gptoss/chutes`
- GreedyBot: games=0 W-D-L=0-0-0 win=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### cerebras / gpt-oss-120b (reasoning-effort=high, max-tokens=8000, stream=off, tools=off)

- Focus: Very strong when configured carefully
- MixBot: games=12 W-D-L=7-5-0 win=58% okTurns=46% p50/p95OkLatencyMs=5912/11724
  - pass=59% invalid=0% error=54% fallback=0%
  - captures/game=4 ttfCaptureAvgPly=3 supplyYield@10=1 supplyYieldEnd=0
  - seeds(outcome): 3:D, 3:D, 3:W, 3:D, 3:D, 3:W, 4:W, 4:D, 5:W, 5:W, 6:W, 7:W
  - sources: `replays/model_evals/2026-01-30T01-11-11-685Z`, `replays/model_evals/2026-01-30T01-12-41-825Z`, `replays/model_evals/2026-01-30T01-15-22-286Z`, `replays/model_evals/cerebras_gpt-oss-120b_repeatability_2026-01-30T23-22-19-235Z`, `replays/model_evals/cerebras_gpt-oss-120b_repeatability_2026-01-30T23-22-58-967Z`, `replays/model_evals/cerebras_gpt-oss-120b_repeatability_2026-01-30T23-24-49-476Z`
- GreedyBot: games=0 W-D-L=0-0-0 win=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### nanogpt / Qwen/Qwen3-235B-A22B-Thinking-2507

- Focus: Low error rate + thinking
- MixBot: games=4 W-D-L=1-3-0 win=25% okTurns=100% p50/p95OkLatencyMs=17980/19837
  - pass=15% invalid=0% error=0% fallback=0%
  - captures/game=3 ttfCaptureAvgPly=7 supplyYield@10=1 supplyYieldEnd=1
  - seeds(outcome): 3:W, 3:D, 3:D, 3:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T05-09-47PST_oss30/nanogpt`, `replays/model_evals/2026-01-27T13-37-19-798Z`, `replays/model_evals/oss_selected_plus_glm_nanogpt_seed3_tc30`, `replays/model_evals/oss_zeroerr_vs_mix_nanogpt_seed3_1game_tc30`
- GreedyBot: games=0 W-D-L=0-0-0 win=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### nanogpt / deepseek-ai/DeepSeek-V3.1-Terminus:thinking

- Focus: Low error rate + thinking
- MixBot: games=3 W-D-L=0-3-0 win=0% okTurns=100% p50/p95OkLatencyMs=20271/36960
  - pass=9% invalid=0% error=0% fallback=0%
  - captures/game=5 ttfCaptureAvgPly=4 supplyYield@10=2 supplyYieldEnd=1
  - seeds(outcome): 3:D, 3:D, 3:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-28T19-50-58PST/nanogpt`, `replays/model_evals/2026-01-27T13-37-19-798Z`, `replays/model_evals/oss_selected_plus_glm_nanogpt_seed3_tc30`
- GreedyBot: games=0 W-D-L=0-0-0 win=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### nanogpt / zai-org/GLM-4.5:thinking

- Focus: Slow + thinking (stress test)
- MixBot: games=2 W-D-L=0-2-0 win=0% okTurns=100% p50/p95OkLatencyMs=40583/41588
  - pass=25% invalid=0% error=0% fallback=0%
  - captures/game=4 ttfCaptureAvgPly=4 supplyYield@10=2 supplyYieldEnd=2
  - seeds(outcome): 3:D, 3:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T05-09-47PST_oss30/nanogpt`, `replays/model_evals/oss_selected_plus_glm_nanogpt_seed3_tc30`
- GreedyBot: games=0 W-D-L=0-0-0 win=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### chutes / chutesai/Mistral-Small-3.1-24B-Instruct-2503

- Focus: Very reliable baseline
- MixBot: games=8 W-D-L=3-5-0 win=38% okTurns=100% p50/p95OkLatencyMs=10713/20941
  - pass=0% invalid=9% error=0% fallback=0%
  - captures/game=6 ttfCaptureAvgPly=1 supplyYield@10=2 supplyYieldEnd=2
  - seeds(outcome): 3:D, 3:D, 3:D, 3:W, 3:W, 3:D, 4:W, 5:D
  - sources: `replays/chutes_baselines_vs_mix_30ply_40s_1g_2026-01-28T18-31-00PST`, `replays/model_evals/2026-01-27T05-24-18-188Z`, `replays/model_evals/2026-01-27T05-28-51-625Z`, `replays/model_evals/2026-01-27T13-12-05-086Z`, `replays/model_evals/2026-01-27T20-51-39-539Z`, `replays/oss_vs_mix_30ply_60s_1g_2026-01-28T17-40-47PST/chutes`
- GreedyBot: games=7 W-D-L=4-3-0 win=57% okTurns=100% p50/p95OkLatencyMs=7290/10643
  - pass=0% invalid=14% error=0% fallback=0%
  - captures/game=9 ttfCaptureAvgPly=0 supplyYield@10=2 supplyYieldEnd=2
  - seeds(outcome): 3:W, 3:W, 3:W, 4:D, 4:W, 5:D, 5:D
  - sources: `replays/model_evals/2026-01-27T21-07-47-937Z`, `replays/model_evals/2026-01-27T21-25-47-548Z`, `replays/model_evals/2026-01-27T23-06-01-188Z`

### chutes / chutesai/Mistral-Small-3.2-24B-Instruct-2506

- Focus: Very reliable baseline
- MixBot: games=2 W-D-L=0-2-0 win=0% okTurns=100% p50/p95OkLatencyMs=8254/18147
  - pass=0% invalid=17% error=0% fallback=0%
  - captures/game=10 ttfCaptureAvgPly=3 supplyYield@10=0 supplyYieldEnd=1
  - seeds(outcome): 3:D, 3:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T05-09-47PST_oss30/chutes`, `replays/model_evals/2026-01-27T13-12-05-086Z`
- GreedyBot: games=0 W-D-L=0-0-0 win=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### chutes / moonshotai/Kimi-K2-Instruct-0905

- Focus: Strong non-reasoning contender
- MixBot: games=6 W-D-L=3-3-0 win=50% okTurns=100% p50/p95OkLatencyMs=8184/10234
  - pass=7% invalid=12% error=0% fallback=0%
  - captures/game=7 ttfCaptureAvgPly=1 supplyYield@10=1 supplyYieldEnd=2
  - seeds(outcome): 3:D, 3:D, 3:W, 3:W, 4:D, 5:W
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-28T19-50-58PST/chutes`, `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-28T19-50-58PST/chutes_v2`, `replays/model_evals/2026-01-27T13-12-05-086Z`, `replays/model_evals/2026-01-27T20-51-39-539Z`
- GreedyBot: games=4 W-D-L=2-1-1 win=50% okTurns=100% p50/p95OkLatencyMs=—/—
  - pass=4% invalid=22% error=0% fallback=0%
  - captures/game=11 ttfCaptureAvgPly=0 supplyYield@10=1 supplyYieldEnd=1
  - seeds(outcome): 3:D, 3:W, 4:W, 5:L
  - sources: `replays/model_evals/2026-01-27T21-07-47-937Z`, `replays/model_evals/2026-01-27T21-25-47-548Z`

### chutes / Qwen/Qwen3-Next-80B-A3B-Instruct

- Focus: Reliable + moderate latency
- MixBot: games=3 W-D-L=0-3-0 win=0% okTurns=100% p50/p95OkLatencyMs=5381/8920
  - pass=0% invalid=0% error=0% fallback=0%
  - captures/game=3 ttfCaptureAvgPly=4 supplyYield@10=0 supplyYieldEnd=1
  - seeds(outcome): 3:D, 3:D, 3:D
  - sources: `replays/chutes_vs_mix_30ply_40s_1g_2026-01-28T17-57-33PST`, `replays/model_evals/2026-01-27T13-12-05-086Z`, `replays/model_evals/oss_zeroerr_vs_mix_chutes_seed3_1game_tc30`
- GreedyBot: games=0 W-D-L=0-0-0 win=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### chutes / Qwen/Qwen2.5-VL-32B-Instruct

- Focus: Reliable + moderate latency
- MixBot: games=2 W-D-L=0-2-0 win=0% okTurns=100% p50/p95OkLatencyMs=2912/12615
  - pass=0% invalid=3% error=0% fallback=0%
  - captures/game=4 ttfCaptureAvgPly=0 supplyYield@10=0 supplyYieldEnd=0
  - seeds(outcome): 3:D, 3:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T05-09-47PST_oss30/chutes`, `replays/model_evals/oss_zeroerr_vs_mix_chutes_seed3_1game_tc30`
- GreedyBot: games=0 W-D-L=0-0-0 win=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### chutes / deepseek-ai/DeepSeek-R1-Distill-Llama-70B

- Focus: Low pass/error; some promise
- MixBot: games=2 W-D-L=0-2-0 win=0% okTurns=100% p50/p95OkLatencyMs=3852/5775
  - pass=0% invalid=50% error=0% fallback=0%
  - captures/game=10 ttfCaptureAvgPly=0 supplyYield@10=4 supplyYieldEnd=4
  - seeds(outcome): 3:D, 3:D
  - sources: `replays/chutes_reasoning_vs_mix_30ply_40s_1g_2026-01-28T18-23-38PST`, `replays/chutes_vs_mix_30ply_40s_1g_2026-01-28T17-57-33PST`
- GreedyBot: games=0 W-D-L=0-0-0 win=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### chutes / deepseek-ai/DeepSeek-V3.2-TEE

- Focus: Reliable but higher pass rate
- MixBot: games=3 W-D-L=1-2-0 win=33% okTurns=100% p50/p95OkLatencyMs=19678/25395
  - pass=6% invalid=3% error=0% fallback=0%
  - captures/game=6 ttfCaptureAvgPly=1 supplyYield@10=3 supplyYieldEnd=3
  - seeds(outcome): 3:W, 3:D, 3:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-28T19-50-58PST/chutes`, `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-28T19-50-58PST/chutes_v2`, `replays/model_evals/2026-01-27T13-12-05-086Z`
- GreedyBot: games=0 W-D-L=0-0-0 win=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### nanogpt / deepseek-ai/DeepSeek-V3.1

- Focus: Reliable + slow
- MixBot: games=3 W-D-L=0-3-0 win=0% okTurns=100% p50/p95OkLatencyMs=15620/19017
  - pass=0% invalid=0% error=0% fallback=0%
  - captures/game=5 ttfCaptureAvgPly=5 supplyYield@10=1 supplyYieldEnd=0
  - seeds(outcome): 3:D, 3:D, 3:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T05-09-47PST_oss30/nanogpt`, `replays/model_evals/2026-01-26T21-58-13-630Z`, `replays/model_evals/oss_zeroerr_vs_mix_nanogpt_seed3_1game_tc30`
- GreedyBot: games=0 W-D-L=0-0-0 win=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —

### nanogpt / Qwen/Qwen3-Next-80B-A3B-Instruct

- Focus: Reliable + slow
- MixBot: games=2 W-D-L=0-2-0 win=0% okTurns=100% p50/p95OkLatencyMs=18206/34479
  - pass=0% invalid=0% error=0% fallback=0%
  - captures/game=3 ttfCaptureAvgPly=6 supplyYield@10=1 supplyYieldEnd=1
  - seeds(outcome): 3:D, 3:D
  - sources: `replays/mix_30ply_60s_advert40_rationale_3to5_2026-01-29T05-09-47PST_oss30/nanogpt`, `replays/model_evals/oss_zeroerr_vs_mix_nanogpt_seed3_1game_tc30`
- GreedyBot: games=0 W-D-L=0-0-0 win=— okTurns=— p50/p95OkLatencyMs=—/—
  - pass=— invalid=— error=— fallback=—
  - captures/game=— ttfCaptureAvgPly=— supplyYield@10=— supplyYieldEnd=—
  - seeds(outcome): —
