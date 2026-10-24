# DUMMY working plan

## Product

An affordable assembly assistant for prototyping labs. The user specifies a supported configuration; a planner composes reusable skills, a validator checks the plan, and the SO-101 executes it.

## Core target

- Two stack orders assembled from the same three printed parts and skill library.
- Fixed pickup pockets, fixed assembly base, preinstalled peg.
- Identical part thickness and gripping surfaces; visibly distinct parts.
- Limited variation tested explicitly. Chamfers provide mechanical tolerance; do not claim perception-based adaptation without implementing and testing it.
- Record actual success rates; aim for at least 8 successes in 10 complete assembly trials.

Trial geometry, subject to Yash's measurements: 10 mm peg, 12–13 mm holes, 8 mm part thickness, chamfered hole entrances. Print and test one peg/ring pair before the full kit.

## Stretch and cuts

Stretch: bounded language-commanded motion, with an IK solver calculating joint positions. Only attempt after the assembly loop works.

Defer simulation, policy training, arbitrary-object recognition, and forceful precision insertion.

## Software boundaries

Request → planner → deterministic validator → robot executor → status feedback.

- Johaan: world model, plan generation, validation, Fetch integration.
- Srijan: robot adapter, recordings, skill start/end poses, transitions, stop behavior.
- Atul: backend/UI integration, status, mock execution, trial logging.
- Yash: CAD, fixtures, prints, hardware setup and physical reliability.

## Proposed integration contract

Agree on this before implementation; this is our application contract, not a LeRobot API.

```json
{
  "skill": "place_on_stack",
  "part": "gear",
  "slot": "tray_A",
  "level": 0
}
```

`level` is zero-based. The skill includes pickup and placement and must start/end in documented compatible poses. The validator checks part availability, slot identity, requested stack level, supported skills, and relevant state before dispatch. The executor checks its actual state before each motion.

Statuses: `queued`, `running`, `completed`, `failed`, `stopped`. Completion of a motion is not proof of a successful assembly; record physical outcome separately. Start with operator confirmation.

## 30-hour milestones

| Hours from start | Deliverable |
| --- | --- |
| 0–2 | Agree interfaces, test reach/fit, begin printing |
| 2–6 | Reliable pickup/placement; planner and interface use mock executor |
| 6–12 | First complete assembly through interface |
| 12–18 | Second configuration, tested transitions, Fetch integration |
| 18–23 | Repeated physical trials and reliability fixes |
| 23–26 | IK stretch if core is reliable; otherwise fix core |
| 26–30 | Freeze features, record demo, submit, rehearse |

The actual submission deadline takes precedence over this relative timeline. Rotate rest.

## Prize direction

Primary: Best Hardware Hack. Secondary: Most Technically Advanced. Cash target: Fetch.ai, conditional on satisfying its full workflow and submission requirements. Vultr is optional infrastructure; do not make cloud availability a dependency for local robot control.

## Open decisions

- Actual part dimensions, gripper clearance, and fixture locations.
- Installed LeRobot version/commit and how the local executor is launched.
- Exact acceptable variation and how it will be measured.
- Planner model/access and sponsor credentials.
- Named owners for shared interfaces and final integration timing.
