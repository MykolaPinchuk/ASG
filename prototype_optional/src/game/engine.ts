import { PRNG } from "./prng.js";
import {
  invariant,
  otherPlayer,
  type Action,
  type Event,
  type GameResult,
  type GameSettings,
  type GameState,
  type LocationId,
  type NodeState,
  type Observation,
  type Owner,
  type PlayerId,
  type ScenarioDefinition,
} from "./types.js";

export interface EngineContext {
  scenario: ScenarioDefinition;
  adjacency: Record<LocationId, LocationId[]>;
}

export function createInitialState(ctx: EngineContext): GameState {
  const { scenario } = ctx;
  const nodes: Record<LocationId, NodeState> = {};

  for (const nodeDef of scenario.map.nodes) {
    nodes[nodeDef.id] = {
      id: nodeDef.id,
      x: nodeDef.x,
      y: nodeDef.y,
      owner: nodeDef.owner,
      supplyYield: nodeDef.supplyYield,
      forces: { P1: 0, P2: 0 },
    };
  }

  for (const [nodeId, forces] of Object.entries(scenario.initialState.nodeForces ?? {})) {
    invariant(nodes[nodeId], `Initial nodeForces references unknown node: ${nodeId}`);
    nodes[nodeId].forces.P1 = forces.P1 ?? 0;
    nodes[nodeId].forces.P2 = forces.P2 ?? 0;
  }

  return {
    scenarioId: scenario.id,
    ply: 0,
    activePlayer: scenario.startingPlayer,
    supplies: {
      P1: scenario.initialState.playerSupply.P1 ?? 0,
      P2: scenario.initialState.playerSupply.P2 ?? 0,
    },
    nodes,
  };
}

export function deriveObservation(state: GameState, player: PlayerId): Observation {
  // MVP: perfect information. Still keep Observation as a separate object for later fog-of-war.
  return {
    player,
    ply: state.ply,
    activePlayer: state.activePlayer,
    supplies: { ...state.supplies },
    nodes: Object.fromEntries(
      Object.entries(state.nodes).map(([id, node]) => [
        id,
        {
          id: node.id,
          x: node.x,
          y: node.y,
          owner: node.owner,
          supplyYield: node.supplyYield,
          forces: { ...node.forces },
        },
      ]),
    ),
  };
}

function cloneState(state: GameState): GameState {
  return {
    scenarioId: state.scenarioId,
    ply: state.ply,
    activePlayer: state.activePlayer,
    supplies: { ...state.supplies },
    nodes: Object.fromEntries(
      Object.entries(state.nodes).map(([id, node]) => [
        id,
        {
          id: node.id,
          x: node.x,
          y: node.y,
          owner: node.owner,
          supplyYield: node.supplyYield,
          forces: { ...node.forces },
        },
      ]),
    ),
  };
}

function sumIncomeForPlayer(state: GameState, player: PlayerId, baseIncome: number): number {
  let income = baseIncome;
  for (const node of Object.values(state.nodes)) {
    if (node.owner === player) income += node.supplyYield;
  }
  return income;
}

function isAdjacent(adjacency: Record<LocationId, LocationId[]>, from: LocationId, to: LocationId): boolean {
  return adjacency[from]?.includes(to) ?? false;
}

function computeAttackerWinProb(attackerStrength: number, defenderStrength: number, varianceBound: number): number {
  const deltaBase = attackerStrength - defenderStrength;
  const threshold = -deltaBase;
  const N = varianceBound;
  const total = 2 * N + 1;

  if (threshold < -N) return 1;
  if (threshold > N) return 0;

  const positive = N - threshold;
  return (positive + 0.5) / total;
}

function resolveCombat(
  attacker: PlayerId,
  defender: PlayerId,
  attackerStrength: number,
  defenderStrength: number,
  settings: GameSettings,
  rng: PRNG,
): Omit<Extract<Event, { type: "combat" }>, "type" | "location" | "attacker" | "defender"> {
  invariant(attackerStrength > 0 && defenderStrength > 0, "Combat requires both sides to have positive strength");

  const minStrength = Math.min(attackerStrength, defenderStrength);
  const varianceBound = Math.max(1, Math.floor(minStrength * settings.combatVarianceFraction));
  const noise = rng.intInclusive(-varianceBound, varianceBound);
  const deltaBase = attackerStrength - defenderStrength;
  const delta = deltaBase + noise;

  let winner: PlayerId;
  let winnerStrengthAfter: number;

  if (delta > 0) {
    winner = attacker;
    winnerStrengthAfter = delta;
  } else if (delta < 0) {
    winner = defender;
    winnerStrengthAfter = -delta;
  } else {
    winner = rng.bool() ? attacker : defender;
    winnerStrengthAfter = 1;
  }

  const attackerWinProb = computeAttackerWinProb(attackerStrength, defenderStrength, varianceBound);

  return {
    attackerStrengthBefore: attackerStrength,
    defenderStrengthBefore: defenderStrength,
    attackerWinProb,
    varianceBound,
    noise,
    delta,
    winner,
    winnerStrengthAfter,
  };
}

