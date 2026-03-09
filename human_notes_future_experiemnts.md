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
