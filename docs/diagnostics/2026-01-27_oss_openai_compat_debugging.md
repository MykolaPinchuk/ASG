# OSS `openai_compat` debugging (success rate + error modes)

**Date (Pacific):** 2026-01-27 (evening) → 2026-01-28 (early)  
**Branch:** `v05`  
**Agent:** `agent03`

This note documents tests/diagnostics performed while improving OSS success rates for OpenAI-compatible providers (NanoGPT + Chutes), and what we learned about common failure modes.

## Important constraint: no strategic guidance

During debugging, some experiments added **strategy-like guidance** (e.g., shortest-path suggestions and “win-this-ply” chains). Those changes can inflate apparent capability and do **not** meet the criterion “only rules/mechanics, no strategy”.

- Those strategy-like prompt hints were later **removed** in checkpoint `cd39e17`.
- The reliability-focused work (timeouts/streaming/retries/validation) remains valid under the “no strategy guidance” constraint.

## Goal

Improve OSS agent success rate across providers/models by reducing:
- provider errors (HTTP errors, timeouts, empty outputs),
- agent parse/validation errors,
- pass turns caused by upstream/tooling issues,
while keeping the prompt **mechanics-only**.

## Failure modes observed

### 1) Provider-side timeouts / hangs (`AbortError` / “This operation was aborted”)
Symptom:
- The agent server returns `pass` with `rationale_text` containing `openai_compat error (This operation was aborted)`.
- Typical latencies cluster near the configured timeout (often ~60s).

Interpretation:
- Either the provider is slow/hanging, or the request consumes the entire timeout budget (especially common for “thinking” models).

Diagnostics:
- `runs/agent_io/diag_agent03_afterFix4_nanogpt_2026-01-28T01-35-00Z/.../ply_0000_P1.json` shows a representative aborted request.

Mitigations implemented:
- Fixed a timeout bug so per-attempt timeouts cover the **entire** fetch+read (not just headers).
- Added streaming SSE “early return when JSON is complete” (reduces time spent waiting for long outputs).
- Reduced initial “reserve retry time” cap for reasoning models (helps avoid first-attempt aborts).

### 2) “Budget-empty” / empty output with `finish_reason=length`
Symptom:
- HTTP 200 response but `message.content` is `null`/empty and tool calls are empty.
- Often `finish_reason=length` and/or `reasoning_tokens` present.
- Seen frequently in GLM / “thinking” variants.

Example (pre-fix):
- `runs/agent_io/diag_agent03_chutes_glm47_includeReasoning_2026-01-28T00-47-48Z/.../ply_0000_P1.json`

Interpretation:
- Model/provider consumed output budget (often on reasoning) and never emitted the final JSON/tool call.
- Too-low `max_tokens` (e.g. 200) correlates strongly with this failure.

Mitigations implemented:
- Treat `empty_output`/`empty_response` as retryable “budget-empty”.
- Retry with stronger “JSON only” instruction, larger `max_tokens`, and (when budget-empty) omit `response_format` which some providers handle poorly.
- Second retry can force tool calling to coerce structured args when the model refuses to emit content/tool calls.

### 3) Low `max_tokens` causing truncation-driven failures
Symptom:
- Models that succeed with `--max-tokens 600` fail with `--max-tokens 200` (budget-empty / truncation).

Mitigation implemented:
- Raised default `--max-tokens` for non-sweep eval CLIs to 600 (sweeps can still override).

### 4) “Looks valid but useless” actions (strategic failure)
Symptom:
- Correct JSON and legal moves, but e.g. multi-hop chains move `amount=1` repeatedly, failing to take objectives.

Example:
- `runs/agent_io/diag_agent03_chutes_glm47flash_actions_2026-01-28T03-21-52Z/.../ply_0000_P1.json` shows a full path chain but `amount: 1` every step.

Important:
- Fixing this via “move-all to HQ” hints is **strategy guidance**. Such hints were added briefly during debugging and then removed in `cd39e17`.

## Key diagnostics / commands run

