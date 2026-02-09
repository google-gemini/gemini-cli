# Gemini A2A Agent on Cloud Run — Design Document

## Overview

Deploy the gemini-cli A2A server as a Cloud Run service, giving Backstage (or any
authenticated client) access to a Gemini-powered coding agent over HTTP. The
container includes full Google Cloud Shell tooling, the GitHub CLI, and two
gemini-cli extensions: `ai-plugin-translator` and `captain-hook`.

No existing files in the gemini-cli repo are modified. All new files live under
`deploy/cloudrun/`.

## Architecture

```
┌─────────────┐      Identity Token       ┌──────────────────────┐
│  Backstage   │ ───────────────────────► │   Cloud Run (IAM)    │
│  Backend     │ ◄─────── SSE stream ──── │                      │
└─────────────┘                           │  ┌────────────────┐  │
                                          │  │ socat proxy    │  │
                                          │  │ 0.0.0.0:$PORT  │  │
                                          │  │   ↓            │  │
                                          │  │ localhost:8081  │  │
                                          │  ├────────────────┤  │
                                          │  │ A2A Server     │  │
                                          │  │ (Express)      │  │
                                          │  ├────────────────┤  │
                                          │  │ gemini-cli     │  │
                                          │  │ core + tools   │  │
                                          │  └───────┬────────┘  │
                                          └──────────┼───────────┘
                                                     │ Workload Identity
                                                     ▼
                                          ┌──────────────────────┐
                                          │  Vertex AI (Gemini)  │
                                          └──────────────────────┘
```

### Authentication Layers

| Hop                      | Method                                      |
|--------------------------|---------------------------------------------|
| Backstage → Cloud Run    | Cloud Run IAM (`roles/run.invoker`)          |
| Cloud Run → Vertex AI    | Workload Identity (`aiplatform.user`)        |

Cloud Run is deployed with `--no-allow-unauthenticated`. Callers must present a
valid identity token in the `Authorization: Bearer <token>` header. No
application-level auth code is needed.

### The socat Proxy

The A2A server binds to `localhost` (hardcoded in
`packages/a2a-server/src/http/app.ts:331`). Cloud Run requires the container to
listen on `0.0.0.0:$PORT`. Rather than modifying the upstream source, the
entrypoint starts the A2A server on `localhost:8081` and runs socat to forward:

```
socat TCP-LISTEN:${PORT},fork,reuseaddr,bind=0.0.0.0 TCP:localhost:8081
```

socat ships with the Cloud Shell base image.

## Container Image

### Multi-stage Dockerfile

| Stage | Base Image | Purpose |
|-------|-----------|---------|
| 1. `builder` | `node:20` | Build gemini-cli monorepo, produce tarballs |
| 2. `captain-hook-builder` | `rust:latest` | Compile captain-hook from source |
| 3. `translator-builder` | `node:20` | Build ai-plugin-translator with pnpm |
| 4. `runtime` | `gcr.io/cloudshell-images/cloudshell:latest` | Final image with all tools |

### What's in the final image

- **Cloud Shell tools**: gcloud, gsutil, bq, kubectl, terraform, docker, git,
  python3, and everything else in the Cloud Shell image
- **GitHub CLI**: `gh` (installed if not already present in Cloud Shell)
- **gemini-cli**: core, cli, and a2a-server packages installed globally via npm
- **Extensions**:
  - `ai-plugin-translator` — translates Claude Code plugins to Gemini CLI extensions
  - `captain-hook` — intelligent permission gating (Rust binary + translated extension)
- **socat**: TCP proxy (included in Cloud Shell)

### Extensions layout

```
~/.gemini/extensions/
├── ai-plugin-translator/    # Full built package with gemini-extension.json
└── captain-hook/            # Binary + plugin manifest
```

## Runtime Configuration

### Environment Variables

