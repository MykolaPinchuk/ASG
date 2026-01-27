import { PRNG } from "./prng.js";
import { applyTurn, createInitialState, deriveObservation, type EngineContext } from "./engine.js";
import type { Controller } from "../controllers/controller.js";
import type { GameResult, Replay, TurnRecord } from "./types.js";

export interface RunMatchParams {
  ctx: EngineContext;
  controllers: Record<"P1" | "P2", Controller>;
  seed: number;
}

export async function runMatch(params: RunMatchParams): Promise<Replay> {
  const { ctx, controllers, seed } = params;
  const rng = new PRNG(seed);

  let state = createInitialState(ctx);
  const turns: TurnRecord[] = [];
  let result: GameResult | undefined;

  while (!result) {
    const player = state.activePlayer;
    const controller = controllers[player];
    const observations = {
      P1: deriveObservation(state, "P1"),
      P2: deriveObservation(state, "P2"),
    } as const;

    const decision = await controller.decide(observations[player]);

    const applied = applyTurn(ctx, state, decision.actions, rng);
    state = applied.state;
    result = applied.result;

    turns.push({
      ply: observations[player].ply,
      player,
      observations: { P1: observations.P1, P2: observations.P2 },
      actions: decision.actions,
      rationaleText: decision.rationaleText,
      latencyMs: decision.latencyMs,
      events: applied.events,
      stateAfter: state,
    });
  }

  return {
    version: "0.1.0",
    createdAt: new Date().toISOString(),
    seed,
    scenario: ctx.scenario,
    turns,
    result,
  };
}
