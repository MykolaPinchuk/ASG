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