| Variable | Value | Source |
|----------|-------|--------|
| `PORT` | `8080` | Set by Cloud Run |
| `CODER_AGENT_PORT` | `8081` | Set in entrypoint.sh |
| `USE_CCPA` | `true` | Set in entrypoint.sh |
| `GOOGLE_CLOUD_PROJECT` | Project ID | Set at deploy time or from metadata |
| `GEMINI_FOLDER_TRUST` | `true` | Headless — no trust prompt |
| `GEMINI_YOLO_MODE` | `true` | Auto-execute tools (no human confirmation) |
| `GCS_BUCKET_NAME` | Optional | For task persistence across restarts |
| `CODER_AGENT_WORKSPACE_PATH` | `/workspace` | Agent working directory |

### Settings file (`~/.gemini/settings.json`)

Minimal config — extensions are discovered from `~/.gemini/extensions/`.
Checkpointing is disabled (no persistent git state in ephemeral containers).

## Deployment

### Prerequisites

1. A GCP project with Vertex AI API enabled
2. A service account for the Cloud Run service with:
   - `roles/aiplatform.user` (Gemini via Vertex AI)
   - `roles/storage.objectAdmin` (optional, for GCS task persistence)
3. A service account for Backstage with:
   - `roles/run.invoker` on the Cloud Run service

### Build and deploy

```bash
# Build from repo root
gcloud builds submit \
  --tag gcr.io/$PROJECT_ID/gemini-a2a \
  --timeout=1800

# Deploy
gcloud run deploy gemini-a2a \
  --image gcr.io/$PROJECT_ID/gemini-a2a \
  --no-allow-unauthenticated \
  --service-account=gemini-a2a@$PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300 \
  --max-instances=10 \
  --region=us-central1
```

Optional: enable GCS persistence:
```bash
--set-env-vars="GCS_BUCKET_NAME=my-gemini-tasks-bucket"
```

## Backstage Integration

### Connection Pattern

Backstage connects to the Cloud Run A2A service through a backend plugin (or
backend module) that handles identity token management and request proxying.

```
┌──────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│ Backstage        │     │ Backstage            │     │ Cloud Run       │
│ Frontend         │     │ Backend              │     │ A2A Service     │
│                  │     │                      │     │                 │
│ Chat UI ─────────┼────►│ /api/gemini-agent/*  │────►│ /message/stream │
│ Command Input ───┼────►│ (proxy + auth)       │────►│ /executeCommand │
│ ◄── SSE stream ──┼─────┤ ◄── SSE stream ─────┼─────┤                 │
└──────────────────┘     └──────────────────────┘     └─────────────────┘
```

### Obtaining Identity Tokens

The Backstage backend must present a valid Google Cloud identity token when
calling Cloud Run. In a GKE or Cloud Run environment with Workload Identity:

```
GET http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=<CLOUD_RUN_URL>
Host: metadata.google.internal
Metadata-Flavor: Google
```

Or using `google-auth-library` in Node.js:

```javascript
const { GoogleAuth } = require('google-auth-library');
const auth = new GoogleAuth();
const client = await auth.getIdTokenClient(CLOUD_RUN_URL);
const headers = await client.getRequestHeaders();
// headers['Authorization'] = 'Bearer <identity-token>'
```

Tokens are valid for ~1 hour. The library handles refresh automatically.

### A2A Protocol Endpoints

The A2A server exposes these endpoints. All requests from Backstage should
include `Authorization: Bearer <identity-token>`.

#### Create a task

```
POST /tasks
Content-Type: application/json

{
  "agentSettings": {
    "workspacePath": "/workspace",
    "autoExecute": true
  },
  "contextId": "optional-session-id"
}

Response: 201
{ "taskId": "uuid" }
```

A task represents a conversation session. Create one per user session or per
Backstage action.

#### Send a message (streaming)

```
POST /message/stream
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "message/stream",
  "params": {
    "message": {
      "role": "user",
      "parts": [{ "text": "Create a Cloud Storage bucket named test-bucket" }]
    },
    "configuration": {
      "acceptedOutputModes": ["text"]
    }
  }
}

Response: text/event-stream (SSE)
```

