---
name: onboard
description: Deterministic onboarding for this repo (read minimal index files first, then bounded discovery).
---

When invoked (or when the user says `Onboard`), do this exactly:

1) Identity sync first (mandatory):
   - Detect kickoff tag `agentNN` from user kickoff text if present.
   - Read `agent_logs/current.md` and compare `id:`.
   - If kickoff tag exists and differs, update `agent_logs/current.md` to kickoff tag before continuing.
   - Append one log line to `agent_logs/current.md`:
     - `Identity sync: session_tag=<...> current_md_before=<...> current_md_after=<...> synced=<true|false>`

2) Read (in order, if present):
   - `agents.md` (if not already in context)
   - `repo_workflow.md`
   - `onboarding.md`
   - `HANDOFF.md`
   - `REPO_MAP.md`
   - `README.md` (focus on "For agents")
   - `docs/planning/MVP_SPEC.md` (source of truth)

3) Bounded discovery:
   - Identify up to **10** additional files you need for the *current* slice.
   - Print the list (file path + 1-line reason each).
   - Open only those files after listing them.
   - Do not perform broad repo scans.

4) Output contract:
   - 5 bullets: current state summary
   - 3 options: next slice choices (each 1–2 bullets)
   - Files read (including the bounded discovery list)
   - Unknowns/risks (<= 5 bullets)

5) Log:
   - Append an entry to `agent_logs/current.md` with intent and next steps.
