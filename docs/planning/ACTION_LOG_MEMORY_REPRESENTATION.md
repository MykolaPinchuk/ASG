# Action Log and Memory Representation

Purpose: define the right representation for agent and opponent actions with future use cases in mind:
- replay/debugging,
- viewer UX,
- experiment analysis,
- and prompt-time memory for stateful agents.

This document intentionally separates:
- the **canonical action log**,
- the **derived full-turn memory object**,
- and the **minimal prompt-memory payload**.

One format should not try to serve all three roles.

## Design goals

We need representations that can answer different questions cleanly:

- What did the acting player try to do?
- Which actions were invalid, truncated, or changed by validation?
- What actually happened in the engine?
- What changed in the board because of that?
- What should a future stateful agent remember from this?

## Time unit

Canonical storage unit: **one ply**.

Reason:
- only one player acts at a time,
- engine resolution happens per ply,
- replay/viewer already uses per-ply story beats,
- and full-turn views can always be derived by grouping two consecutive plies.

A "full turn" in memory/analysis means:
- one `P1` ply,
- followed by one `P2` ply.

## Representation layers

### 1. Canonical replay/action log

This is the lossless source of truth.

Use cases:
- replay inspection,
- debugging invalid actions,
- viewer timeline,
- experiment metrics,
- future offline learning/analysis.

This layer should remain close to engine truth.

### 2. Derived full-turn memory object

This is a compact structured summary of two plies.

Use cases:
- persistent agent memory across turns,
- opponent modeling,
- short tactical history,
- carrying forward unfinished plans.

This layer should preserve causality, but compress aggressively.

### 3. Minimal prompt-memory payload

This is the smallest form injected into the model prompt.

Use cases:
- low-token statefulness experiments,
- bounded context windows,
- cheap online play.

This layer should optimize for decision utility per token, not completeness.

## Canonical per-ply action log

Current replay records already store:
- `observations`,
- `actions`,
- `rationaleText`,
- `events`,
- `stateAfter`,
- diagnostics.

That is a good base. The main missing concept is explicit separation between:
- submitted actions,
- per-action resolution,
- and summarized state changes.

Recommended per-ply shape:

```json
{
  "ply": 12,
  "player": "P1",
  "observationRef": "optional",
  "submittedActions": [
    {"type":"reinforce","amount":3},
    {"type":"move","from":"p1_hq","to":"p1_bridge","amount":6}
  ],
  "actionResults": [
    {
      "index": 0,
      "submitted": {"type":"reinforce","amount":3},
      "status": "applied",
      "events": [
        {"type":"reinforce","location":"p1_hq","amount":3}
      ]
    },
    {
      "index": 1,
      "submitted": {"type":"move","from":"p1_hq","to":"p1_bridge","amount":6},
      "status": "applied",
      "events": [
        {"type":"move","from":"p1_hq","to":"p1_bridge","amount":6}
      ]
    }
  ],
  "events": [
    {"type":"income","player":"P1","amount":5,"supplyAfter":5},
    {"type":"reinforce","player":"P1","location":"p1_hq","amount":3,"supplyAfter":2,"strengthAfter":13},
    {"type":"move","player":"P1","from":"p1_hq","to":"p1_bridge","amount":6,"fromStrengthAfter":7,"toStrengthAfter":6}
  ],
  "summary": {
    "captures": [],
    "combatCount": 0,
    "invalidCount": 0,
    "ownerChanges": [],
    "supplyDelta": {"P1": 0, "P2": 0}
  },
  "rationaleText": "optional",
  "memoryUpdate": "optional",
  "stateAfterRef": "optional",
  "latencyMs": 10234
}
```

### Canonical field semantics

- `submittedActions`: exact agent output after JSON parsing/sanitization.
- `actionResults`: per-action resolution record.
- `events`: engine-truth event stream for the ply.
- `summary`: structured convenience data derived from `events` and state delta.
- `rationaleText`: free text for humans only, never the sole source of facts.
- `memoryUpdate`: optional agent-produced short persistent note.

### Recommended `actionResults.status`

- `applied`
- `invalid`
- `ignored_budget`
- `sanitized`

This field is important because future repair loops, validation logic, and richer action spaces will make "submitted" vs "actually executed" diverge more often.

### Why this is the right canonical form

- It preserves action intent.
- It preserves engine truth.
- It supports detailed debugging.
- It keeps analysis structured instead of relying on natural language.
- It generalizes to more complex rules and agent-vs-agent play.

