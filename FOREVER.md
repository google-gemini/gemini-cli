# Forever Agent + Google Chat Bridge

Run Gemini CLI as an autonomous forever agent, accessible via Google Chat.

## Architecture

```
Google Chat Space
    ↓ webhook (HTTPS)
Chat Bridge (port 8081, public)
    ↓ JSON-RPC (localhost)
gemini-cli --forever (port 3100, localhost only)
    ↓
Gemini API (LLM + tools)
```

**Two processes on one VM:**

- **gemini-cli --forever** — the agent, runs continuously with Sisyphus
  auto-resume
- **Chat bridge** — receives Google Chat webhooks, forwards to agent, pushes
  responses back via Chat API

One agent per Google Chat space. YOLO mode (auto-approve all tools).

## Prerequisites

1. **Google Cloud project** with:
   - Chat API enabled
   - A service account with `Chat Bot` role
   - Service account key JSON file

2. **Gemini API key** from
   [Google AI Studio](https://aistudio.google.com/apikey)

3. **Node.js 20+**

## Local Development (with ngrok)

### 1. Install and build

```bash
git clone -b st/forever https://github.com/google-gemini/gemini-cli.git gemini-cli-forever
cd gemini-cli-forever
npm install --ignore-scripts
npm run build
```

### 2. Set env vars

```bash
export GOOGLE_API_KEY="your-gemini-api-key"
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
export A2A_PORT=3100
export BRIDGE_PORT=8081
# Optional: set for JWT verification (your GCP project number, not project ID)
# export CHAT_PROJECT_NUMBER="123456789"
```

### 3. Start ngrok (separate terminal)

```bash
ngrok http 8081
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`).

### 4. Configure Google Chat App

1. Go to
   [Google Cloud Console → APIs & Services → Google Chat API](https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat)
2. Click **Configuration**
3. Set:
   - **App name:** Forever Agent
   - **App URL:** `https://abc123.ngrok.io/chat/webhook`
   - **Visibility:** People and groups in your domain (or specific people)
   - **Functionality:** Spaces and group conversations (check), Direct messages
     (check)
   - **Connection settings:** HTTP endpoint URL
   - **Permissions:** Everyone in your Workspace domain (or specific people)
4. Save

### 5. Start the agent

```bash
./scripts/start-forever.sh
```

The onboarding dialog will ask for a mission and Sisyphus config on first run.

### 6. Test

1. Open Google Chat
2. Create a new space and add the "Forever Agent" app
3. Send a message — the agent will process it and respond

## GCE VM Deployment

### 1. Create the VM

```bash
gcloud compute instances create forever-agent \
  --zone=us-central1-a \
  --machine-type=e2-small \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --boot-disk-size=20GB \
  --tags=forever-agent
```

### 2. Allow inbound traffic on bridge port

```bash
gcloud compute firewall-rules create allow-chat-bridge \
  --allow=tcp:8081 \
  --target-tags=forever-agent \
  --source-ranges=0.0.0.0/0 \
  --description="Allow Google Chat webhooks to reach the bridge"
```

### 3. SSH and install Node.js

```bash
gcloud compute ssh forever-agent --zone=us-central1-a

# On the VM:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
```

### 4. Clone and build

```bash
git clone -b st/forever https://github.com/google-gemini/gemini-cli.git
cd gemini-cli
npm install --ignore-scripts
npm run build
```

### 5. Configure

```bash
# Create env file
cat > ~/.forever-agent.env << 'EOF'
GOOGLE_API_KEY=your-gemini-api-key
GOOGLE_APPLICATION_CREDENTIALS=/home/$USER/service-account-key.json
A2A_PORT=3100
BRIDGE_PORT=8081
CHAT_PROJECT_NUMBER=your-project-number
EOF

# Upload service account key
# (from your local machine):
# gcloud compute scp service-account-key.json forever-agent:~/service-account-key.json --zone=us-central1-a
```

### 6. Create systemd service

```bash
sudo tee /etc/systemd/system/forever-agent.service << EOF
[Unit]
Description=Gemini CLI Forever Agent
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/home/$USER/gemini-cli
EnvironmentFile=/home/$USER/.forever-agent.env
ExecStart=/home/$USER/gemini-cli/scripts/start-forever.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable forever-agent
sudo systemctl start forever-agent
```

### 7. Check logs

```bash
sudo journalctl -u forever-agent -f
```

### 8. Configure Google Chat App

Same as local dev, but use the VM's external IP:

- **App URL:** `http://EXTERNAL_IP:8081/chat/webhook`

> **Note:** Google Chat requires HTTPS in production. For HTTPS, either:
>
> - Put nginx + Let's Encrypt in front
>   (`sudo apt install nginx certbot python3-certbot-nginx`)
> - Use a Cloud Load Balancer with managed cert
> - For testing, HTTP works with some Chat API configurations

## Env Vars Reference

| Variable                         | Required | Default                 | Description                             |
| -------------------------------- | -------- | ----------------------- | --------------------------------------- |
| `GOOGLE_API_KEY`                 | Yes      | —                       | Gemini API key                          |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes      | —                       | Path to service account key JSON        |
| `A2A_PORT`                       | No       | `3100`                  | External listener port (agent)          |
| `BRIDGE_PORT`                    | No       | `8081`                  | Chat bridge port (public-facing)        |
| `A2A_URL`                        | No       | `http://127.0.0.1:3100` | Agent URL (for bridge to connect to)    |
| `CHAT_PROJECT_NUMBER`            | No       | —                       | GCP project number for JWT verification |

## How It Works

1. User sends message in Google Chat space
2. Google Chat POSTs webhook to the bridge (`/chat/webhook`)
3. Bridge immediately returns `{}` (Google Chat has a 30s webhook timeout)
4. Bridge asynchronously sends the message to the forever agent via JSON-RPC
5. Agent processes the message (may take minutes — tools, thinking, etc.)
6. Agent returns response to bridge
7. Bridge pushes response to Google Chat via Chat REST API

The forever agent runs with:

- **Sisyphus** — auto-resumes after idle timeout (configurable)
- **Confucius** — reflects and consolidates knowledge at ~80% context
- **Hippocampus** — extracts key facts after each turn
- **Bicameral Voice** — proactively captures knowledge from user messages
- **YOLO mode** — auto-approves all tool calls (no human-in-the-loop)

## Troubleshooting

### Bridge returns 401/403

- Check `CHAT_PROJECT_NUMBER` matches your GCP project number (not project ID)
- Unset `CHAT_PROJECT_NUMBER` to disable JWT verification for testing

### Agent doesn't respond

- Check the agent is running:
  `curl http://localhost:3100/.well-known/agent-card.json`
- Check bridge health: `curl http://localhost:8081/health`
- Check bridge logs for errors

### Google Chat shows no response

- The bridge returns `{}` immediately — responses are pushed async via Chat API
- Ensure `GOOGLE_APPLICATION_CREDENTIALS` points to a valid service account key
- Ensure the service account has `Chat Bot` role

### Webhook not reaching bridge

- Check firewall rules allow inbound on port 8081
- For HTTPS requirement: use ngrok for testing, nginx + Let's Encrypt for
  production
