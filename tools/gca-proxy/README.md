# GCA Proxy

An interactive proxy for debugging Gemini Code Assist (GCA) API traffic.
Intercept, inspect, and modify responses in real-time.

## Features

- **Passthrough Proxy**: Forward all traffic to real GCA
- **HTTPS Support**: Self-signed certificate for local dev
- **SSE Streaming**: Collect chunks, edit, replay
- **Endpoint Toggles**: Check/uncheck which endpoints to intercept
- **Real-time UI**: WebSocket-powered request queue and response editor

## Quick Start

```bash
cd tools/gca-proxy
npm install
npm run build:client
npm start
```

Open https://localhost:3001 in your browser.

## Using with Gemini CLI

```bash
export UPSTREAM_GCA_ENDPOINT=https://cloudcode-pa.googleapis.com  # or corp endpoint
export CODE_ASSIST_ENDPOINT=https://localhost:3001
export NODE_TLS_REJECT_UNAUTHORIZED=0

node bundle/gemini.js prompt "Hello"
```

## UI Overview

| Panel      | Description                                                    |
| ---------- | -------------------------------------------------------------- |
| **Left**   | Endpoint toggle checkboxes - enable/disable interception       |
| **Center** | Pending request queue - click to select                        |
| **Right**  | Response editor - modify JSON, set status code, click Continue |

## Development

```bash
# Terminal 1: Start server
npm start

# Terminal 2: Client dev server (hot reload)
npm run dev:client
```

## Environment Variables

| Variable                | Description                   | Default                               |
| ----------------------- | ----------------------------- | ------------------------------------- |
| `PORT`                  | Proxy server port             | `3001`                                |
| `UPSTREAM_GCA_ENDPOINT` | Real GCA endpoint to proxy to | `https://cloudcode-pa.googleapis.com` |