The SSE stream emits `TaskStatusUpdateEvent` objects:

```
data: {"type":"status","taskId":"...","status":{"state":"working"},...}
data: {"type":"status","taskId":"...","status":{"state":"working","message":{"parts":[{"text":"Creating bucket..."}]}},...}
data: {"type":"status","taskId":"...","status":{"state":"input-required"},"final":true}
```

Key states:
- `working` — Agent is processing. `message.parts[].text` contains streamed output.
- `input-required` (final=true) — Agent turn complete, waiting for next user message.
- `completed` (final=true) — Task finished.
- `failed` (final=true) — Error occurred.

#### Execute a command

```
POST /executeCommand
Content-Type: application/json

{ "command": "memory", "args": ["show"] }

Response: 200 (JSON) or text/event-stream (SSE, for streaming commands)
```

#### List available commands

```
GET /listCommands

Response: 200
{ "commands": [{ "name": "...", "description": "...", "args": [...] }] }
```

#### Get task metadata

```
GET /tasks/:taskId/metadata

Response: 200
{ "metadata": { "availableTools": [...], "mcpServerStatuses": {...} } }
```

#### Cancel a task

Standard A2A task cancellation via the protocol.

### Chat Console Integration

To build a chat console in Backstage:

**Data flow:**

1. User opens the Gemini Agent page in Backstage
2. Frontend calls backend `POST /api/gemini-agent/tasks` to create a session
3. User types a message
4. Frontend calls backend `POST /api/gemini-agent/tasks/:taskId/message`
5. Backend proxies to Cloud Run, pipes the SSE stream back
6. Frontend consumes the SSE stream, rendering text chunks as they arrive
7. When `state: "input-required"` with `final: true` arrives, the input is re-enabled
8. Repeat from step 3

**What the frontend needs to handle:**

| SSE Event State | UI Behavior |
|-----------------|-------------|
| `working` + text parts | Append text to chat, show typing indicator |
| `working` + tool-call-confirmation | Show tool name and args (informational in yolo mode) |
| `working` + tool-call-update | Show tool execution progress |
| `input-required` (final) | Re-enable input, agent turn complete |
| `completed` (final) | Show completion state, disable input |
| `failed` (final) | Show error message |

**Rendering:** The agent returns markdown-formatted text. Use a markdown
renderer in the frontend (e.g., `react-markdown` or Backstage's built-in
`MarkdownContent` component).

**Multiple concurrent users:** Each user gets their own task (session). Tasks
are isolated. With GCS persistence enabled, tasks survive container restarts.
Cloud Run auto-scales instances as needed.

### Command Execution Integration

For a simpler "run a command" UX (no chat):

1. Call `GET /api/gemini-agent/commands` to list available commands
2. Present a command picker or text input
3. Call `POST /api/gemini-agent/commands/execute` with command and args
4. Stream the response (same SSE handling as chat)

This is useful for Backstage scaffolder templates or entity actions that trigger
specific gemini-cli commands (e.g., "initialize GEMINI.md", "show memory").

### Backstage app-config.yaml

```yaml
geminiAgent:
  # Cloud Run service URL (from gcloud run deploy output)
  cloudRunUrl: https://gemini-a2a-xxxxx-uc.a.run.app

  # Optional: explicit service account email for token generation.
  # If omitted, uses the default service account (Workload Identity).
  serviceAccountEmail: gemini-invoker@my-project.iam.gserviceaccount.com

  # Optional: default workspace path inside the container
  workspacePath: /workspace
```

## File Inventory

```
deploy/cloudrun/
├── DESIGN.md           # This document
├── Dockerfile          # Multi-stage build
├── entrypoint.sh       # socat proxy + env setup
└── settings.json       # Gemini CLI settings
```

No existing files in the repository are modified or moved.
