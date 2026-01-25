# Decision Log

This file records key project decisions, alternatives considered, and rationale so we can revisit/pivot later without losing context.

## Format

- Date:
- Decision:
- Context:
- Options considered:
- Rationale:
- Consequences / follow-ups:

---

## 2026-01-25 — Watchability time budget refers to human watch-time

- Date: 2026-01-25
- Decision: The 20–30 minute limit is for human watch-time (not necessarily wall-clock compute time).
- Context: LLM turns may take variable time; replays can be watched faster or at fixed pacing.
- Options considered:
  - Treat as wall-clock requirement (hard constraints on LLM latency / turn time)
  - Treat as watch-time requirement (replay pacing / summary-driven watching)
- Rationale: The core constraint is “does it feel like work to watch”; compute latency can be engineered around with replays and pacing controls.
- Consequences / follow-ups:
  - Design UI/replay viewer early (speed controls; per-turn summary views).
  - Still keep turn counts bounded so a 1× replay fits the window.

## 2026-01-25 — MVP can prioritize macro territory/econ to reduce engineering risk

- Date: 2026-01-25
- Decision: Prefer a macro territory/economy representation for MVP if it reduces implementation complexity and risk.
- Context: Grid-tactics representations tend to explode state/action unless aggressively simplified.
- Options considered:
  - Grid tactics (few units, strict action limits)
  - Macro zones/graph (few entities, high-level actions)
- Rationale: Macro territory/econ naturally fits bounded I/O and a small action vocabulary while still supporting uncertainty + adversarial dynamics.
- Consequences / follow-ups:
  - Pick a concrete representation (graph/zones vs coarse grid) before locking schemas.

## 2026-01-25 — MVP map representation: graph with coordinates (grid-compatible)

- Date: 2026-01-25
- Decision: MVP uses a graph of locations with 2D coordinates for visualization; keep an explicit path to a future grid by treating “grid” as a special case of a graph.
- Context: Graph-with-coordinates gives low engineering risk while still looking like a “map”. A grid can be represented as a regular lattice graph if we later want tile-level movement.
- Options considered:
  - Hand-authored region graph (nodes + edges) with coordinates
  - Coarse grid immediately
  - Hybrid (graph now, grid later)
- Rationale: Graph is the minimal representation that supports movement, control, objectives, and watchability; adding coordinates avoids a purely abstract UI. Future grid is preserved by designing around generic “LocationId” + adjacency rather than “regions only”.
- Consequences / follow-ups:
  - Use a `Map` abstraction that answers “neighbors / distance / path” so `GraphMap` and a future `GridMap` can share the same engine/controller interface.
  - Keep actions/observations referencing `location_id` (not geometry-specific commands); geometry is for UI/rendering.
  - If we ever go to large grids, keep action branching bounded via higher-level movement (e.g., “move to target within range” with engine-chosen path) or region aggregation layers.

## 2026-01-25 — MVP scale: ~12 nodes, architecture scales to large graphs/grids

- Date: 2026-01-25
- Decision: Start MVP scenarios around ~12 nodes, but design the engine and API so we can later scale to many more nodes (or a true grid) without redesigning core interfaces.
- Context: MVP needs bounded state/action for fast iteration; longer-term research value wants larger maps.
- Options considered:
  - Hard-code small maps
  - Data-driven map definition with generic `LocationId` + adjacency (recommended)
- Rationale: Separates “rules engine” from “scenario content”, and preserves a path to larger environments.
- Consequences / follow-ups:
  - Observation schema needs a future path to compression / query tools for large maps.
  - Action schema should remain high-level enough to avoid branching explosion on large grids.

## 2026-01-25 — MVP path: bots-first, then agents

- Date: 2026-01-25
- Decision: Build a “no-agent” MVP first (scripted bot vs scripted bot), then replace one side with an LLM agent, then both sides, then multi-agent teams later.
- Context: You want an iterative build that proves the game loop is fun/stable before adding agent integration complexity.
- Options considered:
  - Start with LLM agents immediately
  - Start with scripted bots that use the same action interface
- Rationale: Bots-first de-risks the engine, rules, UI, replay, and balance iteration while keeping the agent interface clean.
- Consequences / follow-ups:
  - Define a single “PlayerController” interface that both scripted bots and LLM agents implement.
  - Keep rules deterministic/seeded from day 1 for replay/debugging.

