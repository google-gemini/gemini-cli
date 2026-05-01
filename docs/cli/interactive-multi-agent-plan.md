# Interactive multi-agent plan

This document outlines a safer path from the current non-interactive multi-agent scaffold toward a Codex/Claude-style interactive inline workflow in Gemini CLI.

## Problem

The initial scaffold only supports a batch-style non-interactive flow:

```text
prompt -> planner -> researcher -> coder -> tester -> reviewer -> exit
```

That is useful for automation, but it does not solve the core product gap: users want interactive inline agent management while they are already inside Gemini CLI.

The target experience is closer to:

```text
user prompt
  -> visible planner status
  -> inline plan / approval
  -> coder applies edits under existing policy controls
  -> tester runs checks
  -> reviewer summarizes risks
  -> user can interrupt, steer, skip, or rerun roles
```

## Goals

- Support multi-agent orchestration inside the interactive TUI.
- Preserve existing policy engine, sandbox, approval, trusted-folder, and auth behavior.
- Show role progress inline instead of hiding work in a batch execution path.
- Let users steer the workflow with slash commands or inline controls.
- Avoid uncontrolled parallel writes until isolation is implemented.

## Non-goals for the first interactive version

- No uncontrolled parallel file edits.
- No bypass of existing approval or policy systems.
- No separate tool-permission model for agents.
- No hidden background execution after the user exits the session.

## Proposed architecture

```text
Interactive prompt
  -> MultiAgentController
      -> Planner role
      -> Researcher role
      -> Coder role
      -> Tester role
      -> Reviewer role
  -> UI status events
  -> Existing tool scheduler / policy engine / sandbox
```

### Components

1. `MultiAgentController`
   - Owns role state, current role, cancellation, and user steering.
   - Emits status events for the UI.
   - Runs roles sequentially in v1.

2. `InteractiveMultiAgentStatus`
   - React/Ink component that renders current role, last action, and pending confirmation state.
   - Should be fed by controller events rather than direct model output parsing.

3. Slash commands
   - `/agents start [roles]`
   - `/agents stop`
   - `/agents status`
   - `/agents skip`
   - `/agents review`

4. Policy integration
   - Agents must use the same `Config`, scheduler, approval, sandbox, and policy engine as normal interactive actions.
   - In untrusted folders, agent actions must not silently upgrade approval mode.

## Phased implementation

### Phase 1: current scaffold hardening

- Keep the non-interactive scaffold as an internal proof of concept.
- Add missing CLI arg typing only if maintainers want the batch mode exposed.
- Add unit tests for role parsing, max-agent capping, and dry-run prompt construction.

### Phase 2: interactive state model

- Add a controller that can be constructed from the existing interactive `Config`.
- Add role lifecycle states:
  - `idle`
  - `planning`
  - `researching`
  - `coding`
  - `testing`
  - `reviewing`
  - `blocked`
  - `cancelled`
  - `done`
- Emit structured UI events for role transitions.

### Phase 3: TUI integration

- Render an inline agent status panel inside `AppContainer` or the existing message stream area.
- Surface each role as a visible step, not as hidden nested prompts.
- Ensure Ctrl+C and existing cancellation behavior stop the active role cleanly.

### Phase 4: user controls

- Add slash commands for starting, stopping, skipping, and reviewing roles.
- Add a confirmation point before the coder role applies edits when policy requires approval.
- Allow users to select roles for a run.

### Phase 5: safe parallelism

Parallelism should wait until isolation exists. Before enabling true parallel agents:

- Use per-agent git worktrees or isolated patch buffers.
- Require conflict detection before applying edits.
- Gate merge/apply through reviewer or user approval.
- Prevent multiple agents from mutating the same file concurrently.

## Security considerations

- Prompt text alone must not be treated as an enforcement boundary. Dry-run instructions are useful but not sufficient; tool permissions and scheduler policy remain the real control plane.
- Agents must never get new permissions beyond the active session policy.
- The controller should be cancellable and should not spawn detached background processes.
- Secrets must not be printed in status summaries.
- Any future parallel mode must isolate file changes before merge.

## Recommended next PR shape

The current PR should either:

1. Become a small design/scaffold PR that does not expose unreachable CLI flags; or
2. Be updated to include minimal CLI flag typing plus tests, clearly labeling it as a non-interactive precursor.

The follow-up PR should focus on interactive integration:

- Add `MultiAgentController` state model.
- Add UI status component.
- Add `/agents status` and `/agents stop` first.
- Add `/agents start` only after cancellation and policy behavior are verified.
