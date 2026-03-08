# Prompt/Context Token Baseline (Scenario 01, v07)

Purpose: record a concrete token baseline for current prompt/context shape, so future work on richer game representation has a stable reference.

## Scope of this baseline

- Model/provider path: OpenRouter `google/gemini-3.1-flash-lite-preview`
- Harness mode: `promptMode=compact`, `rationaleStyle=structured10`, no memory/warmup/repair context injected.
- Measurement source:
  - live per-turn `usage.prompt_tokens` from provider responses;
  - differential remove-one-section prompt tests against the same provider/model.
- Reference example used for section decomposition:
  - run: `EXP_014_rationale_struct10`
  - seed/ply: seed `304`, ply `0` from `variant_struct10_plus3`.

## Top-level rule of thumb

For current setup, prompt tokens per turn are typically around:

- rules/instructions (system prompt): ~1000
- game/context payload (user JSON): ~1000-1100
- total prompt: ~2000-2200

This is why the shorthand "about 1k instructions + 1k state/context" is fair for now.

## Approx section breakdown (compact user prompt)

Numbers below are differential estimates (`base - prompt_without_section`), so they are approximate and not perfectly additive.

- System prompt (all instructions/rules): ~1000
- User prefix (`Decide...`, `Return JSON only`, `Context:`): ~17
- Metadata/settings/supplies (`match_id`, `player`, `scenario_id`, `ply`, `action_budget`, `hq`, `settings`, `supplies`): ~136
- `supplyNodes`: ~32
- `legal.reinforce`: ~26
- `legal.moves`: ~21
- `legal.notes`: ~68
- `adjacency`: ~179
- `board` (node owner/forces/supply): ~354
- `distances` (to HQs): ~248

System prompt subparts (same style):

- time-limit line: ~42
- think-hint line: ~10
- structured-10 rationale instruction overhead vs concise: ~36

## Key implication for future complex setups

State representation already dominates most of the non-system budget:

- `board + adjacency + distances` is the largest share of context payload.
- As map complexity grows, token pressure will scale mostly through these fields.

So representation work (what to include, what to summarize, what to derive) is a first-class optimization axis, not just a formatting detail.

## Practical guidance for upcoming experiments

- Keep this document as the baseline anchor.
- When changing map/state representation, report:
  - avg prompt tokens/turn,
  - avg completion tokens/turn,
  - W-D-L / tempo deltas,
  - latency/cost deltas.
- Prefer single-variable ablations on representation fields (`adjacency`, `board`, `distances`, legal action framing, summaries).