## 2026-01-25 — MVP can start with perfect-information positions

- Date: 2026-01-25
- Decision: For MVP, unit/army positions can be fully known (no positional fog-of-war); positional uncertainty can be added later.
- Context: Fog-of-war and visibility rules add UI, rules, and observation-schema complexity.
- Options considered:
  - Start with positional fog-of-war + scouting
  - Start with perfect-information positions
- Rationale: De-risk the core game loop and controller API before adding a hard-to-debug uncertainty layer.
- Consequences / follow-ups:
  - Keep the state model “visibility-aware” so we can add fog-of-war without rewriting everything.
  - Introduce uncertainty later via positions, tech/composition, economy signals, or WEGO commitments.

## 2026-01-25 — MVP win condition: destroy HQ (else draw)

- Date: 2026-01-25
- Decision: A match ends when a player destroys the opponent HQ; otherwise the game is a draw.
- Context: You want a crisp, watchable end condition without early complexity from multi-objective scoring systems.
- Options considered:
  - Destroy HQ (binary win)
  - VP ticking / territory scoring tie-break
  - Fixed turn cap + scoring
- Rationale: “Destroy HQ” is an intuitive, legible objective for viewers and aligns with conflict-forcing goals; tie-break scoring can be added later if draws are too frequent.
- Consequences / follow-ups:
  - We still need an anti-stalemate forcing function (even if the official result is “draw”) so most games actually reach an HQ kill within the watch-time budget.

## 2026-01-25 — MVP HQ semantics: capture the HQ node (no HQ HP)

- Date: 2026-01-25
- Decision: For MVP, “destroy HQ” is implemented as **capturing the HQ node** (occupy it with no enemy forces present). No separate HQ HP bar.
- Context: HQ HP + siege rules are expressive but add state, UI, and edge cases.
- Options considered:
  - Capture HQ node (chosen)
  - Separate HQ HP + siege damage
- Rationale: Keep MVP end condition simple and deterministic; add siege/HP later only if needed for pacing.
- Consequences / follow-ups:
  - If draws remain too frequent, consider adding siege pressure as a follow-up mechanic (not part of MVP core spec).

## 2026-01-25 — MVP anti-stalemate approach: contested economy + turn cap

- Date: 2026-01-25
- Decision: For MVP, force conflict primarily via **contested resource nodes** that drive reinforcements, plus a hard **turn cap** (draw if no HQ kill).
- Context: You want most matches to have a clear arc and finish within the watch-time budget without adding many mechanics up front.
- Options considered:
  - Economy-driven conflict (contested resources) + turn cap (chosen)
  - Siege clock (adjacent-to-HQ damage)
  - Escalation clock (income ramps / defense decays)
- Rationale: Economy contest is the simplest forcing function that still scales to bigger maps and supports later uncertainty layers; siege/escalation can be added only if draws are too frequent.
- Consequences / follow-ups:
  - Tune `base_income`, `supply_yield`, and starting HQ strength so winning without contesting resources is unlikely.
  - Add siege/escalation later only if empirical draw rate is too high.

## 2026-01-25 — MVP core mechanics defaults (tentative)

- Date: 2026-01-25
- Decision: For MVP defaults, use: (a) one stack per node, (b) single resource “Supply”, (c) seeded low-variance combat randomness with transparent odds (with deterministic fallback during early debugging).
- Context: You accepted these as the lowest-risk defaults to support bounded I/O and watchability.
- Options considered:
  - Multiple unit types / per-unit tactics
  - Multi-resource economies
  - High-variance RNG vs deterministic
- Rationale: Keeps early implementation and bot baselines tractable while still producing uncertainty/tension via bounded RNG.
- Consequences / follow-ups:
  - Define an explicit action budget per turn (to bound branching).
  - Define combat logs that show odds + seed so replays are explainable.

## 2026-01-25 — MVP move amount: free integer (discretize only if needed)

- Date: 2026-01-25
- Decision: For MVP, `move.amount` is a **free positive integer** up to available strength. If branching or degenerate “fractional splits” become a problem, discretize later (e.g. `{all, half, 1}`).
- Context: Discretization reduces branching but can also make play feel stiff and arbitrary.
- Options considered:
  - Free integer (chosen)
  - Discretized move amounts
