# Connecting Gemini CLI to SGLang Server

Gemini CLI includes native support for connecting directly to local or remote **SGLang inference servers** (such as [Moonshot Kimi-K3](https://huggingface.co/moonshotai/Kimi-K3), DeepSeek-V3/R1, or Qwen models).

This integration leverages OpenAI-compatible `/v1/chat/completions` endpoints with full support for:
- ⚡ **Streaming responses** (`stream: true`)
- 🧠 **Reasoning thought traces** (e.g. `delta.reasoning_content`) rendered cleanly in the CLI thinking box
- 🛠️ **Built-in tools & MCP function calling** with recursive schema conversion (handling Gemini uppercase types to standard JSON Schema)
- 🛑 **Interactive stream cancellation** (`ESC` key support)
- 🔁 **Multi-turn conversation history** with persistent tool call identifiers

---

## 1. Quick Start

### Step 1: Start your SGLang Server

Ensure your SGLang server is running and accessible (e.g. via `kubectl port-forward` or direct IP):

```bash
# Example port-forward for GKE SGLang deployment
kubectl port-forward -n <namespace> pod/<sglang-leader-pod> 30100:30100 &
```

Verify that the endpoint responds:

```bash
curl http://127.0.0.1:30100/v1/models
```

---

### Step 2: Configure Environment Variables

Export the base URL and the served model name:

```bash
export SGLANG_BASE_URL="http://127.0.0.1:30100/v1"
export GEMINI_MODEL="moonshotai/Kimi-K3"
export GEMINI_DEFAULT_AUTH_TYPE="sglang"
```

> **Note**: Use `http://127.0.0.1:30100/v1` instead of `localhost` on container/Linux environments to avoid DNS resolution latency or missing `/etc/hosts` aliases.

---

### Step 3: Configure `~/.gemini/settings.json` (Optional)

You can persist SGLang authentication in your user settings:

```json
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
```

---

### Step 4: Launch Gemini CLI

```bash
gemini
```

Or run a single prompt:

```bash
gemini "Hello Kimi-K3! Explain what files are in this project."
```

---

## 2. Interactive Authentication

If you launch `gemini` without predefined settings, or type `/auth` inside the interactive session, choose:

```
? How would you like to authenticate for this project?
● 1. SGLang Server (Local / Remote Kimi-K3)
  2. Sign in with Google
  3. Use Gemini API Key
  4. Vertex AI
```

Press **Enter** on **SGLang Server**. Gemini CLI will connect directly without requiring a Google account or API key.

---

## 3. Supported Configuration Options

| Environment Variable | Description | Default |
|---|---|---|
| `SGLANG_BASE_URL` | Base URL of the SGLang OpenAI-compatible API endpoint | `http://127.0.0.1:30100/v1` |
| `OPENAI_BASE_URL` | Fallback URL if `SGLANG_BASE_URL` is not set | `http://127.0.0.1:30100/v1` |
| `GEMINI_MODEL` / `SGLANG_MODEL` | Model identifier matching the `--served-model-name` | `moonshotai/Kimi-K3` |
| `GEMINI_DEFAULT_AUTH_TYPE` | Default auth method (`sglang`, `oauth-personal`, `gemini-api-key`) | `oauth-personal` |

---

## 4. Architecture & Implementation Details

1. **`SglangContentGenerator`** ([`packages/core/src/core/sglangContentGenerator.ts`](../packages/core/src/core/sglangContentGenerator.ts)):
   - Implements the core `ContentGenerator` interface.
   - Converts Gemini's `Content[]` structure (parts, function responses, and system instructions) to OpenAI `messages` format.
   - Translates tool schemas into valid JSON schemas with lowercase types (`object`, `string`, `array`, `number`, `boolean`).
   - Accumulates streaming tool calls and emits `functionCall` events to Gemini's tool dispatcher.
   - Streams `reasoning_content` with `thought: true` metadata.

2. **Model Resolution & Whitelist** ([`packages/core/src/config/models.ts`](../packages/core/src/config/models.ts)):
   - Adds custom models (such as `moonshotai/Kimi-K3`) to active model checks to prevent fallback errors.

3. **Authentication Validation** ([`packages/cli/src/config/auth.ts`](../packages/cli/src/config/auth.ts)):
   - Accepts `AuthType.SGLANG` (`sglang`) without demanding external Google Cloud or Gemini API credentials.

---

## 5. Troubleshooting

### `Name or service not known`
- **Cause**: The container/VM does not have `localhost` defined in `/etc/hosts`.
- **Fix**: Set `export SGLANG_BASE_URL="http://127.0.0.1:30100/v1"` using the numeric IP.

### `Connection refused`
- **Cause**: SGLang server is not running, or `kubectl port-forward` process terminated.
- **Fix**: Verify SGLang pod status with `kubectl get pods -n <namespace>` and restart port-forwarding:
  ```bash
  kubectl port-forward -n <namespace> pod/<pod-name> 30100:30100 &
  ```

### `Model not found`
- **Cause**: Gemini CLI defaulted to `gemini-api-key` or `oauth-personal` stored in `~/.gemini/settings.json`.
- **Fix**: Run `/auth` in the CLI and select `SGLang Server`, or update `~/.gemini/settings.json` with `"selectedType": "sglang"`.
