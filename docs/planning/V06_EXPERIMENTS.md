# v06 Experiments Backlog (Agent Understanding + Strategy)

This is a backlog of *experiments*, not commitments. The goal is to improve agent reliability and strategic coherence **without** hardcoding domain-specific “reminders” into prompts (unscalable as complexity grows).

Evaluation protocol:
- Use `docs/planning/EXPERIMENT_EVAL_PROTOCOL.md` to lock baselines, metrics, and success criteria before spending tokens.

Guiding principles:
- Prefer **environment-derived feedback** (validator errors, events, legality) over human-authored tips.
- Keep changes **opt-in/flagged** so we can A/B test vs the current baseline.
- Keep v0/v0.x guardrails by default (plies/games caps, always save replays, persist `turns[*].latencyMs`).

## P0 — Try first (high leverage, low complexity)

### 1) Validator-guided repair loop (1 retry, same timeout budget)
Idea:
- Agent proposes actions → server validates against observation/rules → if invalid, server returns a short machine-generated error list and asks for a corrected JSON.

Why:
- Directly addresses “agent doesn’t understand what’s legal/possible”.
- Scales as rules expand (the validator is the source of truth).

Design constraints:
- Hard cap: 1 retry (maybe 2 later), and must fit within the same wall-clock budget.
- Return structured feedback, not prose. Example fields: `dropped[]`, `clamped[]`, `normalized[]`, `reasons[]`.

Success metrics:
- Fewer `invalid_action` events, fewer PASS turns, higher ok-turn-rate.
- Latency: track added retries per ply, p50/p95 latency deltas.

### 2) Minimal warmup step + bounded per-match memory (no “self-reminders” yet)
Warmup:
- “Turn -1” or pregame call that returns: `plan` (1–2 sentences) and maybe `risk` (1 sentence).
- No actions taken.

Memory:
- Persist a tiny per-match memory object (keyed by `match_id` + `player`) and inject it into each ply prompt.
- Strict size budget (overwrite/merge, never append transcript).

Why:
- Tests whether *any* persistence improves strategy/coherence without increasing prompt complexity much.

Success metrics:
- Reduced repeated mistakes across plies within the same match.
- Improved strategic consistency (fewer random walk moves; more resource capture attempts).

## P1 — Next (useful, slightly more complex)

### 3) Two-game run with mid-run postmortem
Idea:
- Game1 (scored, replayed) → short postmortem (few bullets) → Game2.
- Carry only the postmortem summary forward (bounded).

Why:
- Tests “learn within run” without long context.

### 4) “Game0” exploration mini-game (short, objective-driven)
Idea:
- A short unscored exploration phase (4–8 plies) designed to “touch mechanics” (reinforce, move, combat, capture) + minimize invalids.
- Summarize learnings into bounded memory, then play the scored game.

Risks/mitigations:
- Latency/cost: keep very short; always compress the summary.
- Task definition changes: keep it optional and measurable.

### 5) Agent-authored self-checklist/reminders (from warmup output)
Idea:
- In warmup, the agent writes a short checklist it wants to follow.
- Persist and show it back each ply.

Why:
- Avoids human-authored reminders; can scale with complexity.

Main risk:
- Self-poisoning (agent writes incorrect “rules” to itself).

Mitigation idea:
- Split memory into `hypotheses` vs `confirmed_facts`; only promote to confirmed if backed by validator/event evidence.

## P2 — Optional experiments (may be “assistance”; keep behind flags)

### 6) Richer observation affordances (derived features)
Examples:
- Owned nodes list, neutral supply nodes list, adjacency/move options summary.
- Distances to enemy HQ / nearest supply node.

Notes:
- This can reduce cognitive load, but may be considered “helpful shaping”.
- Keep it optional and compare A/B to avoid “cheating” concerns.

### 7) Prompt-mode variations (structure, not content)
Examples:
- “compact vs full” context formatting
- stricter JSON schema enforcement via tools/response_format toggles
- deterministic “self-check format” (agent outputs `checks_ok: true` etc.)

## Recommended evaluation protocol (for all experiments)

Always record:
- `invalid_action` events per game
- PASS turns per game
- provider/server error turns (from diagnostics)
- win/draw/loss, avg plies
- latency p50/p95 for ok turns
- retry count per ply (if repair loop)

Suggested test cohort:
- Include at least one “error-prone but responsive” model/provider (not just the top performers), so improvements are measurable.
- Keep horizons short by default (plies <= 30; games <= 5) unless explicitly overridden.
