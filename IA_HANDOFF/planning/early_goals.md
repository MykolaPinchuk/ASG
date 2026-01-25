# goals.md

## 0. Status

Exploration-phase document. Everything is provisional. The purpose of this file is to:
- record the current high-level direction and why it was chosen
- define what “success” means for the project in early iterations
- constrain the design space enough to avoid building the wrong thing
- list open questions and the next exploration steps

This is not an implementation plan. It is a decision-and-goals spec.

---

## 1. Context and motivation

### 1.1 Primary motivation
Build a game that natively supports LLM-driven agents (served via API) in order to learn how agents behave across a wide variety of strategic scenarios.

The intent is not “AI plays a human UI.” The intent is an environment designed for:
- high-quality, structured state I/O
- bounded, legible action spaces
- robust logging and replay
- interpretable agent decision traces

### 1.2 Watchability requirement
The game should be enjoyable to watch rather than feeling like work. A key ingredient is that the agent should provide a visible, ongoing explanation of its decisions (a “rationale trace”) alongside the actions it takes.

Observation from prior experience (e.g., watching LLMs play turn-based games): real-time visuals are not required for engagement if:
- turns are meaningful “story beats”
- agent intent is visible
- the game produces tension, uncertainty, and adversarial dynamics

### 1.3 Time budget requirement
Each match should reliably fit within ~20–30 minutes. This implies:
- strong anti-stalemate mechanisms
- bounded turn counts or hard time limits
- incentives to create conflict and resolution

---

## 2. What we want to learn (research goals)

This project is a “behavior microscope” for LLM agents. The game should surface (and make observable) phenomena like:

### 2.1 Planning under uncertainty
- how agents form hypotheses about hidden state (enemy economy/tech/position)
- how they value information and scouting
- how they trade exploitation vs exploration
- how they update beliefs when contradicted by evidence

### 2.2 Adversarial strategy
- counter-planning and adaptation (responding to opponent plans)
- deception susceptibility (falling for feints) and robustness to it
- commitment vs flexibility (when to pivot vs double down)
- exploitation of opponent weakness vs overextension

### 2.3 Coordination (eventual multi-agent)
- role decomposition (econ/tech vs military vs scouting)
- communication limits and misalignment between specialist agents
- shared plan coherence over multiple turns
- credit assignment: who “caused” success/failure

### 2.4 Trace reliability
- when explanations are faithful vs post-hoc rationalization
- whether rationale quality correlates with performance
- what trace formats produce the most useful observability

---

## 3. Core constraints (design reality)

### 3.1 Bandwidth and throughput constraints
Pure real-time micro-control games (classic RTS) tend to explode:
- decision frequency (too many actions)
- action branching factor (too many plausible micro moves)
- state size (too much detail)
- sensitivity to latency

This pushes learning toward “handling time pressure + concurrency,” which is explicitly *not* the primary interest.

### 3.2 I/O constraints and agent perception
Relying on vision-based perception from rendered UI is not the plan. Agents should receive structured observations via API:
- canonical state representation
- explicit event summaries
- partial observability modeled in the data, not inferred from pixels

Humans can watch a UI, but agents should not depend on it.

### 3.3 Explanation trace constraints
The project wants a visible “thought trace,” but we should not design around exposing raw chain-of-thought. Instead, we want an explicit, concise, structured rationale trace that is:
- legible
- grounded in observable state
- comparable across turns and agents
- cheap enough to generate every turn

---

## 4. High-level decision: strategy form factor

### 4.1 Chosen direction
**Turn-based strategy (TBS) as the foundation**, with an optional future extension to **simultaneous-turn (“WEGO”) mode**.

Rationale:
- Maximizes planning-under-uncertainty and adversarial strategy per decision.
- Makes rationale trace readable and meaningful (each turn is a coherent “beat”).
- Keeps I/O bounded and debugging tractable.
- Supports multi-agent coordination naturally (agents co-author a plan for the turn).
- Watchability does not require real-time; tension comes from uncertainty + stakes.

### 4.2 Why not macro-RTS (continuous world + periodic macro commands)
Macro-RTS can be watchable and interesting, but it tends to reintroduce:
- creeping decision frequency (interrupts, reactive hooks)
- messy credit assignment (world evolves while agent deliberates)
- complexity that is orthogonal to the priority goals

Given the stated priorities, these are costs with limited benefit.

