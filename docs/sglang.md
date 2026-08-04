# Connecting Gemini CLI to SGLang Server

Gemini CLI includes native support for connecting directly to local or remote **SGLang inference servers** (such as [Moonshot Kimi-K3](https://huggingface.co/moonshotai/Kimi-K3), DeepSeek-V3/R1, or Qwen models).

This integration leverages OpenAI-compatible `/v1/chat/completions` endpoints with full support for:
- ⚡ **Streaming responses** (`stream: true`)
- 🧠 **Reasoning thought traces** (e.g. `delta.reasoning_content`) rendered cleanly in the CLI thinking box
- 🛠️ **Built-in tools & MCP function calling** with recursive schema conversion (handling Gemini uppercase types to standard JSON Schema)
- 🛑 **Interactive stream cancellation** (`ESC` key support)
- 🔁 **Multi-turn conversation history** with persistent tool call identifiers

---

## 1. Prerequisites on Linux (Debian / Ubuntu / COS)

Before building, ensure you have **Node.js 20+**, **npm**, and build essentials installed on your Linux machine:

### Install Node.js 20 and Build Tools

```bash
# Update package lists
sudo apt-get update

# Install git, curl, and native compilation tools
sudo apt-get install -y git curl build-essential python3

# Install Node.js 20.x LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify versions
node -v   # Should be v20.x or higher
npm -v    # Should be 10.x or higher
```

### Install GKE / Kubernetes Client Tools (If running on GKE)

```bash
# Install kubectl and GKE auth plugin
sudo apt-get install -y kubectl google-cloud-cli-gke-gcloud-auth-plugin

# Configure cluster credentials
gcloud container clusters get-credentials <CLUSTER_NAME> \
  --region <REGION> \
  --project <PROJECT_ID>
```

---

## 2. Building `feat/sglang-support` from Source

Clone the repository, switch to the `feat/sglang-support` branch, install dependencies, and compile:

```bash
# 1. Clone the repository and checkout the feat/sglang-support branch
git clone -b feat/sglang-support https://github.com/shivajid/gemini-cli.git
cd gemini-cli

# 2. Install workspace dependencies
npm install

# 3. Compile all packages (including @google/gemini-cli-core)
npm run build

# 4. Generate the standalone CLI binary bundle
npm run bundle

# 5. Link globally so the `gemini` command is available system-wide
npm link
```

> **Tip for updating**: To pull future updates, simply run:
> ```bash
> git pull origin feat/sglang-support
> npm run build && npm run bundle && npm link
> ```

---

## 3. Quick Start & Connecting to SGLang

### Step 1: Start SGLang Port-Forwarding

If your SGLang server is running in Kubernetes / GKE, forward the API port to your local machine:

```bash
# Forward port 30100 from your SGLang leader pod
kubectl port-forward -n <NAMESPACE> pod/<SGLANG_LEADER_POD> 30100:30100 &
```

Verify that the server is reachable:

```bash
curl http://127.0.0.1:30100/v1/models
```

---

### Step 2: Set Environment Variables

```bash
export SGLANG_BASE_URL="http://127.0.0.1:30100/v1"
export GEMINI_MODEL="moonshotai/Kimi-K3"
export GEMINI_DEFAULT_AUTH_TYPE="sglang"
```

> **Note**: Always use `http://127.0.0.1:30100/v1` instead of `localhost` on Linux containers to avoid DNS resolution issues.

---

### Step 3: Configure Settings (Optional)

Create or update `~/.gemini/settings.json` to persist the SGLang authentication:

```bash
mkdir -p ~/.gemini
cat << 'EOF' > ~/.gemini/settings.json
{
  "general": {
    "enableAutoUpdateNotification": false
  },
  "security": {
    "auth": {
      "selectedType": "sglang"
    }
  }
}
EOF
```

---

### Step 4: Run Gemini CLI

Start an interactive chat session:

```bash
gemini
```

Or pass an immediate prompt:

```bash
gemini "Hello Kimi-K3! List the files in this directory."
```

---

## 4. Interactive Authentication Menu

If you run `gemini` without predefined settings, or type `/auth` inside an active session:

```
? How would you like to authenticate for this project?
● 1. SGLang Server (Local / Remote Kimi-K3)
  2. Sign in with Google
  3. Use Gemini API Key
  4. Vertex AI
```

Select **`1. SGLang Server (Local / Remote Kimi-K3)`** to bypass Google credentials and route traffic directly to your SGLang endpoint.

---

## 5. Configuration Reference

| Variable / Setting | Description | Default |
|---|---|---|
| `SGLANG_BASE_URL` | Base URL of the OpenAI-compatible SGLang server | `http://127.0.0.1:30100/v1` |
| `OPENAI_BASE_URL` | Secondary fallback base URL | `http://127.0.0.1:30100/v1` |
| `GEMINI_MODEL` / `SGLANG_MODEL` | Served model name on SGLang | `moonshotai/Kimi-K3` |
| `GEMINI_DEFAULT_AUTH_TYPE` | Default auth method (`sglang`, `oauth-personal`, `gemini-api-key`) | `oauth-personal` |
| `enableAutoUpdateNotification` | Set to `false` in `settings.json` to hide git update banners | `true` |

---

## 6. Troubleshooting

### 1. `socket.gaierror: [Errno -2] Name or service not known`
- **Cause**: Linux environment does not resolve `localhost` in `/etc/hosts`.
- **Fix**: Use numeric IP `http://127.0.0.1:30100/v1`.

### 2. `Connection refused`
- **Cause**: SGLang server is initializing or `kubectl port-forward` terminated.
- **Fix**: Check `kubectl get pods -n <namespace>` and restart port-forwarding.

### 3. `Model "moonshotai/Kimi-K3" was not found`
- **Cause**: Saved setting in `~/.gemini/settings.json` is still set to Google API (`gemini-api-key` or `oauth-personal`).
- **Fix**: Run `/auth` and select **SGLang Server**, or set `"selectedType": "sglang"` in `~/.gemini/settings.json`.
