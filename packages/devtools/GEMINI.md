# Gemini CLI DevTools

Integrated Developer Tools for Gemini CLI, providing a Chrome DevTools-like
interface for Network and Console inspection. Launched automatically when the
`general.devtools` setting is enabled.

## Features

- **Network Inspector**: Real-time request/response logging with streaming
  chunks and duration tracking
- **Console Inspector**: Real-time console log viewing
  (log/warn/error/debug/info)
- **Session Management**: Multiple CLI session support with live connection
  status
- **Import/Export**: Import JSONL log files, export current session logs

## How It Works

When `general.devtools` is enabled, the CLI's `devtoolsService` automatically:

1. Probes port 25417 for an existing DevTools instance
2. If found, connects as a WebSocket client
3. If not, starts a new DevTools server and connects to it
4. If another instance races for the port, the loser connects to the winner

No environment variables needed for normal use.

## Architecture

```
gemini.tsx / nonInteractiveCli.ts
         │  (dynamic import)
         ▼
  devtoolsService.ts          ← orchestration + DevTools lifecycle
         │  (imports)
         ▼
  activityLogger.ts           ← pure logging (capture, file, WebSocket transport)
         │  (events)
         ▼
  DevTools server (:25417)    ← this package (HTTP + WebSocket + SSE)
         │  (SSE /events)
         ▼
  DevTools UI (React)         ← client/ compiled by esbuild
```

## Environment Variables

| Variable                         | Description                                   |
| -------------------------------- | --------------------------------------------- |
| `GEMINI_CLI_ACTIVITY_LOG_TARGET` | File path for JSONL mode (optional, fallback) |

## API Endpoints

| Endpoint  | Method    | Description                                                                 |
| --------- | --------- | --------------------------------------------------------------------------- |
| `/ws`     | WebSocket | Log ingestion from CLI sessions (register, network, console)                |
| `/events` | SSE       | Pushes snapshot on connect, then incremental network/console/session events |

## Development

```bash
# Build everything (client + server)
npm run build

# Rebuild client only after UI changes
npm run build:client
```

### Project Structure

```
packages/devtools/
├── src/
│   └── index.ts           # DevTools server (HTTP, WebSocket, SSE)
├── client/
│   ├── index.html
│   └── src/
│       ├── main.tsx        # React entry
│       ├── App.tsx         # DevTools UI
│       └── hooks.ts        # Data fetching hooks
├── esbuild.client.js       # Client build script
└── dist/                   # Build output
    ├── src/index.js        # Compiled server
    └── client/             # Bundled client assets
```