### 4.3 Optional evolution: WEGO (simultaneous planning, simultaneous resolution)
Once the baseline alternating-turn TBS is stable and fun, WEGO mode can add:
- hidden commitments and bluffing
- Planning under uncertainty about the opponent’s current action
- Removes “reactive dominance” and turn-order artifacts
- richer adversarial interaction without real-time pressure
- more “strategic mind games” while keeping bounded turn structure

WEGO is not required for MVP, but should be considered as a mid-term extension.

Based on how the project evolves, we may want to revisit macro-RTS and WEGO later, but only after nailing the core TBS experience.

---

## 5. Game design principles (first-principles constraints)

### 5.1 Rich state, small action vocabulary
Depth should come from interacting systems (uncertainty + incentives + counters), not from hundreds of actions.

Target:
- ~15–30 action types total
- each action is high-level and intention-revealing
- resolution creates emergent consequences

### 5.2 Uncertainty must matter
Planning under uncertainty requires:
- partial observability (fog-of-war / hidden information)
- meaningful scouting with opportunity cost
- state inference (signals, not perfect knowledge)

Without this, the game becomes deterministic optimization and loses the agent behavior you want to study.

### 5.3 Conflict must be forced (anti-stalemate)
To guarantee 20–30 minute matches:
- hard match length cap or fixed turn count
- scoring/objectives that compel engagement
- economic/positional incentives that punish passivity
- tie-break rules and “sudden death” mechanisms

### 5.4 Resolution must be explainable
Even if there is randomness, it must be:
- bounded (no wild swings)
- attributable (“combat odds were X, outcome Y”)
- logged with enough detail to explain why events happened

### 5.5 Scenario packs > single ladder map (recommended)
To learn broadly, prefer:
- a collection of mission setups that stress different skills
- or a ladder map pool with varied topology and objectives

This increases behavioral diversity without requiring constant new mechanics.

---

## 6. Recommended control loop (TBS baseline)

A turn should represent a *strategic commitment*, not micro steps.

Suggested turn structure (conceptual):
1. **Observation update**: agent receives partial info + event recap
2. **Planning**: agent chooses goals and actions
3. **Action submission**: bounded action budget
4. **Resolution**: simulation applies rules, generates outcomes
5. **Event summary**: engine emits a compact turn recap for next turn

Key tunables (to explore later, not decide now):
- number of turns per match
- action budget per turn
- degree of simultaneous resolution (pure alternating vs WEGO)
- scouting information model

---

## 7. Agent “rationale trace” (always visible)

### 7.1 What we want
A trace that makes it easy to answer:
- What did the agent believe?
- What did it want?
- What plan did it pick?
- Why these actions (and not alternatives)?
- What risks did it consider?
- How will it update next turn?

### 7.2 What we explicitly do NOT want
- verbose freeform internal reasoning that is hard to read and hard to compare
- rationalization that is disconnected from state
- uncontrolled token growth over long games

### 7.3 Proposed rationale format (per turn)
A structured “rationale card” with strict size limits:

- **Beliefs (with confidence)**:
  - e.g., “Enemy likely teching air (0.65)”
- **Goals this turn**:
  - e.g., “Secure objective B; avoid decisive fight”
- **Plan (1–3 steps)**:
  - short sequence
- **Risks**:
  - main failure modes and contingency triggers
- **Actions → Reasons mapping**:
  - each action has a one-line justification grounded in state facts
- **Post-turn reflection** (optional):
  - what evidence would change its beliefs next turn

Optional but strongly recommended:
- require references to specific observation fields (“fact grounding”)
  - e.g., cite “enemy_seen_turns_ago = 3” or “resource_diff = -12”

This improves trace faithfulness and reduces pure narrative.

### 7.4 Trace display for watchability
A good default UI for viewers:
- left: map state + units/objectives
- right: rationale card + action list
- bottom: event log (turn recap)
- optional: “confidence meter” for key hypotheses

---

## 8. Native agent support (API-level goals)

### 8.1 Agent input (observation)
- structured JSON state
- partial observability modeled explicitly
- compact event summary
- optional “query tools” for additional details (to avoid huge dumps)

### 8.2 Agent output (action submission)
- strict action schema
- validation and explicit error feedback
- action budgets (count + optionally cost)

### 8.3 Logging and replay (first-class)
Even in exploration, the design should target:
- deterministic or seed-reproducible replays
- full action + rationale + observation logs
- ability to compare agents across scenarios

This is essential for learning and debugging.

---

## 9. Multi-agent end state (directional, not MVP)

The architecture should allow multiple agents per side later.