### Summarize agent I/O logs (error/pass patterns)
- `npm run analyze:agent-io -- --dir runs/agent_io/diag_agent03_chutes_glm47_includeReasoning_2026-01-28T00-47-48Z --limit 20`

### Quick smoke evals (1–few plies; fast triage)
- `npm run agent:eval-vs-mix -- --provider-name nanogpt --opponent greedy --turn-cap-plies 2 --games 1 --seed-start 3 --max-tokens 600 --think-hint off --save-replays false --models <comma_list>`
- `npm run agent:eval-vs-mix -- --provider-name chutes --opponent greedy --turn-cap-plies 2 --games 1 --seed-start 3 --max-tokens 600 --think-hint off --save-replays false --models <comma_list>`

### Multi-model “micro-sweeps” (results as JSONL)
NanoGPT (10 models, 1 game each):
- Output: `runs/live/sweep_agent03_nanogpt_postfix_2026-01-28T03-03-49Z.jsonl`

Chutes (10 models, 1 game each):
- Output: `runs/live/sweep_agent03_chutes_postfix_2026-01-28T03-12-17Z.jsonl`

Rank/aggregate a JSONL:
- `npm run oss:rank -- --in runs/live/sweep_agent03_nanogpt_postfix_2026-01-28T03-03-49Z.jsonl --format text --limit 50`
- `npm run oss:rank -- --in runs/live/sweep_agent03_chutes_postfix_2026-01-28T03-12-17Z.jsonl --format text --limit 50`

### Baseline evals after removing strategy guidance
After checkpoint `cd39e17` (mechanics-only prompt):
- `npm run agent:eval-vs-mix -- --provider-name chutes --opponent greedy --turn-cap-plies 2 --games 1 --seed-start 3 --save-replays false --think-hint off`
- `npm run agent:eval-vs-mix -- --provider-name nanogpt --opponent greedy --turn-cap-plies 2 --games 1 --seed-start 3 --save-replays false --think-hint off`

## Re-run: same “improvement” sweeps without strategy hints

To verify that the earlier win-rate jump was not driven by prompt strategy hints, we re-ran the same style of 10-model micro-sweeps after removing strategy-like guidance (`cd39e17` + wording cleanup `e35fd22`).

NanoGPT (10 models, 1 game each; `turnCapPlies=2`, `max_tokens=600`, `think-hint off`):
- Output: `runs/live/sweep_agent03_nanogpt_noStrategy_2026-01-28T13-00-01Z.jsonl`
- Result: 0 wins; mixture of (a) timeouts/provider errors for some “thinking” models and (b) clean JSON but no immediate win within 1 ply.

Chutes (10 models, 1 game each; same knobs):
- Output: `runs/live/sweep_agent03_chutes_noStrategy_2026-01-28T13-08-07Z.jsonl`
- Result: 0 wins; mostly “clean” calls (no provider error) but no one-ply win without strategy hints; a few timeouts persisted.

Takeaway: the big win-rate jump in the earlier “postfix” sweeps was primarily attributable to strategy-like prompt guidance, not just reliability fixes. This confirms the importance of keeping prompts mechanics-only for fair evaluation.

## What we learned

1) **Most “providerErrors” were not game-logic issues**; they were upstream instability, timeouts, or “budget-empty” completions.
2) **`max_tokens` is a first-order knob** for OSS reliability; too low triggers “empty output” failures for many “thinking” models.
3) **Streaming early stop helps** when providers stream large/slow outputs; it can reduce wall-clock time and avoid timeouts.
4) **Strict response validation is worth it**: it surfaces malformed actions early and enables targeted retries instead of silently accepting garbage.
5) **Prompt strategy hints can dominate measured performance**; they must be avoided for fair capability evaluation. Any such hints should be confined to debugging experiments and not shipped as defaults (handled by `cd39e17`).

## Relevant checkpoints

- `c34d49c` — stricter JSON/action validation + better budget-empty retry handling
- `6b9db39` — (debug experiment) move-all “win chain” hint (strategy-like; later removed)
- `cd39e17` — remove strategy guidance from prompts (mechanics-only)
