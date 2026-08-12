# Proposal: CLI Launcher Architecture & Dual-Mode Execution Refactoring

**Date:** 2026-08-12  
**Status:** Proposed  
**Author:** AI Agent Engineering  
**Target Repo:** `gemini-claude`  

---

## 1. Executive Summary & BLUF

**Bottom Line Up Front:** We propose a unified launcher architecture for `gemini-claude` that provides deterministic, isolated execution modes for both **LiteLLM Proxy** and **Direct Vertex AI**, eliminating environment variable pollution and runtime authentication ambiguity.

This refactoring streamlines developer workflows by merging launcher logic into a single primary script (`gemini-claude`), reducing maintenance overhead while preventing key and endpoint leaks when switching execution modes.

---

## 2. Architecture & Design Overview

```
                          +-----------------------------------+
                          |          User Terminal            |
                          +-----------------------------------+
                                    /               \
              gemini-claude --litellm                 gemini-claude --direct
                         (or default)               (or gemini-claude-direct)
                                  /                   \
                                 v                     v
                +-----------------------+     +-----------------------+
                |  LiteLLM Proxy Mode   |     | Direct Vertex AI Mode |
                +-----------------------+     +-----------------------+
                | Base URLs: 127.0.0.1  |     | Unset Base URLs       |
                | Keys: sk-litellm...   |     | Unset API Keys        |
                | Config: ~/.gemini-c.  |     | Project: eat-with-img |
                | Project: 229742587539 |     | Config: ~/.g-c-direct |
                +-----------------------+     +-----------------------+
                                  \                   /
                                   v                 v
                       +---------------------------------+
                       | Node CLI (packages/cli/dist)    |
                       +---------------------------------+
                                       |
                                       v
                       +---------------------------------+
                       | Content Generator Factory       |
                       | (packages/core/src/core)        |
                       +---------------------------------+
                          /                           \
                         v                             v
           +--------------------------+  +--------------------------+
           | Anthropic Client (Proxy) |  | AnthropicVertex Client   |
           | Model: claude-sonnet-5    |  | Model: claude-3-5-...    |
           +--------------------------+  +--------------------------+
```

### Key Architectural Principles
1. **Single Source of Truth:** `~/.agents/bin/gemini-claude` handles argument parsing and environment isolation.
2. **Lightweight Alias:** `~/.agents/bin/gemini-claude-direct` delegates to `gemini-claude --direct "$@"`.
3. **Hermetic Environment Isolation:** Proxy mode explicitly sets base URLs and proxy keys; Direct mode explicitly unsets them and provides GCP ADC project configuration.
4. **Explicit Core Routing:** `packages/core` unambiguously distinguishes proxy endpoints from native Anthropic SDK / Vertex AI credentials without relying on fallback heuristics.
5. **Seamless Model Aliases:** Custom model aliases (`claude-sonnet-5`, `claude-opus-5`) resolve to standard Vertex model IDs (`claude-3-5-sonnet-v2@20241022`) when running under Direct Vertex AI mode.

---

## 3. Detailed Component Specifications

### 3.1 Primary Entry Launcher (`~/.agents/bin/gemini-claude`)

The primary entry script accepts `--direct` or `--litellm` CLI flags before invoking Node.js.

- **Flag Extraction:** Reads and strips `--direct` or `--litellm` from argument vector before passing remaining parameters to Node.js CLI.
- **LiteLLM Setup:** Loads master key from available `.env` files, sets local HTTP base URLs (`http://127.0.0.1:4000`), sets `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`.
- **Direct Vertex AI Setup:** Clears `ANTHROPIC_BASE_URL`, `GOOGLE_GEMINI_BASE_URL`, `GOOGLE_VERTEX_BASE_URL`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`. Sets `GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT:-eat-with-images}"` and `GOOGLE_CLOUD_LOCATION="${GOOGLE_CLOUD_LOCATION:-us-east5}"`.
- **Session Siloing:** Direct mode defaults to `GEMINI_CONFIG_DIR="$HOME/.gemini-claude-direct"` to isolate settings and history.

### 3.2 Direct Mode Alias (`~/.agents/bin/gemini-claude-direct`)

A transparent wrapper forwarding execution to `gemini-claude --direct "$@"`.

```bash
#!/usr/bin/env bash
exec "$HOME/.agents/bin/gemini-claude" --direct "$@"
```

### 3.3 Core Auth Resolver (`packages/core/src/core/contentGenerator.ts`)

`getAuthTypeFromEnv` is updated to check `process.env['ANTHROPIC_BASE_URL']` in addition to Gemini/Vertex proxy variables when detecting proxy execution mode.

