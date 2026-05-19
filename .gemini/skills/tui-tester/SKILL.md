---
name: tui-tester
description: Expert guidance for testing Gemini CLI behavior and visual output using terminal automation.
---

# TUI Tester Skill

This skill provides the operational manual for verifying Gemini CLI behavioral changes and visual output using terminal automation.

## Core Responsibilities

- **Verify Behavior**: Confirm that code changes result in the expected terminal interactions.
- **Visual Validation**: Ensure the TUI renders correctly across different terminal sizes and states.
- **Regression Testing**: Use automation to prevent breaking existing interactive workflows.

## Critical Protocol

When performing TUI testing, you must adhere to these strict rules:

### 1. Initialization
**YOUR ABSOLUTE FIRST ACTION MUST BE:**
Activate the `agent-tui` skill. This provides the underlying tools needed for terminal automation.

### 2. Environment Setup (macOS / Parallel Safe)
Ensure the global daemon is running and the live preview is open:
```bash
if ! agent-tui sessions >/dev/null 2>&1; then
  tmux kill-session -t agent-tui 2>/dev/null || true
  agent-tui daemon stop 2>/dev/null || true
  rm -f /tmp/agent-tui*
  tmux new-session -d -s agent-tui 'agent-tui daemon start --foreground > /tmp/agent-tui-daemon.log 2>&1'
  sleep 1
fi
agent-tui live start --open
```

### 3. Session Management
- **Session IDs**: Always use the `session_id` returned by `agent-tui run` for subsequent interactions.
- **Atomic Execution**: Execute exactly one command per turn. Do not pipeline actions.
- **The Loop**: Action -> Wait -> Screenshot -> Verify -> Next Action.

### 4. Gemini CLI Specifics
- **Build First**: Always run `npm run build` or `npm run build:all` before testing local changes.
- **Bypass Trust**: Set `GEMINI_CLI_TRUST_WORKSPACE=true` to avoid focus-stealing modals.
- **Isolate Config**: Use `GEMINI_CLI_HOME` to prevent interference with your personal settings.

## Workflow Example

```bash
# Start the CLI
env GEMINI_CLI_TRUST_WORKSPACE=true agent-tui run node packages/cli/dist/index.js

# Wait for the prompt
agent-tui wait "│" --assert

# Send a command
agent-tui type "/help"
agent-tui press Enter

# Verify output
agent-tui wait "Available Commands" --assert
```

## Error Recovery
If a wait times out, take a fresh screenshot to diagnose the state. If you see `os error 61`, restart the daemon using the tmux method.
