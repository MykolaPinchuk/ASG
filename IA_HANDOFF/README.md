# Implementation Agent Handoff Bundle

This directory is a copy-friendly bundle of everything the implementation agent might need.

Note: this repo now has canonical copies of these artifacts at:
- `docs/planning/` (planning/spec docs)
- `scenarios/` (scenario JSON)
- `schemas/` (JSON schemas)
- `prototype_optional/` (optional TS prototype)

Treat `IA_HANDOFF/` as an immutable snapshot; update the canonical paths instead.

## What to copy to the implementation workspace

Recommended: copy the entire `IA_HANDOFF/` directory.

If you want the minimum set, copy:
- `IA_HANDOFF/planning/` (all planning/spec docs)
- `IA_HANDOFF/data/` (scenario + schemas)

The `IA_HANDOFF/prototype_optional/` folder contains an existing prototype implementation that the next agent can reuse *or ignore*.

## Start here (implementation agent)

1. `IA_HANDOFF/planning/HANDOFF.md`
2. `IA_HANDOFF/planning/MVP_SPEC.md` (source of truth)
3. `IA_HANDOFF/planning/DECISIONS.md`

Workspace for the original Exploration + Planning from which this dir was copied is nonrepos/ASG