## Derived full-turn memory object

This object groups two plies and keeps only decision-relevant history.

Use this as the main building block for stateful prompting.

Recommended shape:

```json
{
  "turn": 6,
  "plies": [
    {
      "player": "P1",
      "actions": [
        {"type":"reinforce","amount":3},
        {"type":"move","from":"p1_hq","to":"p1_bridge","amount":6}
      ],
      "outcome": {
        "captures": [],
        "combat": [],
        "ownerChanges": [],
        "supplyNodesChanged": [],
        "frontierNotes": ["north contested", "south unchanged"]
      },
      "planNote": "Built strength toward mid and kept HQ reserve."
    },
    {
      "player": "P2",
      "actions": [
        {"type":"move","from":"p2_n","to":"mid_n","amount":4}
      ],
      "outcome": {
        "captures": ["mid_n"],
        "combat": [],
        "ownerChanges": [{"node":"mid_n","from":"Neutral","to":"P2"}],
        "supplyNodesChanged": [],
        "frontierNotes": ["enemy entered north lane"]
      },
      "planNote": "Pressed north lane."
    }
  ],
  "turnSummary": {
    "newContestedNodes": ["mid_n"],
    "newSupplyOwners": [],
    "hqThreats": [],
    "unfinishedTacticalThreads": [
      "north lane now contested"
    ]
  }
}
```

### Full-turn memory rules

- Keep the structure symmetric for self and opponent.
- Prefer explicit tactical outcomes over verbose prose.
- Include only changes or active threats; omit unchanged facts where possible.
- Use short strings only for what is hard to encode structurally.

### What belongs here

- action lists,
- captures,
- combat outcomes,
- ownership changes,
- supply-node changes,
- frontier or threat notes,
- short plan note if useful.

### What does not belong here

- full raw board snapshot for each ply,
- long rationale text,
- provider diagnostics,
- viewer-only rendering details.

## Minimal prompt-memory payload

This is the cheapest practical form for online prompting.

Recommended shape:

```json
{
  "my_plan": "Push north if cheap; recapture free supply when available.",
  "last_turn": {
    "me": {
      "actions": [
        {"type":"move","from":"p1_n","to":"mid_n","amount":5}
      ],
      "result": "lost fight at mid_n"
    },
    "enemy": {
      "actions": [
        {"type":"move","from":"p2_s","to":"mid_s","amount":4}
      ],
      "result": "captured mid_s"
    }
  },
  "watch_for": [
    "enemy controls south approach",
    "north recapture may be available"
  ]
}
```

### Prompt-memory design rules

- Hard cap size aggressively.
- Include at most the last one or two full turns.
- Use short normalized labels where possible.
- Prefer "what changed" and "what still matters" over raw history.

This payload is not a replay substitute. It is a tactical scratchpad.

## Derivation pipeline

Recommended derivation flow:

1. Engine produces canonical per-ply replay record.
2. Post-processing derives:
   - `summary` inside each ply,
   - full-turn memory objects from consecutive plies,
   - minimal prompt-memory payload from the last `N` full-turn objects plus a persistent short plan.

This keeps one source of truth and avoids hand-maintaining multiple inconsistent histories.

## Token-efficiency guidance

For prompt-time memory experiments:

- Do not append raw full-state history by default.
- Do not append full event streams for many plies.
- Start with:
  - one short persistent plan,
  - plus last one full-turn memory object.

Why:
- current state/context is already about `~1000-1100` prompt tokens per ply in Scenario 01,
- raw historical state snapshots would grow cost too quickly,
- compact action/outcome memory is much cheaper and more decision-relevant.

## Future-proofing requirements

The design should still work if we later add:

- bigger maps,
- richer action spaces,
- fog-of-war,
- agent-vs-agent/self-play,
- repair loops or validation feedback,
- external planning tools,
- offline imitation or trajectory analysis.

To preserve that future path:

- keep canonical logs structured and lossless,
- keep memory objects derived and compact,
- never rely on free text as the only fact store,
- keep per-ply logs symmetric across players.

## Recommendation

Near-term implementation order:

1. Keep the current replay record as the base canonical log.
2. Add explicit `actionResults` and per-ply structured `summary`.
3. Define a derived full-turn memory object from two plies.
4. For first memory experiments, inject only:
   - short persistent plan,
   - plus last full-turn memory object,
   - plus optional watch list.

This is the best balance between:
- interpretability,
- future extensibility,
- and token efficiency.
