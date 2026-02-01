# ASG Game Rules (v0)

This document provides a comprehensive description of the rules for the Agent Strategy Game (ASG) MVP v0.

---

## Overview

ASG is a turn-based strategy game played on a graph-based map. Two players (P1 and P2) compete to capture the enemy's headquarters (HQ) while managing resources and forces. The game features deterministic rules with bounded randomness in combat.

---

## Core Concepts

### Players
- Two players: **P1** and **P2**
- Players alternate turns (plies)
- Each player has a designated **HQ node** that must be defended

### Map Structure
- The map is an **undirected graph** consisting of:
  - **Nodes (Locations)**: discrete places identified by a unique `LocationId`
  - **Edges**: connections between nodes allowing movement
- Each node has:
  - `id`: unique identifier
  - `x`, `y`: coordinates (for visualization only, do not affect gameplay)
  - `owner`: current owner (P1, P2, or Neutral)
  - `supplyYield`: resources generated per turn when owned
  - `forces[P1]`, `forces[P2]`: troop strength for each player at this node

### Resources
- **Supply**: the primary resource used to create troops
- Each player has a supply pool tracked separately
- Supply is gained through **income** at the start of each turn

### Forces (Troops)
- **Strength**: a non-negative integer representing the size/power of forces at a node
- Forces can be created via **reinforcement** and moved via **move** actions
- Combat occurs when opposing forces occupy the same node

---

## Game Flow

### Turn Structure (Ply)

Each turn (called a "ply") follows this sequence:

1. **Income Phase**
   - Active player gains supply:
   ```
   income = baseIncome + sum(supplyYield for all nodes owned by active player)
   ```

2. **Action Phase**
   - Active player submits up to `actionBudget` actions
   - Actions are processed in order
   - Actions exceeding the budget are rejected as invalid

3. **Resolution**
   - Engine processes each action, generating events
   - Combat is resolved when triggered by movement

4. **End Check**
   - If enemy HQ is captured → active player wins
   - If ply count reaches `turnCapPlies` → game ends in a draw

5. **Turn Handoff**
   - `ply` counter increments by 1
   - Active player switches to the other player

---

## Actions

Players can submit the following action types:

### 1. Pass
```json
{ "type": "pass" }
```
- **Effect**: No action taken
- **Use case**: When no beneficial action is available

### 2. Reinforce
```json
{ "type": "reinforce", "amount": <positive integer> }
```
- **Preconditions**:
  - `amount` must be a positive integer
  - Player must have sufficient supply: `supply >= amount × reinforceCostPerStrength`
- **Effects**:
  - Deducts `amount × reinforceCostPerStrength` from player's supply
  - Adds `amount` strength to player's forces at their HQ node
- **Use case**: Building up forces for offense or defense

### 3. Move
```json
{ "type": "move", "from": "<LocationId>", "to": "<LocationId>", "amount": <positive integer> }
```
- **Preconditions**:
  - `from` and `to` must be valid node IDs
  - `to` must be **adjacent** to `from` (connected by an edge)
  - `amount` must be a positive integer
  - Player must have at least `amount` forces at the `from` node
- **Effects** (in order):
  1. Subtract `amount` from player's forces at `from`
  2. Add `amount` to player's forces at `to`
  3. If both players have positive forces at `to` → **combat** is triggered
  4. After combat, if player has forces > 0 and enemy has forces = 0 at `to` → **capture** the node
  5. If `to` is the enemy HQ and it's captured → **player wins**

---

## Combat System

Combat occurs automatically when a move places both players' forces on the same node.

### Combat Resolution Steps

1. **Calculate variance bound**:
   ```
   min_strength = min(attacker_strength, defender_strength)
   variance_bound = max(1, floor(min_strength × combatVarianceFraction))
   ```

2. **Sample noise**:
   - `noise` = random integer uniformly sampled from `[-variance_bound, +variance_bound]`
   - Uses deterministic PRNG seeded for reproducibility

3. **Calculate delta**:
   ```
   delta_base = attacker_strength - defender_strength
   delta = delta_base + noise
   ```

4. **Determine outcome**:
   - If `delta > 0`: **Attacker wins**
     - Attacker remaining strength = `delta`
     - Defender remaining strength = `0`
   - If `delta < 0`: **Defender wins**
     - Defender remaining strength = `-delta`
     - Attacker remaining strength = `0`
   - If `delta == 0`: **Coin flip**
     - PRNG randomly picks winner
     - Winner remaining strength = `1`
     - Loser remaining strength = `0`

### Combat Example

