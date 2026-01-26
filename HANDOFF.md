# HANDOFF

## Current slice
MVP v0 is implemented end-to-end (engine → replays → viewer → agent server/provider plumbing). Recent work focused on OSS model integration and sweeps across providers; next work is making the LLM-agent more reliable (fewer passes/provider errors) without adding strategic “fallback” behavior.

## Invariants (do not break)
- Spec is source of truth: `docs/planning/MVP_SPEC.md`.
- Deterministic replays: same seed + same actions ⇒ identical outcomes.
- No secrets or bulky artifacts in git (see `.gitignore`).
- `IA_HANDOFF/` is an immutable snapshot (do not edit).

## State of work

### Done (with evidence)
- Deterministic engine + match runner + replay schema:
  - Engine/runner: `src/game/engine.ts`, `src/game/match.ts`, `src/game/types.ts`, `src/scenario/loadScenario.ts`
  - Replay schema: `schemas/replay.schema.json`
  - CLI: `npm run match` (`src/cli/runMatch.ts`)
- Viewer that can load replay JSONs and shows timeline + events + agent rationale, with a Players panel showing agent provider/model when present:
  - `viewer/index.html`
  - Evidence: `96a05b8` (`agent01: checkpoint(viewer): show agent model`), `f1cf8fa` (`agent01: checkpoint(viewer): add in-app explanations + event highlighting`)
- HTTP agent controller + agent server:
  - Controller: `src/controllers/httpAgentController.ts`
  - Server: `src/cli/agentServer.ts` (providers: `stub`, `openai_compat`)
  - Evidence: `b5e1bb7` (`agent01: checkpoint(runner): add agent server (stub + openai compat)`)
- OpenAI-compatible provider plumbing with robustness (parsing/tool-call retry, error surfacing into rationale):
  - `src/providers/openaiCompat.ts`
  - Evidence: `1277255` (`agent01: checkpoint(runner): tool-call + retry`)
- OSS model allowlist/priority list (derived from TML-bench) + model listing:
  - `configs/oss_models.json`, `src/llm/models.ts`, `npm run agent:list-models`
  - Evidence: `f6daf7a` (`agent01: checkpoint(misc): OSS allowlist + model auto`)
- Model evaluation tooling:
  - Agent vs Random: `npm run agent:vs-random` (`src/cli/agentVsRandom.ts`)
  - OSS sweep (smoke + full seed run): `npm run agent:sweep-oss` (`src/cli/sweepOssModels.ts`)
  - Evidence: `479cae7` (`agent01: checkpoint(runner): add OSS model sweep`), `2089ade` (`agent01: checkpoint(runner): unique replays per model`)
- Local run outputs (gitignored) contain sweep + retest results:
  - `runs/model_sweeps/2026-01-26T04-05-58-850Z/summary.md`
  - `runs/model_retests/2026-01-26T05-13-32_seed5_rerun/seed5_results.json`

### Next (ordered)
1) Improve reliability of LLM→actions (without adding strategic fallback):
   - Reduce “pass because provider error / malformed JSON” turns.
   - Continue tightening `openai_compat` parsing/tool-use behavior in `src/providers/openaiCompat.ts`.
2) Improve agent prompt/context (informational only, minimal strategy):
   - Ensure the agent sees win conditions, income/supply, combat mechanics, and action constraints clearly.
3) Improve run observability:
   - Ensure replays clearly indicate which player is the agent and which provider/model was used (viewer reads `replay.players`).
4) Optional: add OpenRouter key and include it in sweeps (currently skipped if not present in `secrets/provider_apis.txt`).

### Open questions
- What “OSS-only” means per provider in practice (some providers mix OSS + closed models in `/models` lists; current allowlist approach is prefix-based + explicit config in `configs/oss_models.json`).

## Repro / smoke check
- From repo root:
  - Deterministic match → replay: `npm run match -- --seed 1 --p1 greedy --p2 greedy`
  - Validate replay JSON: `npm run validate:replay -- replays/<replay>.json`
  - View replay: open `viewer/index.html` (file picker) and select the replay JSON.
  - Agent vs Random (requires `secrets/provider_apis.txt`): `npm run agent:vs-random -- --provider-name nanogpt --model auto --count 3 --start 1 --save-replays true`
  - OSS sweep (can take a while; requires provider keys): `npm run agent:sweep-oss -- --providers nanogpt,chutes --max-models 30 --full-seed 3`

## Known issues / current breakage
- Provider flakiness: capacity/rate-limit errors can cause many agent passes (esp. some Chutes models); these are surfaced as `openai_compat failed: ...` in rationale.
- Some models produce malformed JSON/tool output; `openai_compat` retries once but can still fail and fall back to `pass`.

## Git notes (handoff)
- Intentionally uncommitted local-only data:
  - `secrets/` (provider API keys)
  - `runs/` (sweep outputs)
  - `replays/` (generated match replays)
