# HANDOFF

## Current slice
MVP v0 is implemented end-to-end (engine → replays → viewer → agent server/provider plumbing). Recent work focused on OSS model integration and sweeps across providers, plus evaluation tooling + viewer observability.

Branching:
- `master` is now the default branch.
- Ongoing work should land on `v05` (pre-v1 hardening).

## OSS baselines (default for testing)
These are the current recommended OSS baselines for ongoing testing (stable/low provider errors; note that **prompts are mechanics-only** so win-rate can be lower than earlier “hinted” experiments):
- Chutes:
  - `tngtech/DeepSeek-R1T-Chimera`
  - `chutesai/Mistral-Small-3.1-24B-Instruct-2503`
  - `deepseek-ai/DeepSeek-V3-0324-TEE`
- NanoGPT:
  - `deepseek/deepseek-v3.2`
  - `mistralai/devstral-2-123b-instruct-2512`

Smoke (1 game each vs GreedyBot, seed=3):
- Chutes: `npm run agent:eval-vs-mix -- --provider-name chutes --base-url https://llm.chutes.ai/v1 --opponent greedy --models-file configs/oss_baselines_chutes.txt --games 1 --seed 3`
- NanoGPT: `npm run agent:eval-vs-mix -- --provider-name nanogpt --opponent greedy --models-file configs/oss_baselines_nanogpt.txt --games 1 --seed 3`

## Known-good models (fallback shortlist)
If provider/model availability changes, these OpenRouter models have recently worked well end-to-end in this repo:
- Primary: `x-ai/grok-4.1-fast`

Notes:
- `openai/gpt-5-mini` is currently unreliable in this harness (frequent empty/partial outputs leading to passes).
- OpenRouter now defaults to `x-ai/grok-4.1-fast` when `--model` is omitted.
- Recent OpenRouter runs showed `google/gemini-2.5-flash` and `google/gemini-3-flash-preview` producing mostly `pass` actions vs `GreedyBot` (losses), so they are not currently a recommended fallback.

## Regression spec (paid)
When making harness changes, keep the paid regression check stable and cost-capped:
- `npm run eval:grok-vs-greedy` (max 3 games; saves replays)

## Invariants (do not break)
- Spec is source of truth: `docs/planning/MVP_SPEC.md`.
- Deterministic replays: same seed + same actions ⇒ identical outcomes.
- No secrets or bulky artifacts in git (see `.gitignore`).
- `IA_HANDOFF/` is an immutable snapshot (do not edit).
- v0 / `v05` eval guardrails: default to `turnCapPlies<=30` and `games/count<=5` unless explicitly overridden (see `extra_instructions_v0.md`).

## State of work

### Done (with evidence)
- Deterministic engine + match runner + replay schema:
  - Engine/runner: `src/game/engine.ts`, `src/game/match.ts`, `src/game/types.ts`, `src/scenario/loadScenario.ts`
  - Replay schema: `schemas/replay.schema.json`
  - CLI: `npm run match` (`src/cli/runMatch.ts`)
- Viewer that can load replay JSONs and shows timeline + events + agent rationale, with a Players panel showing agent provider/model when present:
  - `viewer/index.html`
  - Evidence: `96a05b8` (`agent01: checkpoint(viewer): show agent model`), `f1cf8fa` (`agent01: checkpoint(viewer): add in-app explanations + event highlighting`)
- Viewer now shows per-ply agent latency when present:
  - `viewer/index.html` reads `turn.latencyMs` (optional)
- HTTP agent controller + agent server:
  - Controller: `src/controllers/httpAgentController.ts`
  - Server: `src/cli/agentServer.ts` (providers: `stub`, `openai_compat`)
  - Evidence: `b5e1bb7` (`agent01: checkpoint(runner): add agent server (stub + openai compat)`)
- OpenAI-compatible provider plumbing with robustness (parsing/tool-call retry, error surfacing into rationale):
  - `src/providers/openaiCompat.ts`
  - Evidence: `1277255` (`agent01: checkpoint(runner): tool-call + retry`), `e39f815` (`agent03: checkpoint(runner): OSS reliability retries + timeout buffer`), `c34d49c` (`agent03: checkpoint(runner): stricter JSON validation + better budget-empty retries`)
- Mechanics-only prompt policy for fairness (remove strategy-like hints):
  - `src/providers/openaiCompat.ts`
  - Evidence: `cd39e17` (`agent03: checkpoint(runner): remove strategic guidance from prompts`), `e35fd22` (`agent03: checkpoint(runner): clarify sequential mechanics wording`)
