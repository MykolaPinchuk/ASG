## Experiment taxonomy and priority

### 1. Memory / statefulness

Goal: move beyond the current fully stateless harness and test whether carrying forward information across plies materially improves rule-following, tactical coherence, and exploit detection.

Why this matters:
- This is the clearest known limitation of the current setup.
- It changes agent capability, not just wording.
- It should be explored in the current simple environment before changing game rules.

Candidate directions:
- inline memory update appended each turn
- bounded rolling history of states/actions/rationales
- separate warmup / pre-play exploration phase
- self-written notes passed into future turns
- post-play reflection, critique, and suggestions
- provide full logs of several games to a Thinker agent and ask to analysze them, both agent behavior, and opponent behavior.

Priority: highest near-term category.

### 2. Prompt simplification

Goal: reduce instruction heaviness and identify the minimum prompt that still preserves strong behavior.

Why this matters:
- Current prompt may be effective but over-specified.
- This is important for robustness and future transfer to stronger models.

Candidate directions:
- remove or soften chain-direction guidance
- remove or soften action-budget-use reminders
- simplify explicit tactical wording while keeping format/mechanics clear

Priority: medium.

### 3. Behavior probes

Goal: test narrow hypotheses about specific agent weaknesses in the current setup.

Why this matters:
- These experiments are cheap and interpretable.
- They help identify which missing behaviors are actually causal.

Candidate directions:
- tell agent to use full action budget unless there is a reason not to
- tell agent to inspect enemy positioning and exploit weak points
- add enemy-supply salience reminder
- tell agent how `greedy` works and test whether it exploits this

Priority: medium-high, especially after or alongside early memory work.

### 4. Harness / control mechanics

Goal: improve runtime behavior without changing core game rules.

Why this matters:
- Some gains may come from better control policy rather than prompt wording.
- This can reduce provider noise and improve observability.

Candidate directions:
- retry / repair loop changes
- timeout budget tuning
- reasoning-effort or rationale-style changes
- provider-routing controls

Priority: medium, but not the main scientific question right now.

### 5. New game setups / rules

Goal: test whether findings transfer once the environment becomes meaningfully different.

Why this matters:
- Long-term this is necessary.
- Short-term it is higher variance and easier to misread.

Candidate directions:
- larger or differently structured maps
- altered supply or combat rules
- more complex action space
- future partial observability or fog-of-war

Priority: later, after at least one stronger agent setup exists in the current environment.

### 6. Agent-vs-agent evaluation

Goal: test behavior against adaptive opponents rather than only fixed scripted baselines.

Why this matters:
- Agent-vs-greedy can hide weaknesses.
- Self-play or agent-vs-agent is closer to the long-run target.

Candidate directions:
- current agent vs current agent
- model A vs model B
- self-play under fixed seeds

Priority: later. Useful once one stack is stable enough to be a meaningful benchmark.

## Recommended order

1. Memory / statefulness in the current setup.
2. Targeted behavior probes on top of that baseline.
3. Prompt simplification once we know which guidance is still needed.
4. Harness/control tuning where it clearly improves reliability or observability.
5. New game setups / rules.
6. Agent-vs-agent evaluation.

## Shortlist of near-term experiments

### Tier 1: do soon

- Memory A: append a short structured memory update each ply, generated inline by the acting model.
- Memory B: append a bounded rolling history of recent states/actions/rationales.
- Behavior probe: explicitly tell the agent to use full action budget unless there is a concrete reason not to.
- Behavior probe: explicitly tell the agent to inspect enemy supply nodes and cheap recapture opportunities.

### Tier 2: do after first memory signal

- Behavior probe: tell the agent to inspect enemy positioning for immediate exploit opportunities.
- Opponent-model probe: tell the agent how `greedy` behaves and test whether it exploits this.
- Prompt simplification: remove some explicit chain-direction/helpful tactical wording from the current baseline and measure degradation.

### Tier 3: later / broader scope

- Replay-analysis loop: provide one successful and one unsuccessful game history and ask for targeted improvement advice.
- Larger-scale replay analysis: provide a batch of games and ask the model to produce future-agent instructions.
- New map/rule experiments.
- Agent-vs-agent baselines.

## some experiemnts to try:

- [recorded 2026-03-09] `EXP_034_mimo_low_explicit_vs_less_explicit_s6` (post-EXP024 rules): Mimo low (Xiaomi-only, timeout120) went 6/6 under both prompts, but current explicit baseline was materially more efficient than older less-explicit instructions (avg plies 7.0 vs 11.33; lower latency/tokens per turn).
- [recorded 2026-03-09] Cross-model status (post-EXP024 rules): we have Mimo explicit+less-explicit and Gemini explicit (`EXP_024`) in comparable epoch, but **Gemini less-explicit in post-EXP024 epoch is still missing**, so strict 2x2 model comparison is incomplete.
- [recorded 2026-03-09] Model-role decision: keep `xiaomi/mimo-v2-flash` as a **secondary** model for now; we may promote it to primary later if needed. Cost note: Mimo is estimated around **60% cheaper** than `google/gemini-3.1-flash-lite-preview`.

- [recorded 2026-03-08] Adopt EXP023 as new prompt baseline for this model family (faster wins + better win delta vs legacy baseline).
- [concern, recorded 2026-03-08] Guidance may be becoming too explicit/instruction-heavy. Keep this as pragmatic baseline for now, but revisit when testing stronger models.
- [future check] For stronger models, run A/B where explicit chain-direction guidance is removed/reduced to test whether similar performance can emerge without hand-holding.

- [recorded 2026-03-08] EXP021 (chain combat clarification) looked somewhat promising: better win outcomes on matched 6 seeds, but not dramatic.
- [recorded 2026-03-08] EXP022 (EXP021 + "chained moves can be used for very fast wins") did not meet expectation: wins stayed high, but captures dropped more and provider-error turns increased vs baseline.

- [tried as exp015, no clear improvement] structured thinking: try better ordering. game state, then enemy state, then plans, then actions. and Have them display clearly as headlines in the UI. Do it as a harness-level parsing if posisble.

- separately, try minimax m2.1 out.




- try more detailed instructions. specifically, tell agent to keep in mind how many actions it has and use them in full unless there is a specific reason not to. And tell it to remember chained moves functionality and to use it in full.

- concatenate full histry of some game as a sequence of game states, actions, and provided agent reasoning. Then give it to an agent, and ask it to think about it and analyze agent actions and reasoning, and then to suggest improvements to the agent's play and reasoning. See if it can identify specific mistakes or missed opportunities in the game, and if it can suggest concrete ways to improve the agent's performance in future games.

- tell agent how scriptrd greedy bot (its opponent) works. See whether agent can use this knowledge to do better.

- get full histry of one successful agme (win in less then 12 ply) and one unsuccessful game by the same model (draw or loss). Give such histry to an agent as together with general input in each step.

- do larger scale analysis of games. Try like 10 games, and then ask agent to explore and analyze them. then ask it to provide additional instructions/advice which we think future agme-llaying agent may benefit from. Such instructions will be added to each turn context.

- tell it to carefully explore enemy positioning and think what it means.

- if previous one fails, explicitly tell it to look at enemy and think whether there opportunities to exploit.

- if even that does not lead to obvious immediate victories, tell agent directly to look for such opportunities.

- have the same modeldo one step of hard thinking and produce some extra instructions which in its opinion should be useful for future game-playing agents. 
