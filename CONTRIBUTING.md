# Working together

## Ownership

| Person | Primary ownership |
| --- | --- |
| Yash | `hardware/`: CAD, printing, fixtures, hardware reliability |
| Srijan | `src/dummy/robot/`: LeRobot integration, skills, transitions, stop behavior |
| Johaan | `src/dummy/planning/`: world model, planner, validator, Fetch integration |
| Atul | `src/dummy/web/`: API, interface, execution status, integration and trial logging |

Ownership coordinates work; tell the owner before changing a shared interface. Preserve other people's work.

## Share context

Upload Markdown to `docs/team-notes/` using `YYYY-MM-DD-name-topic.md`. Include the author, what is confirmed, what is proposed, and what needs an answer. Start from `_template.md` if useful.

Keep agreed decisions in `docs/decisions/`. Summarize relevant changes in `docs/PROJECT.md` so old notes do not silently change the plan.

## Code workflow

1. Pull the latest `main` before starting; do not discard local changes.
2. Use a short branch such as `codex/planner`, `robot/skills`, or `hardware/fixture`.
3. Keep commits focused. Open a PR with the behavior changed and checks performed.
4. Coordinate shared changes to `pyproject.toml`, the action contract, and the README.

Test planning with a mock executor. Only Srijan's executor should command the arm; the LLM must not produce raw servo commands. Test physical motion with someone present and a clear way to stop it.

## Handoff

Leave a team note with your branch, what works, the exact run command, blockers, and the next action. For physical trials, record configuration, attempts, successes, and failure causes. Distinguish simulated, operator-confirmed, and physically verified results.
