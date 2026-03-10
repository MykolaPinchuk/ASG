import { PRNG } from "./prng.js";
import { applyTurn, createInitialState, deriveObservation, type EngineContext } from "./engine.js";
import type { Controller, FullTurnMemory } from "../controllers/controller.js";
import { otherPlayer, type GameResult, type Replay, type TurnRecord } from "./types.js";
import { pacificIsoString } from "../utils/pacificTime.js";

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
  const pendingOwnTurn: Partial<Record<"P1" | "P2", TurnRecord>> = {};
  const persistentNoteByPlayer: Partial<Record<"P1" | "P2", string>> = {};
  const lastFullTurnByPlayer: Partial<Record<"P1" | "P2", FullTurnMemory>> = {};
  let result: GameResult | undefined;

  while (!result) {
    const player = state.activePlayer;
    const controller = controllers[player];
    const observations = {
      P1: deriveObservation(state, "P1"),
      P2: deriveObservation(state, "P2"),
    } as const;

    const startedAt = Date.now();
    const memoryContext =
      persistentNoteByPlayer[player] || lastFullTurnByPlayer[player]
        ? {
            ...(persistentNoteByPlayer[player] ? { persistentNote: persistentNoteByPlayer[player] } : {}),
            ...(lastFullTurnByPlayer[player] ? { lastFullTurn: lastFullTurnByPlayer[player] } : {}),
          }
        : undefined;
    const decision = await controller.decide(observations[player], memoryContext ? { memoryContext } : undefined);
    const measuredLatencyMs = Date.now() - startedAt;
    const latencyMs = decision.latencyMs ?? measuredLatencyMs;
    if (!Number.isFinite(latencyMs) || latencyMs < 0) throw new Error(`invalid latencyMs (${latencyMs}) from controller=${controller.id}`);

    const applied = applyTurn(ctx, state, decision.actions, rng);
    state = applied.state;
    result = applied.result;

    const events = applied.events.slice();
    const retry = decision.diagnostics?.retry;
    if (
      decision.diagnostics?.usedRetry === true &&
      retry &&
      typeof retry.fromReasoningEffort === "string" &&
      typeof retry.toReasoningEffort === "string"
    ) {
      events.push({
        type: "agent_retry",
        attempt: 2,
        fromReasoningEffort: retry.fromReasoningEffort,
        toReasoningEffort: retry.toReasoningEffort,
        firstError: retry.firstError,
        firstUpstreamStatus: retry.firstUpstreamStatus,
      });
    }

    const turnRecord: TurnRecord = {
      ply: observations[player].ply,
      player,
      submittedActions: decision.actions,
      observations: { P1: observations.P1, P2: observations.P2 },
      actions: decision.actions,
      actionResults: applied.actionResults,
      summary: applied.summary,
      rationaleText: decision.rationaleText,
      memoryUpdate: decision.memoryUpdate,
      latencyMs,
      controllerId: controller.id,
      diagnostics: decision.diagnostics,
      events,
      stateAfter: state,
    };
    turns.push(turnRecord);

    if (decision.memoryUpdate) persistentNoteByPlayer[player] = decision.memoryUpdate;

    const completedFor = otherPlayer(player);
    const waitingTurn = pendingOwnTurn[completedFor];
    if (waitingTurn) {
      lastFullTurnByPlayer[completedFor] = {
        turn: Math.floor(waitingTurn.ply / 2) + 1,
        me: {
          actions: waitingTurn.submittedActions,
          summary: waitingTurn.summary,
        },
        enemy: {
          actions: turnRecord.submittedActions,
          summary: turnRecord.summary,
        },
      };
    }
    pendingOwnTurn[player] = turnRecord;
  }

  return {
    version: "1.0.0",
    createdAt: pacificIsoString(),
    seed,
    scenario: ctx.scenario,
    turns,
    result,
  };
}