### 9.1 Role specialization examples
- Economy/production agent
- Military operations agent
- Scouting/intel agent

### 9.2 Coordination constraints (to preserve interesting failure modes)
Multi-agent systems are only interesting if:
- communication is limited or structured
- roles have partial views or partial authority
- conflicts can occur (misaligned sub-plans)

Otherwise it collapses into “one big agent with extra steps.”

### 9.3 Trace requirements for teams
Each role emits a rationale card; the team produces:
- a merged “team plan” summary
- visible disagreements (optional but informative)
- an arbitration mechanism (explicit and logged)

---

## 10. Non-goals (explicit)

These are not priorities for early versions:
- pixel-based perception for agents
- fine-grained RTS micro as an action interface
- photoreal graphics or heavy content production
- maximal realism
- complex diplomacy / natural language negotiation with humans (can be explored later)

---

## 11. Key risks and how the goals mitigate them

### 11.1 Risk: building a game that tests the wrong thing
Mitigation: choose TBS foundation, keep action vocabulary macro, prioritize uncertainty + adversarial dynamics.

### 11.2 Risk: “depth” turns into “complexity”
Mitigation: rich interacting systems with small action set; scenario packs; strict budgets.

### 11.3 Risk: agent traces become narrative theater
Mitigation: structured rationale cards; fact grounding; strict size limits; action→reason mapping.

### 11.4 Risk: degenerate strategies / stalemates
Mitigation: objectives and scoring; hard match caps; incentives against turtling.

### 11.5 Risk: hard to compare runs
Mitigation: deterministic/seeded resolution; logs; replays; standardized scenario set.

---

## 12. Open questions (exploration backlog)

These should be decided before implementation details:

### 12.1 Mechanics selection
- economy model: 1 resource vs 2?
- tech progression: discrete tiers vs branching tree?
- unit design: rock-paper-scissors vs ability-driven?

### 12.2 Uncertainty model
- fog-of-war rules
- scouting actions and costs
- signal noise vs perfect detection
- hidden tech/builds until observed?

### 12.3 Turn structure
- alternating vs simultaneous
- number of turns or time cap
- action budgets (count/cost)
- resolution granularity (single-phase vs multi-phase per turn)

### 12.4 Objectives and anti-stalemate
- territory control points?
- resource dominance?
- “king of the hill” mechanics?
- tie-break rules?

### 12.5 Trace policy
- exact rationale template and length limits
- whether fact grounding is mandatory
- whether to display confidence numerically or qualitatively

### 12.6 Scenario design strategy
- ladder map pool vs mission pack
- curriculum ordering (easy→hard)
- what diversity dimensions matter most (map topology, starting asymmetry, hidden info, etc.)

---

## 13. Next exploration steps (still pre-implementation)

1. **Define the minimal “strategic loop”** that reliably produces:
   - scouting incentives
   - counter-play
   - pivots
   - conflict within 20–30 minutes

2. **Draft an initial action vocabulary** (15–30 actions) and ensure:
   - each action is intention-level
   - each has clear preconditions and outcomes

3. **Draft the observation schema** (top-level fields only) and decide:
   - what is always visible vs fogged
   - what comes via event summary

4. **Finalize the rationale card template** and limits:
   - fields
   - max tokens/characters
   - grounding rules

5. **Pick the initial turn protocol**:
   - alternating-turn TBS is the default
   - define a path to WEGO later (without committing now)

This completes “broad form-factor lock-in” while leaving mechanics and content open.


## Appendix: Original human prompt:

I want to explore the feasibility of a project to build a game which can natively support LLM agents. For now we are in the exploration phase. Everything I write so far is speculative and not well-thought. It may make sense to do smth very different. 

Broad goals: 
For me to learn more about how LLM-based agents operate under a wide variety of scenarios. In April-June 2025 I spent quite a bit of time watching various LLMs play Pokemon games. I learnt a lot from that about LLM agents. 
Be reasonably fun so that watching it does not feel like work. 

Some requirements (these are not mandatory, but seem like nice to have): 
Game should natively support LLM agents served via API. 
Game should be possible to build iteratively. That is, first a simpler MVP version that works, then keep adding more features which will add more depth. 
Game should have significantly more depth than the now-common Pokemon played by agents. It should show behavior of agents under a broader variety of scenarios and should provide a larger action space for them. Its mode advanced versions should support team of agents playing against another team of agents. It should be more time-efficient compared to Pokemon. 
Each game should easily fit into a 20-30 minute window.