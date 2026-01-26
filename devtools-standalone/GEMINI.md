# @google/gemini-cli-devtools

A standalone Developer Tools package for debugging Node.js applications,
offering a Chrome DevTools-like interface for Network and Console inspection.

## Features

- **Network Inspector**:
  - Intercepts **HTTP/HTTPS** requests (via monkey-patching `http`/`https`).
  - Intercepts **Undici/Fetch** requests (via `diagnostics_channel`).
  - Supports **Server-Sent Events (SSE)** with visual chunk grouping.
  - Automatically filters noise (e.g., `localhost:8097`, internal tunnels).
  - Groups requests by API path prefix.
- **Console Inspector**:
  - Programmable interface to feed logs (`addConsoleLog`).
  - Real-time updates via SSE.
- **UI**: A modern React + Vite application served by an embedded Node.js HTTP
  server.

## Installation

This package is intended for use within the Gemini CLI monorepo but can be
adapted for other tools.

## Usage

### 1. Start the DevTools Server

```typescript
import { DevTools } from '@google/gemini-cli-devtools';

// Initialize the singleton
const devTools = DevTools.getInstance();

// Enable network interception (http, https, fetch)
devTools.enableGlobalInterception();

// Start the UI server (returns the URL, e.g., http://127.0.0.1:54321)
const url = await devTools.start();
console.log(`DevTools running at ${url}`);
```

### 2. Log Console Messages

DevTools does not automatically capture `console.log`. You must feed logs into
it explicitly.

```typescript
// Example: connecting a logger or event bus to DevTools
myEventBus.on('log', (payload) => {
  // payload: { type: 'info'|'error'|'warn', content: string }
  DevTools.getInstance().addConsoleLog(payload);
});
```

### 3. Stop the Server

```typescript
devTools.stop();
```

## Architecture

- **Backend (`src/index.ts`)**:
  - Singleton class `DevTools`.
  - Manages in-memory log storage (circular buffer).
  - Runs an HTTP server to serve the frontend and API endpoints (`/logs`,
    `/events`).
- **Frontend (`client/`)**:
  - React 18 + Vite application.
  - Connects to backend via `EventSource` (SSE) for real-time updates.
  - Provides "Network" and "Console" tabs.

## API Reference

### `DevTools.getInstance()`

Returns the singleton instance.

### `enableGlobalInterception()`

Patches `http.request`, `https.request` and subscribes to
`undici:request:create` channels to capture all outgoing network traffic.

### `start(): Promise<string>`

Starts the embedded HTTP server on a random available port. Returns the full
URL.

### `addConsoleLog(payload: ConsoleLogPayload)`

Adds a log entry to the Console tab.

- `payload.type`: `'log' | 'warn' | 'error' | 'debug' | 'info'`
- `payload.content`: String message.

## Development

### Build

```bash
# Build both frontend and backend
npm run build -w @google/gemini-cli-devtools
```

### Run Frontend in Dev Mode

1.  Start a backend process (e.g., via the CLI in debug mode) to serve the API.
2.  Run the frontend with Vite for hot-reloading:
    ```bash
    cd packages/devtools
    npm run build:client -- --watch
    ```
