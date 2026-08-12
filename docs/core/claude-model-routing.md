# Claude Model Routing Architecture & Setup

This document describes the design, setup, and model resolution architecture for
routing Claude models within Gemini CLI. It covers the distinction between
proxy-based and direct SDK modes, isolated configuration environments, and the
model mapping layer.

<!-- prettier-ignore -->
> [!NOTE]
> Gemini CLI supports both Gemini and Anthropic Claude models. This guide
> focuses specifically on the direct Vertex AI and Anthropic SDK integration.

## 1. Architectural Overview

Gemini CLI provides two distinct execution paths for invoking Claude models:

| Mode            | Entry Point / Binary   | Routing Backend             | Authentication & Transport                                                                                        |
| --------------- | ---------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Proxy Mode**  | `gemini-claude`        | LiteLLM or HTTP Proxy       | Routes requests to a local or remote LiteLLM proxy endpoint (e.g., `http://127.0.0.1:4000/v1beta/models/...`).    |
| **Direct Mode** | `gemini-claude-direct` | `AnthropicContentGenerator` | Directly calls Google Cloud Vertex AI (`@anthropic-ai/vertex-sdk`) or Anthropic Direct API (`@anthropic-ai/sdk`). |

### Request Flow in Direct Mode

When `gemini-claude-direct` is executed or when `AuthType.ANTHROPIC_DIRECT` or
`AuthType.VERTEX_CLAUDE` is active:

1. **Factory Selection**:
   [`contentGenerator.ts`](../../packages/core/src/core/contentGenerator.ts)
   checks the authentication configuration and requested model name.
