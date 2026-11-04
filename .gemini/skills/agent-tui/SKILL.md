---
name: agent-tui
description: >
  Main Agents: Do NOT use this skill directly. If you need to test the TUI, invoke the `tui_tester` subagent.
  Drive terminal UI (TUI) applications programmatically for testing, automation, and inspection.
  Use when: automating CLI/TUI interactions, regression testing terminal apps, or verifying interactive behavior.
  Also use when: user asks "what is agent-tui", "what does agent-tui do", "demo agent-tui", "show me agent-tui", "how does agent-tui work", or wants to see it in action.
---

## 🚨 CRITICAL: macOS Daemon Workaround & Gemini CLI Usage 🚨

When using `agent-tui` in this macOS environment, the default background daemonization process crashes, causing `Connection refused (os error 61)` errors. 

**You MUST start the daemon manually shielded from TTY hangups before running any `agent-tui` commands.** Using `nohup` is insufficient; you must use `tmux` to provide a fully isolated pseudo-terminal. 

To support parallel runs, **only restart the daemon if it is not currently running:**

```bash
# Check if daemon is alive, start it in tmux if it is not
if ! agent-tui sessions >/dev/null 2>&1; then
  tmux kill-session -t agent-tui 2>/dev/null || true
  agent-tui daemon stop 2>/dev/null || true
  rm -f /tmp/agent-tui*
  tmux new-session -d -s agent-tui 'agent-tui daemon start --foreground > /tmp/agent-tui-daemon.log 2>&1'
  sleep 1
fi
```

### Session ID vs PID (Crucial for Reconnection)

When `agent-tui run` returns JSON, it includes both a `session_id` and a `pid`. The `pid` is purely informational (the OS process ID of the child command). You **do not** use the `pid` to reconnect or issue commands. You must always use the `session_id` (e.g., `--session <id>`). 

If the daemon crashes (`os error 61`), the pseudo-terminal is destroyed. Even if the child `pid` survives as an orphan, you cannot reconnect to it. You must restart the daemon using the workaround above and start a completely new session.

### Testing the Gemini CLI

When testing the Gemini CLI with `agent-tui`, there are several strict requirements to ensure deterministic and accurate behavior:

1. **Build Before Running**: `agent-tui` runs the built JS files, not TypeScript. You **MUST** run `npm run build` or `npm run build:all` after making code changes and before launching the CLI with `agent-tui`.
2. **Bypass Trust Modals**: Always pass `GEMINI_CLI_TRUST_WORKSPACE=true` in the environment. If you don't, any new project-level agents or extensions will trigger a full-screen "Acknowledge and Enable" modal. This modal steals focus, swallows automation keystrokes, and causes `agent-tui wait` commands to time out.
3. **Isolated Environments**: If you need to test without real user credentials or existing agents interfering, isolate the global settings using `GEMINI_CLI_HOME=<some-test-dir>`.
4. **Testing State Deltas (e.g., Reloads)**: If you are testing features that report deltas (e.g., `/agents reload` outputting "1 new local subagent"), you **MUST**:
   - Start the CLI *first* so it establishes its baseline registry.
   - Use a separate shell command (outside of `agent-tui`) to write the new agent `.md`/`.toml` file.
   - Use `agent-tui type` and `press` to trigger the `/agents reload` command inside the running session.
   - (If you add the files before starting the CLI, they become part of the baseline and won't trigger the delta logic).

```bash
# Example: Standard isolated run (sandboxed config + bypass trust modals)
env GEMINI_CLI_TRUST_WORKSPACE=true GEMINI_CLI_HOME=test-gemini-home agent-tui run -d "$(pwd)" node packages/cli/dist/index.js
```

# Terminal Automation Mastery

## Prerequisites

- **Supported OS**: macOS or Linux (Windows not supported yet).
- **Verify install**:

```bash
agent-tui --version
```

If not installed, use one of:

```bash
# Recommended: one-line install (macOS/Linux)
curl -fsSL https://raw.githubusercontent.com/pproenca/agent-tui/master/install.sh | sh
```

```bash
# Package manager
npm i -g agent-tui
pnpm add -g agent-tui
bun add -g agent-tui
```

```bash
# Build from source
cargo install --git https://github.com/pproenca/agent-tui.git --path cli/crates/agent-tui
```

If you used the install script, ensure `~/.local/bin` is on your PATH.

## Philosophy: Why Terminal Automation Is Different

Terminal UIs are **stateless from the observer's perspective**. Unlike web browsers with a persistent DOM, terminal automation works with a constantly-refreshed character grid. This fundamental difference shapes everything:

| Web Automation | Terminal Automation |
|----------------|---------------------|
| DOM persists across interactions | Screen buffer is redrawn constantly |
| Selectors are stable | Text positions may shift |
| Query once, act many times | Must re-verify before EVERY action |
| Network events signal completion | Must detect visual stability |

**The Core Insight**: agent-tui gives you vision without memory. Each screenshot is a fresh observation. Previous state means nothing after the UI changes. This isn't a limitation—it's the nature of terminal interaction.

## Mental Model: The Feedback Loop

Think of terminal automation as a **closed-loop control system**:

```
    ┌──────────────────────────────────────────────┐
    │                                              │
    ▼                                              │
OBSERVE ──► DECIDE ──► ACT ──► WAIT ──► VERIFY ───┘
   │                                        │
   │                                        │
   └─────── NEVER skip ◄────────────────────┘
```

**Each phase is mandatory.** Skipping verification is the #1 cause of flaky automation.

### The "Fresh Eyes" Principle

Every time you need to interact with the UI:

1. **Take a fresh screenshot** — your previous one is now stale
2. **Locate your target visually** — text positions may have changed
3. **Verify the state** — the UI may have changed unexpectedly
4. **Act only when stable** — animations and loading states cause failures

This feels slower, but it's the only reliable approach. Optimistic reuse of stale state causes intermittent failures that are painful to debug.

## Critical Rules (Non-Negotiable)

> **RULE 1: Atomic Execution (No Pipelining)**
> You are FORBIDDEN from chaining commands with `&&` (e.g., `type "x" && press Enter && wait`). Modals or UI updates can intercept your keystrokes. You MUST execute one atomic action, wait, screenshot, and verify before taking the next action in a new turn.

> **RULE 2: Re-snapshot after EVERY action**
> The UI state is invalidated by any change. Always take a fresh screenshot before acting again.

> **RULE 3: Never act on unstable UI**
> If the UI is animating, loading, or transitioning, `wait --stable` first. Acting during transitions because race conditions.

> **RULE 4: Verify before claiming success**
> Use `wait "expected text" --assert` to confirm outcomes. Don't assume an action worked—prove it.

> **RULE 5: Error Recovery**
> If a `wait` command times out, DO NOT blindly restart or kill the session. Execute `screenshot` to visually diagnose what unexpected UI element (modal, error dialog, lost focus) intercepted the flow.

> **RULE 6: Clean up sessions**
> Always end with `agent-tui kill`. Orphaned sessions consume resources and can interfere with future runs.

## Decision Framework

### Which Screenshot Mode?

Use `screenshot --format json` when parsing automation output, or plain `screenshot` for human readable text.

### How to Wait?

```
What are you waiting for?
│
├─► Specific text to appear
│   └─► `wait "text" --assert` (fails if not found)
│
├─► Specific text to disappear
│   └─► `wait "text" --gone --assert`
│
├─► UI to stop changing (animations, loading)
│   └─► `wait --stable`
│
└─► Multiple conditions
    └─► Chain waits sequentially
```

### How to Act?

```
What do you need to do?
│
├─► Type text into the terminal
│   └─► `type "text"`
│
├─► Send keyboard shortcuts/navigation
│   └─► `press Ctrl+C` or `press ArrowDown Enter`
```

## Core Workflow

The canonical automation loop:

```bash
# 1. START: Launch the TUI app
agent-tui run <command> [-- args...]

# 2. OBSERVE: Get current UI state
agent-tui screenshot --format json

# 3. DECIDE: Based on text, determine next action
# (This happens in your head/code)

# 4. ACT: Execute the action
agent-tui type "text"
agent-tui press Enter

# 5. WAIT: Synchronize with UI changes
agent-tui wait "Expected" --assert    # or wait --stable

# 6. VERIFY: Confirm the outcome (often combined with step 5)
# If verification fails, handle the error

# 7. REPEAT: Go back to step 2 until done

# 8. CLEANUP: Always clean up
agent-tui kill
```

## Anti-Patterns (What NOT to Do)

### ❌ Acting During Animation/Loading

```bash
# WRONG: Acting immediately on dynamic UI
agent-tui run my-app
agent-tui screenshot --format json    # UI might still be loading!
agent-tui type "value"                # ❌ Might miss the input field

# RIGHT: Wait for stability first
agent-tui run my-app
agent-tui wait --stable               # Let UI settle
agent-tui screenshot --format json    # Now it's reliable
agent-tui type "value"
```

### ❌ Assuming Success Without Verification

```bash
# WRONG: Assuming the type worked
agent-tui type "value"
agent-tui press Enter
# ...proceed as if success...       # ❌ What if it failed silently?

# RIGHT: Verify the outcome
agent-tui type "value"
agent-tui press Enter
agent-tui wait "Success" --assert    # ✓ Proves the action worked
```

### ❌ Skipping Cleanup

```bash
# WRONG: Forgetting to kill the session
agent-tui run my-app
# ...do stuff...
# script ends                        # ❌ Session left running!

# RIGHT: Always clean up
agent-tui run my-app
# ...do stuff...
agent-tui kill                       # ✓ Clean exit
```

## Before You Start: Clarify Requirements

Before automating any TUI, gather this information:

1. **Command**: What exactly to run? (`my-app --flag` or `npm start`?)
2. **Success criteria**: What text/state indicates success?
3. **Input sequence**: What keystrokes/data to enter, in what order?
4. **Safety**: Is it safe to submit forms, delete data, etc.?
5. **Auth**: Does it need login? Test credentials?
6. **Live preview**: Does the user want to watch? (`agent-tui live start --open`)

If any of these are unclear, ask before running.

## Demo Mode: Showing What agent-tui Can Do

When a user asks what agent-tui is, wants a demo, or asks "show me how it works":

1. **Don't explain—demonstrate.** Actions speak louder than words.
2. **Use the live preview** so they can watch in real-time.
3. **Run `top`**—it's universal and shows dynamic real-time updates.

**Quick demo trigger phrases:**
- "What is agent-tui?" / "What does agent-tui do?"
- "Demo agent-tui" / "Show me agent-tui"
- "How does agent-tui work?" / "See it in action"

## Failure Recovery

| Symptom | Diagnosis | Solution |
|---------|-----------|----------|
| "Text not found" | Stale view or text moved | Re-snapshot, locate text again |
| Wait times out | UI didn't reach expected state | Check screenshot, verify expectations |
| "Daemon not running" | Daemon crashed or not started | `agent-tui daemon start` |
| Unexpected layout | Wrong terminal size | `agent-tui resize --cols 120 --rows 40` |
| Session unresponsive | App crashed or hung | `agent-tui kill`, then re-run |
| Repeated failures | Something fundamentally wrong | Stop after 3-5 attempts, ask user |

## Self-Discovery: Use --help

You don't need to memorize every flag. The CLI is self-documenting:

```bash
agent-tui --help                     # List all commands
agent-tui run --help                 # Options for 'run'
agent-tui screenshot --help          # Options for 'screenshot'
agent-tui wait --help                # Options for 'wait'
```

**When in doubt, ask the CLI.** This skill teaches *when* and *why* to use commands. For exact flags and syntax, `--help` is authoritative.

## Quick Reference

```bash
# Start app
agent-tui run <cmd> [-- args]        # Launch TUI under control

# Observe
agent-tui screenshot                  # Plain text view
agent-tui screenshot --format json    # Machine-readable output

# Act
agent-tui press Enter                 # Press key(s)
agent-tui press Ctrl+C                # Keyboard shortcuts
agent-tui type "text"                 # Type text

# Wait/Verify
agent-tui wait "text" --assert        # Wait for text, fail if not found
agent-tui wait "text" --gone --assert # Wait for text to disappear
agent-tui wait --stable               # Wait for UI to stop changing

# Manage
agent-tui sessions                    # List active sessions
agent-tui live start --open           # Start live preview
agent-tui kill                        # End current session
```
