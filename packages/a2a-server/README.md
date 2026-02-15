# Gemini CLI A2A Server

> **Experimental** - This package is under active development.

An [A2A (Agent-to-Agent)](https://google.github.io/A2A/) server that wraps the
Gemini CLI agent, enabling remote interaction via the A2A protocol. Includes a
Google Chat bridge for using the agent directly from Google Chat.

## Architecture

```
Google Chat  ──webhook──>  Chat Bridge  ──A2A──>  A2A Server  ──>  Gemini CLI Agent
                               │
                               └── Chat REST API (push responses back to Chat)
```

The server runs as a single Cloud Run container with two logical components:

1. **A2A Server** - Standard A2A protocol endpoint (JSON-RPC + SSE streaming)
   that wraps the Gemini CLI agent
2. **Chat Bridge** - Translates between Google Chat webhook events and A2A
   protocol, pushing streamed results back via the Chat REST API

The Chat Bridge responds immediately to webhooks with "Processing..." (avoiding
Google Chat's 30s timeout), then streams results from the A2A agent and pushes
them to Chat as they arrive.

## Prerequisites

- **GCP project** with the following APIs enabled:
  - Cloud Run API
  - Cloud Build API
  - Artifact Registry API
  - Google Chat API
  - Cloud Storage API (for session persistence)
- **gcloud CLI** authenticated with your project
- **Node.js 20+** for local development
- **Gemini API key** from [Google AI Studio](https://aistudio.google.com/)

## Environment Variables

| Variable                     | Required | Description                                                                                          |
| ---------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`             | Yes      | Gemini API key for the agent                                                                         |
| `CODER_AGENT_PORT`           | No       | Server port (default: `8080`)                                                                        |
| `CODER_AGENT_HOST`           | No       | Bind host (default: `localhost`, set `0.0.0.0` for containers)                                       |
| `CODER_AGENT_WORKSPACE_PATH` | No       | Agent workspace directory (default: `/workspace`)                                                    |
| `GCS_BUCKET_NAME`            | No       | GCS bucket for task & session persistence                                                            |
| `GEMINI_YOLO_MODE`           | No       | Set `true` to auto-approve all tool calls                                                            |
| `CHAT_BRIDGE_A2A_URL`        | No       | A2A server URL for the Chat bridge (e.g. `http://localhost:8080`). Presence enables the Chat bridge. |
| `CHAT_PROJECT_NUMBER`        | No       | Google Chat project number for JWT verification                                                      |
| `CHAT_SA_KEY_PATH`           | No       | Path to service account key for Chat API auth (uses ADC if not set)                                  |
| `CHAT_BRIDGE_DEBUG`          | No       | Set `true` for verbose bridge logging                                                                |
| `GIT_TERMINAL_PROMPT`        | No       | Set `0` to prevent git credential prompts in headless environments                                   |

## Local Development

### Build

From the repo root:

```bash
npm install
npm run build
```

### Run

```bash
export GEMINI_API_KEY="your-api-key"
export CODER_AGENT_PORT=8080
export CHAT_BRIDGE_A2A_URL=http://localhost:8080

node packages/a2a-server/dist/src/http/server.js
```

### Test the A2A endpoint

```bash
# Check the agent card
curl http://localhost:8080/.well-known/agent-card.json | jq .

# Send a message (JSON-RPC)
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "role": "user",
        "messageId": "test-1",
        "parts": [{"kind": "text", "text": "Hello, what can you do?"}]
      },
      "configuration": {"blocking": true}
    }
  }'
```

### Test the Chat Bridge

```bash
# Health check
curl http://localhost:8080/chat/health | jq .

# Simulate a Google Chat MESSAGE event
curl -X POST http://localhost:8080/chat/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "type": "MESSAGE",
    "eventTime": "2026-01-01T00:00:00Z",
    "message": {
      "name": "spaces/test/messages/1",
      "text": "Hello agent",
      "thread": {"name": "spaces/test/threads/abc"},
      "sender": {"name": "users/1", "displayName": "Test User"},
      "space": {"name": "spaces/test", "type": "DM"}
    },
    "space": {"name": "spaces/test", "type": "DM"},
    "user": {"name": "users/1", "displayName": "Test User"}
  }'
```

## Cloud Run Deployment

### 1. Create Artifact Registry repository

```bash
export PROJECT_ID=your-project-id
export REGION=us-central1

gcloud artifacts repositories create gemini-a2a \
  --repository-format=docker \
  --location=$REGION \
  --project=$PROJECT_ID
```

### 2. Create GCS bucket (optional, for session persistence)

```bash
gsutil mb -l $REGION gs://gemini-a2a-sessions-$PROJECT_ID
```

### 3. Build with Cloud Build

```bash
gcloud builds submit \
  --config=packages/a2a-server/cloudbuild.yaml \
  --project=$PROJECT_ID
```

### 4. Deploy to Cloud Run

```bash
export IMAGE=us-central1-docker.pkg.dev/$PROJECT_ID/gemini-a2a/a2a-server:latest

gcloud run deploy gemini-a2a-server \
  --image=$IMAGE \
  --region=$REGION \
  --project=$PROJECT_ID \
  --platform=managed \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300 \
  --concurrency=1 \
  --max-instances=1 \
  --set-env-vars="GEMINI_YOLO_MODE=true,GCS_BUCKET_NAME=gemini-a2a-sessions-$PROJECT_ID,CHAT_BRIDGE_A2A_URL=http://localhost:8080" \
  --set-secrets="GEMINI_API_KEY=gemini-api-key:latest"
```

> **Important**: After initial deployment, always use `--update-env-vars`
> instead of `--set-env-vars` to avoid wiping existing environment variables.

### 5. Update an existing deployment

```bash
# Update env vars without replacing existing ones
gcloud run services update gemini-a2a-server \
  --region=$REGION \
  --project=$PROJECT_ID \
  --update-env-vars="NEW_VAR=value"

# Deploy a new image
gcloud run services update gemini-a2a-server \
  --region=$REGION \
  --project=$PROJECT_ID \
  --image=$IMAGE
```

## Google Chat App Configuration

### 1. Create a service account for Chat API

The Chat bridge needs a service account with the Chat API scope to push messages
proactively.

```bash
# Create service account
gcloud iam service-accounts create gemini-chat-bot \
  --display-name="Gemini Chat Bot" \
  --project=$PROJECT_ID

# Download key (for local dev)
gcloud iam service-accounts keys create chat-sa-key.json \
  --iam-account=gemini-chat-bot@$PROJECT_ID.iam.gserviceaccount.com
```

On Cloud Run, use Application Default Credentials (ADC) instead of a key file.
Grant the Cloud Run service account the `chat.bot` scope by configuring it as
the Chat app's service account.

### 2. Configure the Google Chat app

1. Go to
   [Google Cloud Console > APIs & Services > Google Chat API > Configuration](https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat)
2. Set **App name** and **Description**
3. Under **Connection settings**, select **HTTP endpoint URL**
4. Set the URL to your Cloud Run service URL + `/chat/webhook`:
   ```
   https://gemini-a2a-server-HASH-uc.a.run.app/chat/webhook
   ```
5. Under **Authentication Audience**, select **HTTP endpoint URL**
6. Under **Visibility**, choose who can use the app
7. Under **Permissions**, configure who can install it
8. Click **Save**

### 3. Grant Cloud Run invoker permission

If your Cloud Run service requires authentication (recommended):

```bash
# Get the Chat service account
# It's usually chat@system.gserviceaccount.com

gcloud run services add-iam-policy-binding gemini-a2a-server \
  --region=$REGION \
  --project=$PROJECT_ID \
  --member="serviceAccount:chat@system.gserviceaccount.com" \
  --role="roles/run.invoker"
```

## Chat Bridge Commands

When messaging the bot in Google Chat:

| Command                 | Description                                         |
| ----------------------- | --------------------------------------------------- |
| `/reset` or `reset`     | Clear the current session and start fresh           |
| `/yolo`                 | Enable YOLO mode - auto-approve all tool calls      |
| `/safe`                 | Disable YOLO mode - require approval for tool calls |
| `approve` / `yes` / `y` | Approve a pending tool call                         |
| `reject` / `no` / `n`   | Reject a pending tool call                          |
| `always allow`          | Approve and always allow this tool                  |

## Troubleshooting

### "Gemini CLI Agent is not responding" in Google Chat

This usually means the agent hit Google Chat's 30-second webhook timeout before
the bridge could return "Processing...". Check Cloud Run logs:

```bash
gcloud run services logs read gemini-a2a-server \
  --region=$REGION --project=$PROJECT_ID --limit=50
```

### Tool approvals appearing in YOLO mode

Ensure `GEMINI_YOLO_MODE=true` is set. If you used `--set-env-vars` during a
deployment, it may have wiped this variable. Use `--update-env-vars` instead.

### Agent hangs on git operations

The `GIT_TERMINAL_PROMPT=0` env var (set in the Dockerfile) prevents git from
prompting for credentials. If git operations require authentication, configure a
credential helper or use `gh auth` with a token.

### Session state lost after restart

Enable GCS persistence by setting `GCS_BUCKET_NAME`. Sessions are automatically
flushed to GCS every 30 seconds and restored on startup.

### Chat responses appear as top-level messages instead of thread replies

The Chat bridge includes `thread.name` in all responses. If replies still appear
at the top level, ensure the webhook event includes thread information. DM
conversations always thread correctly; spaces may need threading enabled.
