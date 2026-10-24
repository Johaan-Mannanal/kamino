# Working together

## Coordination

Choose a scoped task from [the ordered phases](docs/PROJECT.md) and announce the files you are changing. Coordinate shared interfaces and preserve other people's work. Responsibilities are intentionally unassigned for now.

## Share context

Upload Markdown to `docs/team-notes/` using `YYYY-MM-DD-name-topic.md`. Include the author, what is confirmed, what is proposed, and what needs an answer. Start from `_template.md` if useful.

Keep agreed decisions in `docs/decisions/`. Summarize relevant changes in `docs/PROJECT.md` so old notes do not silently change the plan.

## Code workflow

1. Pull the latest `main` before starting; do not discard local changes.
2. Use a short branch such as `codex/reconstruction`, `codex/simulation`, or `codex/upload-ui`.
3. Keep commits focused. Open a PR with the behavior changed and checks performed.
4. Coordinate shared changes to `pyproject.toml`, the asset schema, and the README.

Use mock reconstruction jobs and small synthetic fixtures to develop independently. Label synthetic fixtures and cached outputs. Verify API failures, unit conversion, invalid property values, scene loading, and portable exports as their implementations arrive.

Use `.venv-sim` for simulation development. Keep the existing LeRobot environment intact. Generated assets and job databases belong under ignored directories; small deliberate examples belong in `examples/simulation/`.

## Handoff

Leave a team note with your branch, full commit SHA, push status, environment versions, changed files, exact run commands, results, blockers, and next action. Report headless simulation and viewer checks separately. Record measurements separately from AI suggestions and assumptions.

A local file path does not transfer a file to another computer. Push needed code and small fixtures, and explicitly share larger artifacts. After the repository rename, update `origin` to `https://github.com/Johaan-Mannanal/photo2sim.git`; the local folder name may stay unchanged.
