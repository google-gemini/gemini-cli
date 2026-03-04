# Forever Bridge — Google Chat via Pub/Sub

Zero-dependency Node.js service that runs Gemini CLI in forever mode on a GCE
VM, receiving Google Chat messages via Cloud Pub/Sub and responding via Chat
REST API.

**No `npm install` needed.** Auth uses the GCE metadata server; Pub/Sub and Chat
use raw REST APIs. Just `node main.mjs`.

## Architecture

```
Google Chat Space
    ↓ Pub/Sub topic
Cloud Pub/Sub (pull)
    ↓
main.mjs (poll loop)
    ├── process-manager.mjs → npx gemini-cli --forever -r -y -m gemini-3-flash-preview
    │                           └── A2A JSON-RPC on localhost:3100
    └── Chat REST API → Google Chat Space (response)
```

## Files

| File                  | Purpose                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `main.mjs`            | Pub/Sub poller, Chat API client, A2A forwarder, health check, entrypoint |
| `process-manager.mjs` | Spawns/restarts Gemini CLI with exponential backoff                      |

## Usage

```bash
# On a GCE VM with appropriate service account:
export GOOGLE_API_KEY="your-gemini-api-key"
export PUBSUB_SUBSCRIPTION="projects/my-project/subscriptions/chat-sub"

node main.mjs
```

## Environment Variables

| Variable              | Required | Default                  | Description                       |
| --------------------- | -------- | ------------------------ | --------------------------------- |
| `GOOGLE_API_KEY`      | Yes      | —                        | Gemini API key                    |
| `PUBSUB_SUBSCRIPTION` | Yes      | —                        | `projects/PROJ/subscriptions/SUB` |
| `A2A_PORT`            | No       | `3100`                   | Agent A2A port                    |
| `GEMINI_MODEL`        | No       | `gemini-3-flash-preview` | Model                             |
| `HEALTH_PORT`         | No       | `8081`                   | Health check port                 |
| `POLL_INTERVAL_MS`    | No       | `1000`                   | Pub/Sub poll interval             |

## GCP Prerequisites

1. Chat API + Pub/Sub API enabled
2. Service account with `Pub/Sub Subscriber` + `Chat Bot` roles
3. Google Chat app configured with **Cloud Pub/Sub** connection type
4. Pub/Sub subscription created for the Chat topic