export interface ApplyTurnResult {
  state: GameState;
  events: Event[];
  result?: GameResult;
}

export function applyTurn(
  ctx: EngineContext,
  state: GameState,
  actions: Action[],
  rng: PRNG,
): ApplyTurnResult {
  const { scenario, adjacency } = ctx;
  const settings = scenario.settings;

  invariant(state.scenarioId === scenario.id, "State scenarioId mismatch");

  const player = state.activePlayer;
  const enemy = otherPlayer(player);
  const nextState = cloneState(state);
  const events: Event[] = [];

  const income = sumIncomeForPlayer(nextState, player, settings.baseIncome);
  nextState.supplies[player] += income;
  events.push({ type: "income", player, amount: income, supplyAfter: nextState.supplies[player] });

  const budget = settings.actionBudget;
  const boundedActions = actions.slice(0, budget);
  if (actions.length > budget) {
    events.push({
      type: "invalid_action",
      player,
      action: actions[budget]!,
      message: `Action budget exceeded: max ${budget} actions`,
    });
  }

  let result: GameResult | undefined;

  const enemyHq = scenario.players[enemy].hq;

  for (const action of boundedActions) {
    if (result) break;

    if (action.type === "pass") continue;

    if (action.type === "reinforce") {
      if (!Number.isInteger(action.amount) || action.amount <= 0) {
        events.push({ type: "invalid_action", player, action, message: "reinforce.amount must be a positive integer" });
        continue;
      }

      const cost = action.amount * settings.reinforceCostPerStrength;
      if (nextState.supplies[player] < cost) {
        events.push({ type: "invalid_action", player, action, message: "Insufficient supply for reinforce" });
        continue;
      }

      const hq = scenario.players[player].hq;
      nextState.supplies[player] -= cost;
      nextState.nodes[hq].forces[player] += action.amount;

      events.push({
        type: "reinforce",
        player,
        location: hq,
        amount: action.amount,
        supplyAfter: nextState.supplies[player],
        strengthAfter: nextState.nodes[hq].forces[player],
      });
      continue;
    }

    if (action.type === "move") {
      const { from, to, amount } = action;

      if (typeof from !== "string" || typeof to !== "string") {
        events.push({ type: "invalid_action", player, action, message: "move.from and move.to must be strings" });
        continue;
      }
      if (!Number.isInteger(amount) || amount <= 0) {
        events.push({ type: "invalid_action", player, action, message: "move.amount must be a positive integer" });
        continue;
      }

      const fromNode = nextState.nodes[from];
      const toNode = nextState.nodes[to];
      if (!fromNode) {
        events.push({ type: "invalid_action", player, action, message: `Unknown from node: ${from}` });
        continue;
      }
      if (!toNode) {
        events.push({ type: "invalid_action", player, action, message: `Unknown to node: ${to}` });
        continue;
      }
      if (!isAdjacent(adjacency, from, to)) {
        events.push({ type: "invalid_action", player, action, message: `Nodes are not adjacent: ${from} -> ${to}` });
        continue;
      }
      if (fromNode.forces[player] < amount) {
        events.push({ type: "invalid_action", player, action, message: "Insufficient strength at from node" });
        continue;
      }

      fromNode.forces[player] -= amount;
      toNode.forces[player] += amount;

      events.push({
        type: "move",
        player,
        from,
        to,
        amount,
        fromStrengthAfter: fromNode.forces[player],
        toStrengthAfter: toNode.forces[player],
      });

      // Combat if enemy present.
      if (toNode.forces[enemy] > 0 && toNode.forces[player] > 0) {
        const combat = resolveCombat(player, enemy, toNode.forces[player], toNode.forces[enemy], settings, rng);
        events.push({
          type: "combat",
          location: toNode.id,
          attacker: player,
          defender: enemy,
          ...combat,
        });

        if (combat.winner === player) {
          toNode.forces[player] = combat.winnerStrengthAfter;
          toNode.forces[enemy] = 0;
        } else {
          toNode.forces[enemy] = combat.winnerStrengthAfter;
          toNode.forces[player] = 0;
        }
      }

      // Capture if player occupies and enemy does not.
      if (toNode.forces[player] > 0 && toNode.forces[enemy] === 0 && toNode.owner !== player) {
        toNode.owner = player as Owner;
        events.push({ type: "capture", location: toNode.id, newOwner: toNode.owner });

        if (toNode.id === enemyHq) {
          result = { type: "win", winner: player, reason: "hq_captured" };
          events.push({ type: "game_end", result });
          break;
        }
      }

      continue;
    }
  }

  // End of turn bookkeeping.
  nextState.ply += 1;
  nextState.activePlayer = otherPlayer(nextState.activePlayer);

  if (!result && nextState.ply >= settings.turnCapPlies) {
    result = { type: "draw", reason: "turn_cap" };
    events.push({ type: "game_end", result });
  }

  return { state: nextState, events, result };
}

