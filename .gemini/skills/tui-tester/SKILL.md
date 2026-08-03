---
name: tui-tester
description: >
  Build, launch, and interactively test the Gemini CLI end-to-end in a real
  terminal using agent-tui automation. Use when you need to verify TUI behavior,
  rendering, slash commands, dialogs, keybindings, or a live model turn against
  either the published ("downloaded") Gemini CLI or a local build. Self-contained:
  no separate agent-tui skill and no subagent are required. If you want this run
  in isolation, delegate this skill to a subagent.
---

# Gemini CLI TUI Tester

Drive the Gemini CLI in a real PTY with [`agent-tui`](https://github.com/pproenca/agent-tui)
so you can build and test it interactively without a human at the keyboard. This
skill is self-contained — everything you need is below.

## What you can test

- Startup, auth flow, and first-run dialogs
- TUI rendering at a given terminal size
- Slash commands (`/help`, `/model`, `/agents`, ...), dialogs, keybindings
- A full live model turn (send a prompt, verify the response)
- Regressions between the **downloaded** CLI and your **local build**

## 0. Prerequisite: install agent-tui (once)

```bash
agent-tui --version || npm i -g agent-tui
```

On **Linux** the background daemon auto-starts on first use — no workaround
needed. On **macOS**, if you hit `Connection refused (os error 61)`, start the
daemon inside tmux once:

```bash
tmux new-session -d -s agent-tui 'agent-tui daemon start --foreground > /tmp/agent-tui-daemon.log 2>&1'
```

## 1. The loop (non-negotiable)

`agent-tui` gives you vision without memory: every screenshot is a fresh
observation. **One action per turn**, then re-observe:

```
OBSERVE (screenshot) -> DECIDE -> ACT (type/press) -> WAIT -> VERIFY -> repeat
```

- Never chain actions with `&&` (a modal can swallow your keystrokes).
- Always `wait ... --assert` to prove an outcome before moving on.
- Target a session with `--session <id>`; the id comes from `run` (use the
  `session_id`, **never** the `pid`).

## 2. Choose what to run

**Local build** (testing your code changes) — build first, then run the dist entry:

```bash
npm run build            # or: npm run build:all  (agent-tui runs JS, not TS)
# entry point:  packages/cli/dist/index.js
```

**Downloaded CLI** (the published baseline):

```bash
npm i -g @google/gemini-cli   # provides `gemini` on PATH
```

## 3. Launch under agent-tui

Use `agent-tui run` flags directly — `--env`, `--cwd`, `--cols`, `--rows`
(don't wrap with a bare `env`; pass `--env` so vars reach the child):

```bash
# Local build (isolated config home, trust bypassed, API key for a live turn)
agent-tui run --cols 120 --rows 35 --cwd "$(pwd)" \
  --env GEMINI_CLI_TRUST_WORKSPACE=true \
  --env GEMINI_CLI_HOME=/tmp/tui-test-home \
  --env GEMINI_API_KEY=<key> \
  --json node packages/cli/dist/index.js

# Downloaded CLI: swap the command for  gemini
```

Required env for deterministic runs:

- `GEMINI_CLI_TRUST_WORKSPACE=true` — suppresses the full-screen trust modal that
  steals focus and makes `wait` time out.
- `GEMINI_CLI_HOME=<dir>` — isolates config/history from your real `~/.gemini`.
  Use a **fresh** dir to test the first-run auth flow; **reuse** it to skip auth
  on subsequent launches (the selected auth type is cached there).
- `GEMINI_API_KEY=<key>` — enables real model turns without touching your creds.

## 4. Auth flow (fresh isolated home)

When `GEMINI_API_KEY` is set, the CLI pre-selects "Use Gemini API Key" and
pre-fills the key. It takes two Enters:

```bash
agent-tui wait "Use Gemini API Key" --assert    # auth menu
agent-tui press Enter                            # 1) select API key
agent-tui wait "Enter Gemini API Key" --assert   # key pre-filled
agent-tui press Enter                            # 2) submit
agent-tui wait "Type your message" --assert      # main prompt reached
```

## 5. Reading the screen

Screenshots contain the **child app's** ANSI/truecolor codes (agent-tui's
`--no-color` only affects agent-tui's own chrome, not Gemini's output). Two
options:

- To **verify** text, let agent-tui match it — `wait` strips ANSI internally:
  ```bash
  agent-tui wait "expected text" --assert
  ```
- To **eyeball** a screenshot, strip ANSI yourself:
  ```bash
  agent-tui screenshot --session <id> | sed 's/\x1b\[[0-9;:]*[a-zA-Z]//g'
  ```

## 6. Run a turn and verify

```bash
agent-tui type "Reply with exactly one word: PONG"
agent-tui press Enter
agent-tui wait "Thinking" --gone --assert --timeout 30000   # wait for completion
agent-tui screenshot | sed 's/\x1b\[[0-9;:]*[a-zA-Z]//g'    # read the response
```

> **False-positive gotcha:** don't `wait` for a word that also appears in your
> own prompt — your echoed input matches instantly (0ms) while the model is still
> thinking. Wait for `Thinking --gone`, or for a distinctive marker in the
> response, not for text you typed.

**Slash commands:** type the command, then a single `Enter` executes it even with
the autocomplete dropdown showing (e.g. `/help` renders the shortcuts dialog).
Verify against the *actual* on-screen header (e.g. `Keyboard Shortcuts:`), not a
guessed one.

## 7. Cleanup

```bash
agent-tui sessions            # list what's running
agent-tui kill --session <id> --yes   # --yes is required (kill needs confirmation)
```

## Testing reload/delta features

For features that report deltas (e.g. `/agents reload` printing "1 new local
subagent"): start the CLI **first** to establish the baseline, then write the new
`.md`/`.toml` file from a separate shell, then trigger the reload command inside
the running session. Files present before launch become part of the baseline and
won't trigger delta logic.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `wait` times out | Screenshot (strip ANSI) to see the real state; fix your wait string or an unexpected modal |
| `Connection refused (os error 61)` (macOS) | Start daemon in tmux (see §0), then start a **new** session |
| Full-screen trust modal steals input | Relaunch with `GEMINI_CLI_TRUST_WORKSPACE=true` |
| Testing local TS changes but nothing changed | You forgot `npm run build` — agent-tui runs the built JS |
| `kill` errors asking for confirmation | Add `--yes` |
| Wrong layout / wrapping | Relaunch with explicit `--cols`/`--rows`, or `agent-tui resize` |

## Self-discovery

`agent-tui --help`, `agent-tui run --help`, `agent-tui wait --help` are
authoritative for exact flags.
