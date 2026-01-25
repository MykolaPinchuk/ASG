# Roadmap (Planning, Post-MVP)

This is a directional roadmap. It exists to preserve optionality and prevent the MVP from painting us into a corner.

## MVP v0 (current target)

Defined by:
- `MVP_SPEC.md` (rules)
- `scenarios/scenario_01.json` (content)
- `IMPLEMENTATION_PLAN.md` (milestones)

Perfect-information positions, graph-with-coordinates map, tiny action set, HQ capture win condition.

## MVP v0.x (hardening)

- Add simulation tooling for tuning (`TUNING_PROTOCOL.md`) and reduce draw rate via parameter tweaks before adding mechanics.
- Improve baseline scripted bots (still using the same observation→action interface).
- Improve viewer usability (timeline, filters, summaries) per `VIEWER_SPEC.md`.
- Freeze and version replay formats per `FORMATS_AND_VERSIONING.md`.

## v1 — First meaningful uncertainty (recommended: positional fog-of-war)

Add:
- visibility rules on the graph (per-node visibility radius / adjacency-based visibility)
- scouting action(s) and/or recon mechanics
- player-specific `Observation` becomes partial
- viewer’s POV/Diff modes become truly informative

Keep action vocabulary small; the goal is to introduce inference without changing the entire game.

## v2 — Hidden tech/composition (signals-based)

Add:
- a small number of upgrades or unit “traits”
- partial revelation via combat/scouting signals
- rationale traces become more interesting (“beliefs with confidence”)

Expectation: we may iterate on **v2 for a long time** (adding depth and varied scenario packs) before taking on major structural changes like WEGO.

### v2+ enhancement pool (speculative examples)

These are intentionally non-committal; they’re examples of “things we might explore” while staying in the v2 family.

- **Richer unit traits → unit customization**:
  - upgrade trees or modular loadouts
  - composition inference via signals (scouting/combat outcomes)
- **Expanded action space at build-time**:
  - choose what to build (types/traits), where to build, and timing trade-offs
- **Expanded action space at command-time**:
  - more expressive orders (stances, targeting priorities, grouping/splitting constraints)
  - higher-level movement commands for large graphs/grids
- **Unit-level (or squad-level) agents in late versions**:
  - a “commander” agent sets intent; sub-agents control subsets under constrained comms
  - good fit if command granularity becomes a research focus

## v3+ — WEGO and Multi-agent teams (order flexible)

These are both high-value directions, but the order is intentionally **not fixed**. We may do multi-agent teams before WEGO.

### WEGO (simultaneous planning + resolution)

Add:
- simultaneous action submission
- simultaneous resolution ordering rules
- “hidden commitments” and bluffing

### Multi-agent teams per side

Add:
- role-separated controllers (econ/ops/scout) with constrained comms
- explicit arbitration mechanism + trace logs for disagreement

## Grid path (optional)

If/when moving to a grid:
- treat grid as a special-case graph (lattice) so core engine interfaces remain intact
- avoid branching blow-up via high-level movement orders or hierarchical regions

## Environment drift / auto-balance policy (future)

If you add an automated “balance / fine-tune agent”:
- it MUST NOT silently change the environment used for evaluation
- changes should be versioned, reviewed, and explicitly selected for runs
- keep “scenario sets” stable for comparability; introduce new sets rather than mutating old ones
