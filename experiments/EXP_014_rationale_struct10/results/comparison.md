# EXP_014_rationale_struct10 - Comparison

Generated: 2026-03-05T20:31:07.448-08:00
Control: `control`  Variant: `variant_struct10`

## Outcomes

| Metric | Control | Variant | Delta (Variant-Control) |
|---|---:|---:|---:|
| Games | 3 | 3 | 0 |
| Wins | 3 | 3 | 0 |
| Draws | 0 | 0 | 0 |
| Losses | 0 | 0 | 0 |
| Avg plies to win | 15.67 | 12.33 | -3.33 |

## Latency (agent turns)

| Metric | Control | Variant | Delta |
|---|---:|---:|---:|
| Turn count | 25 | 20 | -5 |
| Avg latency ms | 11575.84 | 9108.10 | -2467.74 |
| P50 latency ms | 10188.00 | 9706.00 | -482.00 |
| P95 latency ms | 15805.00 | 10991.00 | -4814.00 |

## Token usage

| Metric | Control | Variant | Delta |
|---|---:|---:|---:|
| Usage rows found | 25 | 20 | -5 |
| Total prompt tokens | 54897 | 44733 | -10164 |
| Total completion tokens | 22882 | 21619 | -1263 |
| Total reasoning tokens | 0 | 0 | 0 |
| Total tokens | 77779 | 66352 | -11427 |
| Avg total tokens / turn | 3111.16 | 3317.60 | 206.44 |

## Strict suboptimal reinforce behavior
Definition: on a P1 turn, if max affordable reinforce at turn start (after income) > actually applied reinforce amount that turn.

| Metric | Control | Variant | Delta |
|---|---:|---:|---:|
| Agent turns | 25 | 20 | -5 |
| Turns with reinforce capacity | 25 | 20 | -5 |
| Strict suboptimal turns | 0 | 0 | 0 |
| Strict suboptimal rate | 0.0% | 0.0% | 0.0% |
| Missed reinforce strength total | 0 | 0 | 0 |

## Sources
- Control state: `experiments/EXP_014_rationale_struct10/conditions/control.json`
- Variant state: `experiments/EXP_014_rationale_struct10/conditions/variant_struct10.json`
- Replay index: `experiments/EXP_014_rationale_struct10/results/replay_index.csv`
- Control run manifest: `runs/experiment_logs/EXP_014_rationale_struct10/control/manifest.json`
- Variant run manifest: `runs/experiment_logs/EXP_014_rationale_struct10/variant_struct10/manifest.json`