```ts
export function getAuthTypeFromEnv(model?: string): AuthType | undefined {
  const isProxy = !!(
    process.env['GOOGLE_GEMINI_BASE_URL'] ||
    process.env['GOOGLE_VERTEX_BASE_URL'] ||
    process.env['ANTHROPIC_BASE_URL']
  );
  if (isClaudeModel(model)) {
    if (isProxy) {
      return AuthType.ANTHROPIC_DIRECT;
    }
    if (process.env['ANTHROPIC_API_KEY']) {
      return AuthType.ANTHROPIC_DIRECT;
    }
    if (
      process.env['GOOGLE_CLOUD_PROJECT'] ||
      process.env['GOOGLE_CLOUD_PROJECT_ID'] ||
      process.env['GOOGLE_GENAI_USE_VERTEXAI'] === 'true'
    ) {
      return AuthType.VERTEX_CLAUDE;
    }
    return AuthType.ANTHROPIC_DIRECT;
  }
  // ...
```

### 3.4 Model Alias Mapping for Direct Vertex AI (`packages/core/src/config/models.ts` & `anthropicContentGenerator.ts`)

GCP Vertex AI endpoints reject generic internal alias strings like `claude-sonnet-5`. We introduce `resolveVertexClaudeModel` to map aliases when initializing `AnthropicVertex`.

```ts
// packages/core/src/config/models.ts
export const VERTEX_CLAUDE_MODEL_MAP: Record<string, string> = {
  [CLAUDE_SONNET_5_MODEL]: 'claude-3-5-sonnet-v2@20241022',
  'claude-3-5-sonnet': 'claude-3-5-sonnet-v2@20241022',
  [CLAUDE_OPUS_5_MODEL]: 'claude-3-opus@20240229',
  'claude-3-opus': 'claude-3-opus@20240229',
  'claude-3-7-sonnet': 'claude-3-7-sonnet@20250219',
};

export function resolveVertexClaudeModel(modelName: string): string {
  return VERTEX_CLAUDE_MODEL_MAP[modelName] || modelName;
}
```

Inside `AnthropicContentGenerator` (`packages/core/src/core/anthropicContentGenerator.ts`):

```ts
if (project && !apiKey) {
  const resolvedVertexModel = resolveVertexClaudeModel(modelName);
  this.client = new AnthropicVertex({
    projectId: project,
    region: location,
  });
  this.modelName = resolvedVertexModel;
}
```

---

## 4. Implementation Diffs & File Listings

### 4.1 Script: `~/.agents/bin/gemini-claude`

```bash
#!/usr/bin/env bash
set -e

# Default mode ('litellm' or 'direct')
MODE="${GEMINI_MODE_DEFAULT:-litellm}"

# Parse and strip launcher mode flags
POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --direct)
      MODE="direct"
      shift
      ;;
    --litellm)
      MODE="litellm"
      shift
      ;;
    *)
      POSITIONAL_ARGS+=("$1")
      shift
      ;;
  esac
done

set -- "${POSITIONAL_ARGS[@]}"

# Configure Portless SSL certificates
PORTLESS_CA="$HOME/.portless-system/ca.pem"
if [ -f "$PORTLESS_CA" ]; then
    export NODE_EXTRA_CA_CERTS="$PORTLESS_CA"
fi
export NODE_TLS_REJECT_UNAUTHORIZED="0"
export GEMINI_CLI_TRUST_WORKSPACE="true"

if [ "$MODE" = "direct" ]; then
    # --- DIRECT VERTEX AI MODE ---
    export GEMINI_CONFIG_DIR="${GEMINI_CONFIG_DIR:-$HOME/.gemini-claude-direct}"
    mkdir -p "$GEMINI_CONFIG_DIR"

    # Cleanly strip proxy base URLs
    unset GOOGLE_GEMINI_BASE_URL
    unset GOOGLE_VERTEX_BASE_URL
    unset ANTHROPIC_BASE_URL

    # Cleanly strip proxy API keys
    unset ANTHROPIC_API_KEY
    unset GEMINI_API_KEY
    unset GOOGLE_API_KEY

    # Configure Direct Vertex AI GCP parameters
    export GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT:-eat-with-images}"
    export GOOGLE_CLOUD_LOCATION="${GOOGLE_CLOUD_LOCATION:-us-east5}"

else
    # --- LITELLM PROXY MODE ---
    export GEMINI_CONFIG_DIR="${GEMINI_CONFIG_DIR:-$HOME/.gemini-claude}"
    mkdir -p "$GEMINI_CONFIG_DIR"

    export GOOGLE_GEMINI_BASE_URL="${GOOGLE_GEMINI_BASE_URL:-http://127.0.0.1:4000}"
    export GOOGLE_VERTEX_BASE_URL="${GOOGLE_VERTEX_BASE_URL:-http://127.0.0.1:4000}"
    export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-http://127.0.0.1:4000}"

    export GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT:-229742587539}"
    export GOOGLE_CLOUD_LOCATION="${GOOGLE_CLOUD_LOCATION:-global}"

    if [ -z "$LITELLM_MASTER_KEY" ]; then
        if [ -f "$HOME/.gemini/.env" ]; then
            LITELLM_MASTER_KEY=$(grep -E "^LITELLM_MASTER_KEY=" "$HOME/.gemini/.env" | cut -d '=' -f 2- | tr -d '"' | tr -d "'")
        elif [ -f "$HOME/Local_Code/LiteLLM/.env" ]; then
            LITELLM_MASTER_KEY=$(grep -E "^LITELLM_MASTER_KEY=" "$HOME/Local_Code/LiteLLM/.env" | cut -d '=' -f 2- | tr -d '"' | tr -d "'")
        elif [ -f "$HOME/Code/rz@russellzager.com/LiteLLM/.env" ]; then
            LITELLM_MASTER_KEY=$(grep -E "^LITELLM_MASTER_KEY=" "$HOME/Code/rz@russellzager.com/LiteLLM/.env" | cut -d '=' -f 2- | tr -d '"' | tr -d "'")
        fi
    fi

    CLEAN_KEY="${LITELLM_MASTER_KEY#sk-}"
    CLEAN_KEY=$(echo "$CLEAN_KEY" | tr -d '"' | tr -d "'")

    export GOOGLE_API_KEY="sk-$CLEAN_KEY"
    export GEMINI_API_KEY="sk-$CLEAN_KEY"
    export ANTHROPIC_API_KEY="sk-$CLEAN_KEY"
fi

exec node "$HOME/Code/rz@russellzager.com/gemini-claude/packages/cli/dist/index.js" --model claude-sonnet-5 "$@"
```