- OSS model allowlist/priority list (derived from TML-bench) + model listing:
  - `configs/oss_models.json`, `src/llm/models.ts`, `npm run agent:list-models`
  - Evidence: `f6daf7a` (`agent01: checkpoint(misc): OSS allowlist + model auto`)
- OSS diagnostics writeup (tests + failure modes + lessons):
  - `docs/diagnostics/2026-01-27_oss_openai_compat_debugging.md`
  - Evidence: `ed12392` (`agent03: checkpoint(docs): document OSS debugging + learnings`), `db8aa63` (`agent03: checkpoint(docs): add no-strategy sweep rerun results`)
- Model evaluation tooling:
  - Agent vs Random: `npm run agent:vs-random` (`src/cli/agentVsRandom.ts`)
  - Model eval vs MixBot/GreedyBot (prints per-game metrics + optional JSONL live log): `npm run agent:eval-vs-mix` (`src/cli/evalModelsVsMix.ts`)
  - OSS sweep (smoke + full seed run): `npm run agent:sweep-oss` (`src/cli/sweepOssModels.ts`)
  - Evidence: `479cae7` (`agent01: checkpoint(runner): add OSS model sweep`), `2089ade` (`agent01: checkpoint(runner): unique replays per model`)
- Local run outputs (gitignored) contain sweep + retest results:
  - `runs/model_sweeps/2026-01-26T04-05-58-850Z/summary.md`
  - `runs/model_retests/2026-01-26T05-13-32_seed5_rerun/seed5_results.json`
  - More recent key runs:
    - OSS full run (post-fixes): `runs/model_sweeps/oss_fullrun_2026-01-27T13-12-04Z/combined_summary.md`
    - OSS winners vs Mix+Greedy (3 games each): `runs/model_sweeps/oss_winners_3x_mix_3x_greedy_2026-01-27T20-51-39Z/winners_eval_summary.md`
    - OSS baseline smoke: `runs/model_sweeps/oss_baselines_smoke_2026-01-27T23-06-00Z/results.json`

### v0.5 Next (pre-v1, ordered)
1) Reduce draw rate via *tuning only* (no new mechanics):
   - Add a small tuning sweep tool and promote tuned defaults into scenario settings.
2) Improve viewer “debug speed”:
   - Add a match summary panel (captures, pass/error counts, latency stats).
   - Add per-turn badges for `pass` / `invalid_action` / provider errors.
3) Improve agent observability in replays:
   - Persist additional per-turn diagnostics (e.g., http status / error string) so failures are visible in the viewer without opening logs.
4) Continue `openai_compat` robustness work (no strategic fallback):
   - Focus on “thinking-only / no final JSON” behavior for some providers/models.

### Open questions
- What “OSS-only” means per provider in practice (some providers mix OSS + closed models in `/models` lists; current allowlist approach is prefix-based + explicit config in `configs/oss_models.json`).

## Repro / smoke check
- From repo root:
  - Deterministic match → replay: `npm run match -- --seed 1 --p1 greedy --p2 greedy`
  - Validate replay JSON: `npm run validate:replay -- replays/<replay>.json`
  - View replay: open `viewer/index.html` (file picker) and select the replay JSON.
  - Agent vs Random (requires `secrets/provider_apis.txt`): `npm run agent:vs-random -- --provider-name nanogpt --model auto --count 3 --start 1 --save-replays true`
  - OSS baselines (Chutes) vs GreedyBot: `npm run agent:eval-vs-mix -- --provider-name chutes --base-url https://llm.chutes.ai/v1 --opponent greedy --models-file configs/oss_baselines_chutes.txt --games 1 --seed 3`
  - OSS sweep (can take a while; requires provider keys): `npm run agent:sweep-oss -- --providers nanogpt,chutes --max-models 30 --full-seed 3 --full-turn-cap 30`

## Known issues / current breakage
- Provider flakiness: capacity/rate-limit errors can cause many agent passes (esp. some Chutes models); these are surfaced as `openai_compat failed: ...` in rationale.
- Some models produce malformed JSON/tool output; `openai_compat` retries once but can still fail and fall back to `pass`.
- Important: earlier “big win-rate” OSS results were shown to be driven by prompt strategy hints; after removing hints, re-runs produced 0 wins in the same one-ply micro-sweep setup (see `docs/diagnostics/2026-01-27_oss_openai_compat_debugging.md`).

## Git notes (handoff)
- Intentionally uncommitted local-only data:
  - `secrets/` (provider API keys)
  - `runs/` (sweep outputs)
  - `replays/` (generated match replays)