- Rationale: Start flexible; only add constraints once real failure modes appear.
- Consequences / follow-ups:
  - If discretized later, bump formats/spec versions as needed.

## 2026-01-25 — Scenario 01 connectivity: start without lane connector

- Date: 2026-01-25
- Decision: Scenario 01 starts **without** the optional `mid_n—mid_s` connector edge; add it later only if lane-lock stalemates are common.
- Context: Extra connectivity increases tactical options but can reduce clarity and make early balance harder.
- Options considered:
  - No connector (chosen)
  - Add connector immediately
- Rationale: Prefer the simplest map; treat connector as a tunable “deadlock breaker”.
- Consequences / follow-ups:
  - If draws are frequent due to lane deadlocks, try adding this edge before adding new mechanics.

## 2026-01-25 — Viewer should support both omni and per-player POV

- Date: 2026-01-25
- Decision: Support both omniscient and per-player knowledge views; ideally a way to compare them.
- Context: Watchability benefits from omniscient clarity; agent behavior analysis benefits from seeing what each player actually knew.
- Options considered:
  - Omni-only
  - POV-only
  - Toggle/compare modes (recommended)
- Rationale: The contrast (“what the agent knew vs ground truth”) is itself interesting and informative.
- Consequences / follow-ups:
  - Model per-player observations explicitly (not derived from UI).
  - UI modes: `Omni`, `P1 POV`, `P2 POV`, plus a “diff” overlay or small side-by-side minimaps.

## 2026-01-25 — Prototype stack: TypeScript + Node (tentative)

- Date: 2026-01-25
- Decision: The current prototype uses **TypeScript** with a **Node.js** CLI/engine and a simple **static HTML viewer**; the final implementation stack can change.
- Context: We want fast iteration, shared types/schemas, and an easy path to HTTP agent integration, but you may prefer a different stack for the “real” implementation agent.
- Options considered:
  - TypeScript end-to-end (chosen)
  - Python engine + JS/TS viewer
- Rationale: Single-language core reduces schema drift; Node makes agent HTTP integration straightforward; static viewer is enough for early watchability.
- Consequences / follow-ups:
  - Keep replay format as JSON and keep types stable (version field).
  - If the viewer needs richer UI later, consider migrating to a small TS web app (Vite/React), but not required for MVP.

## 2026-01-25 — Replay logs include both players’ observations each ply

- Date: 2026-01-25
- Decision: Each turn record stores `observations` for **P1 and P2** (not only the acting player).
- Context: Watchability/analysis requires switching POV at any ply; future fog-of-war needs faithful “what the agent knew” logs.
- Options considered:
  - Log only acting player observation
  - Log omniscient state only
  - Log both players’ observations (chosen)
- Rationale: Small extra storage cost now prevents painful replay/viewer refactors later.
- Consequences / follow-ups:
  - Keep observation derivation deterministic and versioned alongside the engine.

## 2026-01-25 — Roadmap stance: v0 → v1 → v2, then iterate; v3+ order open

- Date: 2026-01-25
- Decision: The near-term roadmap is **v0 (perfect info)** → **v1 (positional fog-of-war)** → **v2 (hidden tech/composition via signals)**. Expect to iterate on v2 for a long time; the order of WEGO vs multi-agent teams is intentionally left open.
- Context: You want a stable “behavior microscope” plateau (v2) before committing to major structural changes.
- Options considered:
  - Rush WEGO (v3) early
  - Rush multi-agent teams (v4) early
  - Build uncertainty depth first (chosen)
- Rationale: Fog-of-war + hidden tech already unlocks rich inference/adversarial dynamics; WEGO and teams add major complexity and can be sequenced later based on what’s most interesting.
- Consequences / follow-ups:
  - Treat v2 enhancements (unit customization, larger action space, unit-level agents) as an idea pool, not commitments; see `ROADMAP.md`.

---

## Open decisions (not yet made / intentionally deferred)

- Exact MVP parameters (`turnCapPlies`, `actionBudget`, income/cost numbers): tune by playtests; implementation agent can set starting values.
- Final tech stack + whether to reuse prototype: deferred to the implementation agent.
- Post-v2 direction: decide whether WEGO or multi-agent teams comes first; keep v2 enhancement pool as “examples to consider”, not commitments.
