# `gemini gemma` — Local Model Routing Setup

## What is this?

Routes simple requests to Flash and complex requests to Pro using a local Gemma
3 1B model running on your machine. Saves cloud API costs and adds a few ms of
local inference instead of a cloud classifier round-trip.

## Quick Start

```bash
# One command does everything: downloads runtime, pulls model, configures settings, starts server
gemini gemma setup
```

You'll be prompted to accept the Gemma Terms of Use. The model is ~1 GB.

After setup, **just use the CLI normally** — routing happens automatically on
every request.

## Commands

| Command               | What it does                                                   |
| --------------------- | -------------------------------------------------------------- |
| `gemini gemma setup`  | Full install (binary + model + settings + server start)        |
| `gemini gemma status` | Health check — shows what's installed and running              |
| `gemini gemma start`  | Start the LiteRT server (auto-starts on CLI launch by default) |
| `gemini gemma stop`   | Stop the LiteRT server                                         |
| `gemini gemma logs`   | Tail the server logs to see routing requests live              |
| `/gemma`              | In-session status check (type it inside the CLI)               |

## Verifying it works

1. Run `gemini gemma status` — all checks should show green
2. Open two terminals:
   - Terminal 1: `gemini gemma logs` (watch for incoming requests)
   - Terminal 2: use the CLI normally
3. You should see classification requests appear in the logs as you interact
   with the CLI
4. The `/gemma` slash command inside a session shows a quick status panel

## Setup flags

```bash
gemini gemma setup --port 8080      # custom port
gemini gemma setup --no-start       # don't start server after install
gemini gemma setup --force           # re-download everything
gemini gemma setup --skip-model     # binary only, skip the 1GB model download
```

## How it works under the hood

- Local Gemma classifies each request as "simple" or "complex" (~100ms)
- Simple → Flash, Complex → Pro
- If the local server is down, the CLI silently falls back to the cloud
  classifier — no errors, no disruption

## Disabling

Set `enabled: false` in settings or just run `gemini gemma stop` to turn off the
server:

```json
{ "experimental": { "gemmaModelRouter": { "enabled": false } } }
```
