# A2A Notes

## Experiment Clarity Rule (Mandatory)

- Before running any new experiment, the agent must have 100% clarity on:
  - exact baseline prompt/code state,
  - exact variant change(s),
  - whether this is isolated (single-variable) or intentionally cumulative.
- If any of the above is ambiguous, the agent must stop and ask the human before proceeding.
- Do not infer intent from prior experiments being "concluded/rejected" unless code state is explicitly verified.

## Required Pre-Run Check (Prompt Experiments)

- State in plain text before run:
  - baseline source (file/condition/seeds),
  - variant source (what exact lines/logic differ),
  - expected diff size (line-level, if applicable),
  - run label (`experimentId`, `conditionId`, `baselineConditionId`).
- If baseline/variant isolation cannot be proven, do not run.

## Failure Pattern to Avoid

- A rejected experiment in tracking docs does not auto-revert runtime code.
- Always verify runtime prompt/code state directly before launching the next experiment.

## Current Prompt Baseline (as of 2026-03-08)

- Adopted baseline prompt file for prompt-ablation guards:
  - `experiments/baselines/system_prompt_act_exp023.txt`
- When moving to stronger models, explicitly re-test whether high performance holds with less explicit guidance.

## Current Model Roles (as of 2026-03-08)

- Primary model for prompt/rules ablations:
  - OpenRouter `google/gemini-3.1-flash-lite-preview` with `reasoning-effort=medium`.
- Secondary model (fallback qualifier):
  - OpenRouter `xiaomi/mimo-v2-flash` with `reasoning-effort=low`.
  - Force Xiaomi routing in evals: `--openrouter-provider-only xiaomi --openrouter-allow-fallbacks false`.
  - Use extended runtime budget for this model: `--timeout-ms 120000 --agent-timeout-ms 130000`.

## Memory Experiment Lesson (as of 2026-03-09)

- `EXP_035` / `EXP_036` / `EXP_037` tested derived last-full-turn memory and stricter `memory_update` wording.
- Both Gemini and Mimo ignored the free-text `memory_update` field even when prompt wording said it MUST be included whenever next-turn-useful.
- Conclusion: optional/conditional free-text memory fields are not a reliable test of agent-authored memory here.
- If continuing memory work, prefer:
  - required structured memory fields in the response schema, or
  - purely code-derived memory blocks without depending on model-authored note fields.
