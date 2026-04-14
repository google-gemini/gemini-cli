# PCC Delegation

This document describes the thin controller layer for delegating work to Gemini
CLI and Jules under strict PCC control.

## Why this exists

Gemini CLI is already usable as an ACP execution surface in this repository, but
the current PCC integration is mostly observational:

- ACP hook reports exist and are tested.
- SessionEnd and AfterTool adapters can emit deterministic artifacts.
- Fake Jules routing is validated through the generic `runtime_commands.jules`
  path.

What is still missing is the layer that turns those pieces into deterministic
delegation:

- a task contract,
- a report contract,
- a controller decision policy,
- and a single command that can dispatch structured work to Gemini CLI or Jules.

## Architecture

The intended layering is:

1. Controller layer: decomposes work, selects runtime, and makes the final
   allow/review/reject decision.
2. `scripts/pcc-delegate`: loads a task manifest, builds a strict prompt
   contract, invokes `scripts/pcc-critic`, and normalizes the result into a
   machine-readable report.
3. `scripts/pcc-critic`: injects PCC constraints and calls the chosen runtime.
4. Runtime lane:
   - `gemini` for large-volume read-only analysis and auditing.
   - `jules` for longer execution lanes or code-producing work through
     `runtime_commands.jules`.
   - `claude` where a second external critic is useful.

## Strict control model

PCC is treated as mandatory. The controller should not dispatch open-ended
prompts directly to Gemini CLI or Jules.

The control path is:

1. Author a task manifest.
2. Dispatch with `pcc-delegate`.
3. Read the normalized report.
4. Convert the report to a controller action.

The built-in controller decisions are:

- `allow`: audited response is strong enough to continue.
- `review`: response has value but lacks enough evidence.
- `reject`: response is weak, sycophantic, missing, or structurally unusable.
- `retry`: runtime or infrastructure failure needs a rerun.

## Pre-dispatch gate

Each task manifest now carries a `dispatch_gate` block.

The gate runs before any runtime call and decides whether the task is allowed to
leave the controller at all.

The gate currently enforces:

- runtime allowlists per task
- runtime-specific execution mode limits
- minimum evidence and success-criteria counts
- artifact requirements
- explicit Jules config requirements for execution lanes

The supported execution modes are:

- `analysis`: read-only reasoning and auditing
- `plan`: plan generation only, with no claim of execution
- `execute`: code- or artifact-producing work on lanes that are permitted to
  execute

The runtime policy is intentionally strict:

- Gemini CLI: `analysis`, `plan`
- Claude: `analysis`, `plan`
- Jules: `analysis`, `plan`, `execute`

If the pre-dispatch gate returns `review`, `reject`, or `retry`, `pcc-delegate`
does not invoke the runtime lane.

## Contracts

The machine-readable contracts live here:

- [schemas/pcc-delegation-task.schema.json](schemas/pcc-delegation-task.schema.json)
- [schemas/pcc-delegation-report.schema.json](schemas/pcc-delegation-report.schema.json)

The task schema defines what the controller must specify before dispatch:

- task identity
- target runtime
- PCC preset and model
- objective
- context
- constraints
- required evidence
- success criteria
- expected artifacts
- next actions for each controller decision

The report schema defines what comes back from the delegated lane:

- normalized runtime metadata
- the PCC result
- the controller decision
- the next controller action
- the written report path

## Current unfinished backlog

The repository-local backlog extracted from the current implementation lives
here:

- [examples/pcc/current-backlog/001-controller-ledger.json](examples/pcc/current-backlog/001-controller-ledger.json)
- [examples/pcc/current-backlog/002-pre-dispatch-gate.json](examples/pcc/current-backlog/002-pre-dispatch-gate.json)
- [examples/pcc/current-backlog/003-report-reader-e2e.json](examples/pcc/current-backlog/003-report-reader-e2e.json)
- [examples/pcc/current-backlog/004-live-jules-routing.json](examples/pcc/current-backlog/004-live-jules-routing.json)

These are deliberately shaped so they can be handed to Gemini CLI or Jules
through the same interface.

## Commands

Validate the backlog without calling any live runtime:

```bash
python3 scripts/pcc-delegate --task-path examples/pcc/current-backlog --dry-run
```

Dispatch a single task to Gemini CLI under PCC control:

```bash
python3 scripts/pcc-delegate \
  --task-path examples/pcc/current-backlog/002-pre-dispatch-gate.json \
  --runtime gemini
```

Dispatch a single task to Jules using a repo-local runtime config:

```bash
python3 scripts/pcc-delegate \
  --task-path examples/pcc/current-backlog/001-controller-ledger.json \
  --runtime jules \
  --config path/to/pcc-critic.json
```

Reports are written under `.gemini/pcc-delegation-reports/` by default.

## Important operational notes

- SessionEnd is useful for checkpointing, but not for hard gating. It is
  best-effort.
- The strict gate belongs in controller pre-dispatch logic or actionable hook
  boundaries.
- `PCC_CRITIC_CONFIG_PATH` should resolve from the delegated workspace, not from
  the repo root.
- Fake Jules tests prove adapter wiring only. They do not prove the live Jules
  route.

## Recommended next implementation pass

The safest order is:

1. Add the controller ledger.
2. Add the pre-dispatch gate and verdict-to-action policy.
3. Add the report reader and end-to-end validation.
4. Only then wire the live Jules route.
