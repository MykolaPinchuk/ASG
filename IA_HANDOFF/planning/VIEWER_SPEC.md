# Viewer Spec (Planning)

This document specifies the replay viewer requirements for MVP v0 and how it should evolve once POVs diverge (fog-of-war, hidden tech, WEGO commitments).

## Core UX goals

- Make matches easy to follow as a human (watchability).
- Make it easy to compare **what an agent knew** vs **ground truth**.
- Keep the UI “turn-beat” oriented (plies/turns are the story units).

## Inputs

The viewer consumes a replay JSON that contains:
- `scenario.map` (nodes with coordinates + edges)
- per-ply:
  - `observations.P1`, `observations.P2` (player POV)
  - `stateAfter` (omniscient state)
  - `actions`, `rationaleText`, `events`

Storing both players’ observations per ply is a hard requirement for future fog-of-war.

## Required view modes

1. **Omni**
   - Render `stateAfter` (or “stateBefore” if scrubbing pre-resolution).
   - Show all owners, strengths, yields.

2. **P1 POV / P2 POV**
   - Render `observations.P1` / `observations.P2`.
   - When observations are partial (future), the viewer MUST NOT “fill in” hidden facts from omni.

3. **Diff / Compare (recommended)**
   - Goal: surface mismatches between P1 knowledge, P2 knowledge, and omni.
   - Minimum implementation:
     - Main map shows Omni owners.
     - Node tooltip/panel shows:
       - `P1 sees: ...`
       - `P2 sees: ...`
       - `Omni: ...`
   - Better implementation:
     - Color-code node outlines:
       - visible/known to P1 only
       - visible/known to P2 only
       - visible/known to both
       - known to neither (if applicable)
     - Provide a “split minimap” inset: small P1 + small P2 views side-by-side.

## Timeline controls

- Turn slider/scrubber over plies.
- Step forward/back by one ply.
- Optional: autoplay with speed control.
- Toggle: **Before** vs **After** state for the selected ply:
  - Before = `observations.*` (pre-action, player view)
  - After = `stateAfter` (post-resolution, omni)

## Side panel content (per ply)

- Active player, ply index, current supplies.
- `rationaleText` (plain text, size-limited in UI).
- Actions list (as submitted).
- Events list (resolution outcomes).

## Handling partial information (future-proofing)

When fog-of-war/hidden info is introduced, observations should carry explicit “unknown” markers rather than omitting fields silently.

Viewer behavior:
- Unknown owner/strength should display as `?` (not `0`).
- Unknown nodes/edges may be greyed out or shown with reduced detail.
- Event log should clearly label whether an event was:
  - observed by the player,
  - inferred/estimated,
  - or omniscient-only (depending on the chosen view mode).

## What to leave JIT to implementation

- Exact rendering library/stack (SVG/Canvas/WebGL).
- Node layout scaling/panning/zoom behavior.
- Tooltips vs side-panel detail tradeoffs once real replays exist.

