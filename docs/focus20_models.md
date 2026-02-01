# Focus-20 Models (MixBot)

Selection intent:
- Models that reliably beat MixBot, or
- Models with failure/timeout issues that are still interesting (reasoning/hybrid/thinking and/or high latency).

## Focus list

| provider | model | config | why | key evidence |
|---|---|---|---|---|
| openrouter | x-ai/grok-4.1-fast |  | Beats Mix reliably | vs Mix: 4-0-0 (100% win) |
| chutes | tngtech/DeepSeek-R1T-Chimera |  | Beats Mix reliably | vs Mix: 6-1-0 (86% win) |
| cerebras | gpt-oss-120b | reasoning-effort=high, max-tokens=8000, stream=off, tools=off | Very strong when configured carefully | seed3 vs Mix: win; avg ok latency ~11.3s; 1 providerError turn |
| chutes | deepseek-ai/DeepSeek-V3-0324-TEE |  | Beats Mix reliably | vs Mix: 5-1-0 (83% win) |
| nanogpt | deepseek-ai/DeepSeek-V3.1-Terminus |  | Beats Mix (borderline) | vs Mix: 3-2-0 (60% win) |
| chutes | openai/gpt-oss-120b-TEE | reasoning-effort=low | Keeps strength but reduces thinking time | seed3 vs Mix: win; avg ok latency ~12.5s |
| chutes | openai/gpt-oss-120b-TEE | reasoning-effort=medium | Keep as slower/stronger variant | seed3 vs Mix (70s allowed): win; avg ok latency ~46.8s |
| chutes | openai/gpt-oss-20b |  | Keep (slow; mostly works) | seed3 vs Mix: draw; 1 providerError turn; avg ok latency ~23.8s |
| nanogpt | Qwen/Qwen3-235B-A22B-Thinking-2507 |  | Low error rate + thinking | vs Mix: 1-3-0; avg ok latency ~18.2s |
| nanogpt | deepseek-ai/DeepSeek-V3.1-Terminus:thinking |  | Low error rate + thinking | vs Mix: 0-3-0; avg ok latency ~22.4s |
| nanogpt | zai-org/GLM-4.5:thinking |  | Slow + thinking (stress test) | vs Mix: 0-2-0; avg ok latency ~41.2s |
| chutes | chutesai/Mistral-Small-3.1-24B-Instruct-2503 |  | Very reliable baseline | vs Mix: 3-5-0; avg ok latency ~10.9s |
| chutes | chutesai/Mistral-Small-3.2-24B-Instruct-2506 |  | Very reliable baseline | vs Mix: 0-2-0; avg ok latency ~10.5s |
| chutes | moonshotai/Kimi-K2-Instruct-0905 |  | Strong non-reasoning contender | vs Mix: 3-3-0 (50% win) |
| chutes | Qwen/Qwen3-Next-80B-A3B-Instruct |  | Reliable + moderate latency | vs Mix: 0-3-0; avg ok latency ~5.8s |
| chutes | Qwen/Qwen2.5-VL-32B-Instruct |  | Reliable + moderate latency | vs Mix: 0-2-0; avg ok latency ~5.0s |
| chutes | deepseek-ai/DeepSeek-R1-Distill-Llama-70B |  | Low pass/error; some promise | vs Mix: 0-2-0; avg ok latency ~4.0s |
| chutes | deepseek-ai/DeepSeek-V3.2-TEE |  | Reliable but higher pass rate | vs Mix: 1-2-0; avg ok latency ~19.3s |
| nanogpt | deepseek-ai/DeepSeek-V3.1 |  | Reliable + slow | vs Mix: 0-3-0; avg ok latency ~14.6s |
| nanogpt | Qwen/Qwen3-Next-80B-A3B-Instruct |  | Reliable + slow | vs Mix: 0-2-0; avg ok latency ~20.6s |

## Stats snapshot (plies <= 30 only)

Notes:
- Aggregates over all matching replays vs MixBot with `plies <= 30`.
- “ok turns” excludes turns whose `rationaleText` starts with `server:` (provider/parse failures); latency stats are computed only over ok turns.

