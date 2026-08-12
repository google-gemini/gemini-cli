# Configuration & Testing Guide

This guide details environment architecture, common agent antipatterns, and interactive testing methodologies for `gemini-claude`.

---

## 1. Working Configuration & Environment Architecture

`gemini-claude` supports both proxied Anthropic API execution and direct Vertex AI invocation. The table below summarizes the key environment settings for each mode.

| Configuration Mode | Client SDK | Required Environment Variables | Target Endpoint |
|---|---|---|---|
| `gemini-claude` | `@anthropic-ai/sdk` | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` | Local LiteLLM proxy (`http://127.0.0.1:4000`) |
| `gemini-claude-direct` | `@anthropic-ai/vertex-sdk` | `GOOGLE_CLOUD_PROJECT=eat-with-images`, `GOOGLE_CLOUD_LOCATION=us-east5` (or `global`) | Direct Vertex AI API |

---

### 1.1 `gemini-claude` (LiteLLM Proxy Architecture)

In the local proxy mode, traffic routes through a LiteLLM proxy server running on `http://127.0.0.1:4000`.

- Set `ANTHROPIC_BASE_URL` to `http://127.0.0.1:4000`.
- Set `ANTHROPIC_API_KEY` to your local proxy API key (e.g., `sk-1234`).
- Set `GOOGLE_GEMINI_BASE_URL` to `http://127.0.0.1:4000` only when proxying `@google/genai` calls.

The `@anthropic-ai/sdk` client reads `ANTHROPIC_BASE_URL` during instantiation and sends all completion requests to the LiteLLM proxy on port 4000.

---

### 1.2 `gemini-claude-direct` (Direct Vertex AI Architecture)

In direct mode, the application connects directly to Google Cloud Vertex AI using Application Default Credentials (ADC).

- Set `GOOGLE_CLOUD_PROJECT` (or `GOOGLE_CLOUD_PROJECT_ID`) to `eat-with-images`.
- Set `GOOGLE_CLOUD_LOCATION` to `us-east5` or `global`.
- Ensure `ANTHROPIC_API_KEY` is unset to trigger Vertex SDK initialization.

Run `gcloud auth application-default login` to generate local credentials before running in direct mode.

---

### 1.3 Model Resolution Pipeline

Model resolution routes user requests to the appropriate generator class in `packages/core/src/core/contentGenerator.ts`.

```
User Model Request ("claude-sonnet-5")
           │
           ▼
contentGenerator.ts (resolveModel)
           │
           ▼
models.ts (Maps alias to CLAUDE_SONNET_5_MODEL)
           │
           ▼
AnthropicContentGenerator
   ├── If ANTHROPIC_API_KEY -> Anthropic SDK (@anthropic-ai/sdk)
   └── If GOOGLE_CLOUD_PROJECT -> AnthropicVertex SDK (@anthropic-ai/vertex-sdk)
```

1. **Selection Logic**: `contentGenerator.ts` inspects `authType` and model name using `isClaudeModel()`.
2. **Alias Resolution**: `packages/core/src/config/models.ts` translates aliases (`claude-sonnet-5`, `claude-3-5-sonnet`, `sonnet`) to canonical model names.
3. **Client Instantiation**: `packages/core/src/core/anthropicContentGenerator.ts` instantiates `@anthropic-ai/sdk` when `ANTHROPIC_API_KEY` is present, or `@anthropic-ai/vertex-sdk` when `GOOGLE_CLOUD_PROJECT` is set.

---

## 2. Antipatterns & Common Agent Pitfalls

### Antipattern 1: Hardcoding Regional Overrides

- **Pitfall**: Forcing `GOOGLE_CLOUD_LOCATION` to a specific region like `us-central1` or `us-east5` without testing model quota availability.
- **Impact**: Vertex AI returns HTTP 404 Not Found or 403 Quota Exceeded errors when publisher endpoints require `global`.
- **Remediation**: Use `process.env['GOOGLE_CLOUD_LOCATION']` with a fallback to `global`. Verify regional support using `gcloud` before committing overrides.

---

### Antipattern 2: Confusing LiteLLM Base URLs

- **Pitfall**: Setting `GOOGLE_GEMINI_BASE_URL` when attempting to proxy `@anthropic-ai/sdk` requests, or vice versa.
- **Impact**: `@anthropic-ai/sdk` ignores `GOOGLE_GEMINI_BASE_URL` and attempts direct connection to Anthropic endpoints, causing authentication failures or 500 payload errors.
- **Remediation**: Use `ANTHROPIC_BASE_URL` for Anthropic SDK requests and `GOOGLE_GEMINI_BASE_URL` for Gemini SDK requests.

---

### Antipattern 3: Static-Only Verification ("Verification Theater")

- **Pitfall**: Declaring tasks complete after code edits or `npm run typecheck` without running live end-to-end execution.
- **Impact**: Passes static analysis but fails at runtime due to missing environment variables, payload mismatches, or network errors.
- **Remediation**: Execute live end-to-end calls against real backend targets. Append `[unverified]` to status statements when live execution is skipped.

---

### Antipattern 4: Ignoring Interactive TUI Verification

- **Pitfall**: Testing only non-interactive batch mode (`-p "..."`) and assuming the interactive terminal user interface works.
- **Impact**: Misses regressions in Ink rendering, keyboard input handling, raw mode terminal streams, and stdout line wrapping.
- **Remediation**: Run automated interactive pseudo-terminal (PTY) session tests to verify complete TUI event loops.

---

## 3. Interactive TUI Session Test Methodology

---

### 3.1 Pseudo-Terminal (PTY) Automation via Python

Use Python's `pty` module to spawn interactive CLI sessions in a virtual terminal environment.

```python
import os
import pty
import select
import subprocess
import time

def test_interactive_tui():
    master, slave = pty.openpty()
    env = os.environ.copy()
    env["ANTHROPIC_BASE_URL"] = "http://127.0.0.1:4000"
    env["ANTHROPIC_API_KEY"] = "sk-1234"

    proc = subprocess.Popen(
        ["node", "packages/cli/dist/src/cli.js"],
        stdin=slave,
        stdout=slave,
        stderr=slave,
        start_new_session=True,
        env=env,
    )
    os.close(slave)

    time.sleep(2)
    os.write(master, b"say hello in 3 words\n")

    output = b""
    start_time = time.time()
    while time.time() - start_time < 10:
        r, _, _ = select.select([master], [], [], 0.5)
        if r:
            chunk = os.read(master, 1024)
            if not chunk:
                break
            output += chunk
            if b"hello" in output.lower():
                break

    os.close(master)
    proc.terminate()
    proc.wait()

    assert len(output) > 0, "No output captured from TUI"
    print("TUI verification passed.")

if __name__ == "__main__":
    test_interactive_tui()
```

---

### 3.2 Non-Interactive Batch Smoke Testing

Run quick non-interactive smoke tests using the prompt flag (`-p`) and text output format (`-o text`).

```bash
gemini-claude -p "say hello in 3 words" -o text
```

Verify that the output contains non-empty text response without stack traces or unhandled promise rejections.

---

### 3.3 Verifying Background Tasks and Log Inspection

When running background tasks or server proxies, use `manage_task` and `view_file` to verify operational status.

1. **Check Task Status**: Query `manage_task` with `Action: 'status'` and `TaskId` to obtain log file paths.
2. **Inspect Output Logs**: Open log files using `view_file` to review stdout and stderr outputs.
3. **Confirm Clean Exit**: Verify process termination codes and ensure no residual orphan processes remain active.