2. **Model Normalization**: The requested model name string is passed to
   [`resolveModel()`](../../packages/core/src/config/models.ts#L158-L255) to map
   legacy, versioned, or variant model names into canonical model ID constants.
3. **Generator Instantiation**: An instance of
   [`AnthropicContentGenerator`](../../packages/core/src/core/anthropicContentGenerator.ts)
   is created with the canonical model ID (`claude-sonnet-5` or
   `claude-opus-5`).
4. **SDK Transport**:
   - If `ANTHROPIC_API_KEY` is present, the generator uses the
     `@anthropic-ai/sdk` client.
   - If `GOOGLE_CLOUD_PROJECT` is present, the generator uses the
     `@anthropic-ai/vertex-sdk` client with Google Application Default
     Credentials (ADC).

```
+------------------------+
|  gemini-claude-direct  |
+-----------+------------+
            |
            v
+------------------------+      resolveModel()       +------------------------+
|  contentGenerator.ts   | ------------------------> | canonical model ID     |
+-----------+------------+                           | ('claude-sonnet-5')    |
            |                                        +------------------------+
            v
+-----------------------------------------------------------------------------+
| AnthropicContentGenerator                                                   |
|                                                                             |
|   +---------------------------------+   +-------------------------------+   |
|   | ANTHROPIC_API_KEY present       |   | GOOGLE_CLOUD_PROJECT present  |   |
|   | -> @anthropic-ai/sdk            |   | -> @anthropic-ai/vertex-sdk   |   |
|   +---------------------------------+   +-------------------------------+   |
+-----------------------------------------------------------------------------+
```

## 2. Configuration & Environment Isolation

To prevent credential leaks, proxy environment bleed, and state corruption,
`gemini-claude-direct` uses a siloed configuration directory.

### Siloed Configuration Directory

Set the `GEMINI_CONFIG_DIR` environment variable to point to a dedicated
directory:

```bash
export GEMINI_CONFIG_DIR="$HOME/.gemini-claude-direct"
```

This isolates settings, credentials, and session state from standard Gemini CLI
configurations (`~/.gemini`), ensuring proxy overrides or cached Gemini settings
do not interfere with direct Claude model routing.

### Required Environment Variables

Direct Vertex AI routing for Claude models requires specific Google Cloud
environment settings:

| Variable                | Recommended Value             | Description                                                                |
| ----------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| `GOOGLE_CLOUD_PROJECT`  | Your GCP Project ID           | Google Cloud Project hosting the Vertex AI Claude models.                  |
| `GOOGLE_CLOUD_LOCATION` | `global`                      | Regional location for Vertex AI Claude models.                             |

<!-- prettier-ignore -->
> [!IMPORTANT]
> When using direct mode (`gemini-claude-direct`), ensure proxy override
> variables such as `ANTHROPIC_BASE_URL`, `HTTP_PROXY`, `HTTPS_PROXY`, and
> `GEMINI_CLI_CUSTOM_HEADERS` are unset. Stale proxy variables cause traffic
> to be improperly redirected to LiteLLM endpoints.

## 3. Model Resolution Mapping & Canonical API

Gemini CLI uses a single, canonical model resolution API: [`getLatestModelId()`](../../packages/core/src/config/models.ts#L665-L688).

### Family Aliases & Exact ID Preservation
1. **Family Aliases**: Passing a model family parameter (`opus`, `sonnet`, `haiku`, `pro`, `flash`, `flash-lite`, `auto`) resolves directly to the latest model ID within that family (`LATEST_MODEL_FAMILIES`).
2. **Exact Model IDs**: Explicit model IDs passed by users (e.g. `claude-sonnet-5`, `claude-opus-5`, `claude-haiku-4-5`, `gemini-2.5-pro`, `claude-3-5-sonnet-v2@20241022`) are preserved exact as passed without fuzzy substring translation or version rewriting.
3. **Invalid Model Error**: Unrecognized or unsupported model requests fail fast with an explicit `Error` listing all valid model IDs.

### Family Mapping Dictionary (`LATEST_MODEL_FAMILIES`)

Defined in [`packages/core/src/config/models.ts`](../../packages/core/src/config/models.ts):

| Family Alias | Mapped Model ID           | Constant                 |
| ------------ | ------------------------- | ------------------------ |
| `opus`       | `claude-opus-5`           | `CLAUDE_OPUS_5_MODEL`    |
| `sonnet`     | `claude-sonnet-5`         | `CLAUDE_SONNET_5_MODEL`  |
| `haiku`      | `claude-haiku-4-5`        | `CLAUDE_HAIKU_4_5_MODEL` |
| `pro`        | `gemini-3.1-pro-preview`  | `PREVIEW_GEMINI_3_1_MODEL` |
| `flash`      | `gemini-3.6-flash`        |                          |
| `flash-lite` | `gemini-3.5-flash-lite`   |                          |
| `auto`       | `gemini-3.6-flash`        |                          |

### Implementation Snippet

```typescript
export function getLatestModelId(modelOrFamily: string): string {
  if (!modelOrFamily || typeof modelOrFamily !== 'string') {
    throw new Error(
      `Invalid model ID: "${modelOrFamily}". Valid models and families are: ${getValidModelIds().join(', ')}`,
    );
  }

  const normalized = modelOrFamily.trim().toLowerCase();

  // 1. Family alias lookup
  if (LATEST_MODEL_FAMILIES[normalized]) {
    return LATEST_MODEL_FAMILIES[normalized];
  }

  // 2. Exact model ID check
  if (isValidModelId(modelOrFamily.trim())) {
    return modelOrFamily.trim();
  }

  // 3. Fail fast with actionable valid model list
  throw new Error(
    `Unrecognized model ID: "${modelOrFamily}". Valid models and families are: ${getValidModelIds().join(', ')}`,
  );
}
```

## 4. Content Generator Stream Mapping

[`AnthropicContentGenerator`](../../packages/core/src/core/anthropicContentGenerator.ts)
implements the `ContentGenerator` interface, converting bidirectional stream
events between Gemini CLI's expected `GenerateContentParameters` and Anthropic's
`MessageStreamEvent` format.

### Parameter Mapping (`mapRequestToAnthropic`)

- **System Instruction**: Extracts system instructions from `request.config` and
  maps them to Anthropic's top-level `system` parameter.
- **Messages & Role Normalization**: Converts Gemini roles (`model`) to
  Anthropic roles (`assistant`), mapping text parts, inline image data, tool
  calls (`tool_use`), and tool execution results (`tool_result`).
- **Tools**: Translates Gemini `functionDeclarations` into Anthropic `tools`
  schema specifications.

### Stream Response Event Translation

`AnthropicContentGenerator` yields `GenerateContentResponse` objects in real
time as stream chunks arrive:

- **`message_start`**: Captures input token counts and logs remote provider
  acknowledgment.
- **`content_block_delta`**: Emits text chunks (`text_delta`) or accumulates
  JSON for tool call inputs (`input_json_delta`).
- **`content_block_stop`**: Emits structured function call objects when tool
  blocks finish.
- **`message_delta`**: Maps Anthropic `stop_reason` (`end_turn`, `tool_use`,
  `max_tokens`) to Gemini `finishReason` (`STOP`, `MAX_TOKENS`) and emits final
  usage metadata.

---

## 5. Troubleshooting & Known Error Patterns

### Issue: `Model "claude-sonnet-5" is not available in region "global"`

```text
Model "claude-sonnet-5" is not available in region "global".
To see which models are available in this region, please visit:
https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations
/model to switch models.
```

**Root Cause**:
- This error occurs when an unmapped legacy or full model string (such as `claude-3-5-sonnet-v2@20241022`) is passed to Vertex AI instead of the canonical `claude-sonnet-5`.
- Vertex AI returns an HTTP 404 (`ModelNotFoundError`). `useQuotaAndFallback.ts` catches this 404 and constructs an error message formatted with `GOOGLE_CLOUD_LOCATION` (`"global"`), making an unmapped model ID look like a regional endpoint failure.

**Resolution**:
- Ensure all model selection paths pass the input through `resolveModel(requestedModel)` to resolve variant strings to `CLAUDE_SONNET_5_MODEL` (`claude-sonnet-5`) or `CLAUDE_OPUS_5_MODEL` (`claude-opus-5`).
- Keep `GOOGLE_CLOUD_LOCATION="global"` set as required for Anthropic models on Vertex AI.

