# Gemini CLI Guide

## Build & Preflight

Before submitting changes run `npm run preflight`. This builds the repo, runs tests, typechecks and lints in one pass. Individual steps (`build`, `test`, `typecheck`, `lint`) can be run separately but preflight is preferred for full coverage.

## Interruption‑aware workflow

An interruption occurs when a user types while an answer is streaming. The CLI calls the Gemini 2.5 Flash model asynchronously to rate the interruption:

- **–1 – continue**: a polite nudge such as “ok sorry”. Finish the current answer.
- **0 / 1 – quick reply**: the user needs a short answer. Use Flash to answer in parallel while continuing the main task.
- **2 – new rule**: the user’s message creates or updates rules that guide future behavior.

## UI conventions

### Log stream

```
User asks: "How are you progressing?"  ← bright cyan
Agent:
  I’ve located draw_handler_add…           ← bright green / white
!Interruption: "continue"
  level: 0                                 ← magenta label
```

Immediately after each agent reply the CLI prints reasoning and actions:

```
Thoughts:
    • Searched for "draw_handler"…        ← yellow label, white bullets
    • Planning frame_change_pre hook
Actions:
    • Last action: "Refining real-time updates"  ← light purple label, violet text
```

### Sidebar

The sidebar presents a goal‑oriented outline:

```
Main goal:
    Fulfill the user’s request to implement real‑time gizmo updates in Blender.

Possible steps:
    1) Analyze existing drawing & handler code
        • Goal: locate draw_* & handler_* in plugin
        • Tools: file search, regex
        A) Search for "draw" in blender_plugin.py
        B) Search for "handler" in blender_plugin.py
        C) Sketch update function signature
    !1) Alternative path: use Blender’s Python API docs directly

Failures:
    • count: 0 so far
    • Last failure: missing old_string in replace

Interruptions:
    • Last interruption: "Continue"
        level: 0
```

## Plan management

The agent regularly inspects `plans.json`, updating it after each action, human‑loop exchange or interruption. The file records the history of plans and forks when user feedback or new reasoning alters the path.

## Tools

- **Human in the loop** – a tool for requesting direction or advice from the user at any time.
- Standard utilities such as file search, regex and shell commands remain available.

## Agent engine

`agent_engine` intercepts every chain‑of‑thought before an action is executed. It can:

- Count total failures.
- Count failures by action type or MCP server call.
- Apply rules to upcoming thoughts or tool usage.

Rules live in `rules.json`, pre‑populated with defaults:

- Escalate if more than three errors occur for the same goal or tool.
- Escalate if more than four consecutive errors occur overall.

## Python orientation

Python is a first‑class environment for this CLI. When working on `.py` files, resolve indentation problems with:

```bash
python fix_indent.py /path/to/file.py
```

Use Python tools where appropriate, and treat the user as an active collaborator through interruptions and the **Human in the loop** tool.

## Collaboration philosophy

The agent welcomes mid‑stream user messages. The interruption rating determines whether to continue the current task, answer in parallel, or generate new rules. `plans.json` and `rules.json` keep the agent aligned with human guidance at all times.