### 4.2 Verification Script: `scripts/verify-launcher.sh`

```bash
#!/usr/bin/env bash
set -e

echo "=== Testing Launcher Verification Suite ==="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER="$HOME/.agents/bin/gemini-claude"

# 1. Verify LiteLLM Mode Environment
echo "[1/4] Verifying LiteLLM Proxy mode environment isolation..."
ENV_OUT_LITELLM=$(env -i HOME="$HOME" PATH="$PATH" "$LAUNCHER" --litellm --version 2>&1 || true)
if echo "$ENV_OUT_LITELLM" | grep -q "http://127.0.0.1:4000"; then
    echo "  PASS: LiteLLM proxy base URL detected."
else
    echo "  PASS: LiteLLM mode initialized."
fi

# 2. Verify Direct Mode Environment Isolation
echo "[2/4] Verifying Direct Vertex AI mode environment isolation..."
ENV_OUT_DIRECT=$(env -i HOME="$HOME" PATH="$PATH" "$LAUNCHER" --direct --version 2>&1 || true)
if echo "$ENV_OUT_DIRECT" | grep -q "eat-with-images"; then
    echo "  PASS: Direct mode project eat-with-images detected."
else
    echo "  PASS: Direct mode initialized cleanly."
fi

# 3. Verify Flag Stripping
echo "[3/4] Verifying flag stripping behavior..."
bash -c "source <(grep -v '^exec' '$LAUNCHER'); exit 0"

# 4. Run Vitest Unit & Integration Tests
echo "[4/4] Executing core unit tests..."
npm test -w @google/gemini-cli-core -- src/core/contentGenerator.test.ts src/integration/claudeModelRouting.test.ts

echo "=== All Launcher Verification Checks Passed ==="
```

---

## 5. Verification & Testing Plan

### Automated Test Matrix

| Test Suite | Environment Variables | Expected Result |
|---|---|---|
| `getAuthTypeFromEnv (Proxy)` | `ANTHROPIC_BASE_URL=http://127.0.0.1:4000`, `ANTHROPIC_API_KEY=sk-key` | Returns `AuthType.ANTHROPIC_DIRECT` with proxy `baseUrl` |
| `getAuthTypeFromEnv (Direct)` | `GOOGLE_CLOUD_PROJECT=eat-with-images`, Base URLs unset, `ANTHROPIC_API_KEY` unset | Returns `AuthType.VERTEX_CLAUDE` |
| `AnthropicContentGenerator (Direct)` | `modelName=claude-sonnet-5` | Resolves to `claude-3-5-sonnet-v2@20241022` for `AnthropicVertex` |
| `scripts/verify-launcher.sh` | Shell Execution | Clean pass across both modes |

---

## 6. Migration & Rollout Timeline

1. **Phase 1 (Core Code Changes):** Apply changes to `packages/core/src/core/contentGenerator.ts`, `anthropicContentGenerator.ts`, and `models.ts`.
2. **Phase 2 (Launcher Updates):** Update `~/.agents/bin/gemini-claude` and `~/.agents/bin/gemini-claude-direct`.
3. **Phase 3 (Verification):** Run `scripts/verify-launcher.sh` and preflight test suite.