| provider | model | config | games | W-D-L | win | non-loss | ok turns | avg ok latency (ms) | p95 ok latency (ms) | avg plies | avg pass/game | avg providerErr/game |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| openrouter | x-ai/grok-4.1-fast |  | 4 | 4-0-0 | 100% | 100% | 13/13 (100%) | 32689 | 38249 | 5.5 | 0.0 | 0.0 |
| chutes | tngtech/DeepSeek-R1T-Chimera |  | 7 | 6-1-0 | 86% | 100% | 55/55 (100%) | 6053 | 11303 | 14.9 | 0.0 | 0.0 |
| chutes | deepseek-ai/DeepSeek-V3-0324-TEE |  | 6 | 5-1-0 | 83% | 100% | 58/58 (100%) | 13061 | 21949 | 18.5 | 0.17 | 0.0 |
| nanogpt | deepseek-ai/DeepSeek-V3.1-Terminus |  | 5 | 3-2-0 | 60% | 100% | 27/32 (84%) | 27159 | 50812 | 11.8 | 1.2 | 1.0 |
| chutes | openai/gpt-oss-120b-TEE | reasoning-effort=low | 1 | 1-0-0 | 100% | 100% | 10/10 (100%) | 12497 | 24291 | 19 | 0.0 | 0.0 |
| chutes | openai/gpt-oss-120b-TEE | reasoning-effort=medium | 2 | 1-1-0 | 50% | 100% | 7/8 (88%) | 46784 | 66872 | 7 | 0.5 | 0.5 |
| chutes | openai/gpt-oss-20b |  | 1 | 0-1-0 | 0% | 100% | 13/14 (93%) | 20976 | 51395 | 27 | 1.0 | 1.0 |
| cerebras | gpt-oss-120b | reasoning-effort=high, max-tokens=8000, stream=off, tools=off | 1 | 1-0-0 | 100% | 100% | 2/3 (67%) | 11341 | 13857 | 5 | 1.0 | 1.0 |
| nanogpt | Qwen/Qwen3-235B-A22B-Thinking-2507 |  | 4 | 1-3-0 | 25% | 100% | 35/39 (90%) | 18159 | 20839 | 18.8 | 1.5 | 1.0 |
| nanogpt | deepseek-ai/DeepSeek-V3.1-Terminus:thinking |  | 3 | 0-3-0 | 0% | 100% | 29/32 (91%) | 22355 | 42815 | 21 | 1.0 | 1.0 |
| nanogpt | zai-org/GLM-4.5:thinking |  | 2 | 0-2-0 | 0% | 100% | 9/12 (75%) | 37439 | 41588 | 11 | 1.5 | 1.5 |
| chutes | chutesai/Mistral-Small-3.1-24B-Instruct-2503 |  | 8 | 3-5-0 | 38% | 100% | 77/77 (100%) | 12667 | 24838 | 18.9 | 0.0 | 0.0 |
| chutes | chutesai/Mistral-Small-3.2-24B-Instruct-2506 |  | 2 | 0-2-0 | 0% | 100% | 30/30 (100%) | 10513 | 29474 | 30 | 0.0 | 0.0 |
| chutes | moonshotai/Kimi-K2-Instruct-0905 |  | 6 | 3-3-0 | 50% | 100% | 55/58 (95%) | 8215 | 10508 | 18.7 | 0.67 | 0.5 |
| chutes | Qwen/Qwen3-Next-80B-A3B-Instruct |  | 3 | 0-3-0 | 0% | 100% | 45/45 (100%) | 5768 | 9323 | 30 | 0.0 | 0.0 |
| chutes | Qwen/Qwen2.5-VL-32B-Instruct |  | 2 | 0-2-0 | 0% | 100% | 30/30 (100%) | 5028 | 12939 | 30 | 0.0 | 0.0 |
| chutes | deepseek-ai/DeepSeek-R1-Distill-Llama-70B |  | 2 | 0-2-0 | 0% | 100% | 30/30 (100%) | 4027 | 5827 | 30 | 0.0 | 0.0 |
| chutes | deepseek-ai/DeepSeek-V3.2-TEE |  | 3 | 1-2-0 | 33% | 100% | 34/35 (97%) | 19267 | 26864 | 22.7 | 0.67 | 0.33 |
| nanogpt | deepseek-ai/DeepSeek-V3.1 |  | 3 | 0-3-0 | 0% | 100% | 40/40 (100%) | 14590 | 23503 | 26.7 | 0.0 | 0.0 |
| nanogpt | Qwen/Qwen3-Next-80B-A3B-Instruct |  | 2 | 0-2-0 | 0% | 100% | 30/30 (100%) | 20553 | 34606 | 30 | 0.0 | 0.0 |
