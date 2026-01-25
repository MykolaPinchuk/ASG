# ASG MVP (WIP)

This folder contains an early MVP skeleton for a graph-based strategy game designed for LLM-agent evaluation.

## Planning docs

- `DECISIONS.md` — decision log
- `MVP_SPEC.md` — normative MVP rules
- `MVP_DRAFT.md` — exploration notes + tunables
- `IMPLEMENTATION_PLAN.md` — milestone plan
- `AGENT_API_SPEC.md` — HTTP agent interface (future)
- `FORMATS_AND_VERSIONING.md` — versioning policy
- `TUNING_PROTOCOL.md` — parameter tuning approach
- `VIEWER_SPEC.md` — viewer requirements
- `schemas/README.md` — JSON schemas
- `ROADMAP.md` — post-MVP direction
- `HANDOFF.md` — checklist for next implementation agent

## Run a match (scripted bots)

```bash
npm install
npm run match -- --scenario scenarios/scenario_01.json --p1 greedy --p2 greedy --seed 1 --out replays/run.json
```

## Watch a replay

- Open `viewer/index.html` in a browser.
- Load the replay JSON (e.g., `replays/run.json`).
