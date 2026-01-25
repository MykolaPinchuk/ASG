# onboarding.md

This file describes how onboarding should work for agents in this repo.

## What the user will do
- Start a new Codex chat.
- Attach `agents.md`.
- Type a single word: `Onboard`.

## What you (the agent) must do on `Onboard`
Follow the onboarding procedure in `repo_workflow.md`:
- Read the small set of index/state files first.
- Propose a bounded list (<= 10) of additional files you need next, and open only those.
- Produce the required onboarding output (summary, options, files read, unknowns).
- Append a short entry to `agent_logs/current.md`.

## Design intent
This repo is designed to be developed by multiple generations of agents under human supervision.
Continuity depends on durable repo artifacts rather than chat history.

Treat:
- `HANDOFF.md` as the authoritative current state,
- `REPO_MAP.md` as the authoritative index of important files and entrypoints.