Attacker (P1) with 8 strength moves into node with Defender (P2) with 5 strength:
- `min_strength = 5`
- `variance_bound = max(1, floor(5 × 0.35)) = max(1, 1) = 1`
- `noise` sampled from {-1, 0, +1}
- `delta_base = 8 - 5 = 3`
- Possible outcomes:
  - `noise = -1` → `delta = 2` → Attacker wins with 2 strength
  - `noise = 0` → `delta = 3` → Attacker wins with 3 strength
  - `noise = +1` → `delta = 4` → Attacker wins with 4 strength

### Combat Characteristics

- **Bounded randomness**: The noise is limited, making outcomes somewhat predictable
- **Strength matters**: Larger strength advantages are more likely to win
- **All-or-nothing**: One side is always eliminated in combat
- **Attacker advantage**: When moving into combat, the attacker has initiative

---

## Node Capture

A node is captured when:
1. Player has forces > 0 at the node
2. Enemy has forces = 0 at the node
3. Node is not already owned by the player

Upon capture:
- Node `owner` changes to the capturing player
- If the captured node is the enemy HQ → **immediate victory**

---

## Victory Conditions

### Win
- **Condition**: Capture the enemy's HQ node
- **How**: Move forces to the enemy HQ, defeat any defenders, and occupy it

### Draw
- **Condition**: Game reaches `turnCapPlies` without either player winning
- **Typical setting**: 60 plies (30 full rounds)

---

## Invalid Actions

Actions that fail validation have **no effect** and generate an `invalid_action` event. Common reasons:

| Invalid Action | Reason |
|----------------|--------|
| `reinforce` with `amount <= 0` | Amount must be positive integer |
| `reinforce` with insufficient supply | Not enough resources |
| `move` with unknown node ID | Invalid `from` or `to` |
| `move` between non-adjacent nodes | No edge connecting nodes |
| `move` with `amount <= 0` | Amount must be positive integer |
| `move` with insufficient forces | Not enough troops at source node |
| Exceeding action budget | Too many actions submitted |

---

## Default Game Settings

Based on `scenario_01` (Two Lanes, Two Resources):

| Setting | Value | Description |
|---------|-------|-------------|
| `turnCapPlies` | 60 | Maximum plies before draw |
| `actionBudget` | 6 | Max actions per turn |
| `baseIncome` | 3 | Supply gained per turn (minimum) |
| `reinforceCostPerStrength` | 1 | Supply cost per unit strength |
| `combatVarianceFraction` | 0.35 | Combat randomness factor |

---

## Events

The game engine emits events to describe what happened:

| Event Type | Description |
|------------|-------------|
| `income` | Player received supply at turn start |
| `reinforce` | Player added troops at HQ |
| `move` | Player moved troops between nodes |
| `combat` | Battle occurred between forces |
| `capture` | Node ownership changed |
| `invalid_action` | Action was rejected |
| `game_end` | Game concluded (win or draw) |

---

## Strategy Tips

1. **Economy matters**: Capture resource nodes (`supplyYield > 0`) early to gain income advantage
2. **Mass forces**: Concentrate troops for decisive attacks rather than spreading thin
3. **Combat math**: With 35% variance, you need ~1.5× enemy strength for reliable wins
4. **Action efficiency**: Use all `actionBudget` actions when possible
5. **Defend HQ**: Never leave your HQ completely undefended
6. **Chokepoints**: Control key nodes that connect regions of the map

---

## Determinism

The game is fully deterministic given:
- Scenario definition
- Initial state
- All players' action sequences
- Match seed (for PRNG)

This allows:
- Reproducible replays
- Fair competitive conditions
- Verifiable game outcomes

---

## Example Map: Scenario 01 (Two Lanes, Two Resources)

```
                    [res_n] (Neutral, +2 yield)
                       |
        [p1_n]-----[mid_n]-----[p2_n]
           |          |           |
[P1 HQ]--[p1_bridge]  |      [p2_bridge]--[P2 HQ]
           |          |           |
        [p1_s]-----[mid_s]-----[p2_s]
                       |
                    [res_s] (Neutral, +2 yield)
```

- Each player starts with 10 strength at their HQ
- Each player starts with 0 supply
- Resource nodes provide +2 supply/turn when captured
- Multiple paths allow for flanking strategies

---

## Quick Reference

**To win**: Capture the enemy HQ node.

**Each turn**:
1. Gain income (base + owned node yields)
2. Submit up to 6 actions
3. Actions resolve in order

**Action types**:
- `pass` - do nothing
- `reinforce(amount)` - spend supply to add troops at HQ
- `move(from, to, amount)` - move troops along an edge

**Combat**: 
- Triggered by moving into a node with enemy forces
- Winner determined by: `delta = (attacker - defender) + noise`
- Winner keeps `|delta|` strength (or 1 on tie), loser loses all
