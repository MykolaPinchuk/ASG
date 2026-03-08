# Future Experiment Ideas (Parking Lot)

Status: queued ideas only. Do not treat as approved runs until explicitly requested.

## EXP_016_enemy_supply_salience_sentence

- Status: queued (not run)
- Context: in multiple replays, the agent often does not recapture enemy-taken supply nodes even when the node is left empty and recapture is cheap.

Hypothesis:
- A minimal salience nudge (one sentence) may improve enemy-state awareness and free-supply recapture behavior without hardcoding strategy scripts.

Planned change (single-variable):
- Add exactly one sentence to general action instructions:
  - "Explicitly evaluate enemy-controlled supply nodes and whether a low-cost recapture is available this ply."

Why this is acceptable:
- This is a generic attention/salience instruction, not a fixed tactical script (it does not force a specific action).

Suggested A/B:
- Control: current EXP015-style prompt (no new sentence).
- Variant: control + one sentence above.
- Keep all other settings fixed (model/provider/seeds/opponent/horizon/rationale style).

Suggested first run:
- Opponent: `greedy`
- Seeds: `301,302,303` (then extend with `304,305,306` if signal is unclear)
- Horizon: `turnCapPlies=30`

Primary metric to inspect:
- Missed free recapture opportunities in replay review.

Standard metrics to record:
- W/D/L, provider-error turns, pass turns, invalid-action turns, captures/game, latency p50/p95.
