---
name: debug-cli
description: Instructions for running and debugging the Gemini CLI locally from source. Use this when asked to diagnose issues or run the gemini cli application.
---

# Debug CLI

This skill provides instructions for the agent to run the Gemini CLI locally built from source to diagnose issues. **Always reproduce the issue interactively first** — before analyzing source code, running unit tests, or attempting fixes.

## Workflow

### 1. Understand the Issue

- **Gather Context:** Fetch and read the GitHub issue description (if applicable) or the user's report. Identify the delta between expected and observed behavior.
- **Consult Documentation:** Use the `cli_help` subagent to clarify intended CLI behavior, command usage, or configuration schemas. For example: `@cli_help "how does proxy configuration work?"`.
- **Deep Dive:** If the documentation isn't enough, use the `codebase_investigator` subagent to analyze the underlying logic, identify relevant files, and map dependencies related to the issue.
- **Live Exploration:** Depending on the exact problem you're debugging, you might have to play with the `/settings` command or other application commands in a live session.
- **Smart Agent Advantage:** Since the Gemini CLI is a smart agent, you can always ask the CLI itself for help figuring out how it works or how to use a specific feature!

### 2. Build from Source

Always start by cleaning, building, and bundling the source code to ensure you are running the latest version:

```bash
npm run clean && npm run build && npm run bundle
```

The application can then be started via `./bundle/gemini.js`.

### 3. Setup Test Directory

Before running the CLI, create a temporary test directory and configure it with the appropriate files. This ensures the CLI runs with the correct settings for the feature being tested.

```bash
mkdir -p /path/to/test-dir/.gemini
```

Create a `.gemini/settings.json` in that directory with any settings needed for the test. For example, to allowlist domains for the browser agent:

```json
{
  "agents": {
    "browser": {
      "allowedDomains": ["*.example.com", "example.com"]
    }
  }
}
```

You may also need `.gemini/keybindings.json`, `GEMINI.md`, and any test project files depending on what you're testing.

### 4. Launch with tmux

Always run the Gemini CLI application using `tmux`. This is essential because the application is a complex TUI (Terminal User Interface). `tmux` commands make it easy to read the screen state, send programmatic inputs, and interact with the TUI in a robust way.

Launch the CLI from within the test directory so it picks up the local settings:

```bash
cd /path/to/test-dir
/absolute/path/to/bundle/gemini.js [flags]
```

### 5. Interact and Reproduce

Use `tmux send-keys` to send text and keypresses, and `tmux capture-pane` to read the screen.

#### Submitting Prompts (Paste-Injection Protection)

The CLI has paste-injection protection. You **must** split text entry and the Enter keypress into separate steps:

1. **Send the prompt text** (without pressing Enter).
2. **Wait briefly** (~1 second) to let the CLI process the pasted text.
3. **Send only the Enter key** to submit.

Sending text and Enter together in one command will be rejected by the paste-injection guard.

#### Authentication

If the app presents an authentication screen:
- Select the option to authenticate with a **Gemini API key**.
- The key should be prepopulated automatically. Otherwise if a `.env` file is available copy it inside the test directory.

### 6. Document Results

- Record observed vs. expected behavior.
- Note any error messages or visual glitches.

### 7. Fix and Verify (if applicable)

- Only after confirming the repro, investigate source code and implement a fix.
- Rebuild (`npm run build && npm run bundle`), re-launch, and verify through the interactive flow (Steps 4–5).

### 8. Cleanup

- Kill remaining background processes (tmux sessions, etc.).
- Remove the tmp test directory if no longer needed.
