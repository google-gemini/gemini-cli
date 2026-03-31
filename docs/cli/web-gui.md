# Web GUI

The `/web` command launches a browser-based chat interface for Gemini CLI,
served locally on port 11267. It provides the same AI assistant capabilities as
the terminal UI in a visual dashboard built with Material You design.

## Getting started

Start the web GUI from the Gemini CLI prompt:

```
/web
```

This opens `http://localhost:11267` in your default browser. The web server runs
alongside the CLI session and shares the same authentication and configuration.

## Subcommands

| Command       | Description                                  |
| ------------- | -------------------------------------------- |
| `/web`        | Start the server and open the browser        |
| `/web start`  | Start the server without opening the browser |
| `/web stop`   | Stop the running web server                  |
| `/web status` | Show whether the server is running           |

## Features

### Chat with streaming

Send messages and receive streamed responses from the configured Gemini model.
The interface supports markdown rendering, syntax-highlighted code blocks, and a
copy button on each block.

### Model selection

Click the model chip in the input toolbar to switch between available models.
The model list is loaded from your CLI configuration and grouped by tier (Pro,
Flash, Flash Lite). Preview models are only shown if your account has access.

### File mentions

Type `@` in the input field to search project files by name. Selected files are
read and included as context with your message, similar to the CLI's `@`-mention
feature.

### File creation

When you ask the model to create a file, it outputs a special code block that
renders as an approval card. You can review the content and choose:

- **Approve** — write the file to disk immediately
- **Approve for session** — write and auto-approve future writes to the same
  path
- **Decline** — reject the write

Files are written relative to the working directory. The status bar shows a
count of files written during the session.

### Slash commands

Type `/` in the input field to access commands:

| Command   | Action                                       |
| --------- | -------------------------------------------- |
| `/model`  | Open the model picker                        |
| `/clear`  | Clear chat history                           |
| `/stats`  | Show session statistics (model, auth, quota) |
| `/tools`  | List registered tools                        |
| `/memory` | View GEMINI.md memory                        |
| `/about`  | Show version and environment info            |
| `/theme`  | Change the visual theme                      |
| `/help`   | Show available commands                      |

### Sessions

Chat sessions are saved to browser local storage. The sidebar lists recent
sessions with search and two view modes:

- **List view** — flat chronological list
- **Tree view** — sessions grouped by working directory

Click the `+` button to open the directory picker and start a new session in a
different workspace.

### Themes

Four built-in themes are available via `/theme`:

- **Dark** (default) — Material You dark surface
- **Light** — Material You light surface
- **Ocean** — deep blue palette
- **Forest** — green palette

### Context tracking

The context chip in the status bar shows current token usage as a percentage of
the model's context window. Click it to see a breakdown of input tokens
(regular, cache read, cache write) and output tokens.

### Responsive design

The interface adapts to screen size:

- **Desktop** (> 1024px) — sidebar + main content side by side
- **Tablet** (768–1024px) — narrower sidebar
- **Mobile** (< 768px) — sidebar as overlay drawer, model picker as bottom
  sheet, safe-area support for notch devices

## Architecture

The web GUI is packaged as `@google/gemini-cli-webui` and consists of:

| Module      | Role                                                                 |
| ----------- | -------------------------------------------------------------------- |
| `server.ts` | HTTP server, HTML template, route dispatch                           |
| `api.ts`    | API handlers: chat streaming, command proxy, file operations, models |
| `client.ts` | Browser-side JavaScript (ES5-compatible)                             |
| `styles.ts` | CSS (Material You tokens, responsive breakpoints, theme variants)    |
| `icons.ts`  | SVG icon helpers                                                     |

The `/web` slash command in `packages/cli` is a thin bridge that wires the
server lifecycle into the CLI's `SlashCommand` interface.

### API endpoints

| Method | Path                | Description                              |
| ------ | ------------------- | ---------------------------------------- |
| `POST` | `/api/chat`         | SSE-streamed chat via `ContentGenerator` |
| `POST` | `/api/command`      | Proxy for slash commands                 |
| `POST` | `/api/files/search` | Fuzzy file search for `@` mentions       |
| `POST` | `/api/files/read`   | Read file content                        |
| `POST` | `/api/files/write`  | Write file (used by approval flow)       |
| `GET`  | `/api/models`       | List available models                    |

### Authentication

The web GUI reuses the CLI's `ContentGenerator` abstraction, which supports all
authentication types: Google OAuth (`LOGIN_WITH_GOOGLE`), API key
(`USE_GEMINI`), Vertex AI, Application Default Credentials, and Gateway. No
separate authentication is needed.

### Security

- File read and write operations are restricted to paths within the working
  directory (path traversal prevention).
- The server binds to `localhost` only — it is not accessible from other
  machines on the network.
- CORS is restricted to `http://localhost:11267`.

## Limitations

- The web GUI cannot execute shell commands. When you ask for a command to run,
  the model provides it as a copyable code block.
- Tool use (beyond file read/write) is not available in web mode. The model
  operates in a text-only conversation mode.
- Sessions are stored in browser local storage, not synced with CLI sessions.
