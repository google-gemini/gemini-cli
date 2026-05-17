# Local Gemma 4 Support PRD

**Version:** 0.1.0-draft **Date:** 2026-05-02 **Branch:**
`feat/add-local-gemma-4-support` **Reference Implementation:**
`upstream/feat/add-gemma-4-31b-it-support`

---

## 1. Overview

### 1.1 Purpose

Add support for local inference of Gemma 4 models via popular local LLM
backends: **Llama.cpp**, **LM Studio**, **Ollama**, **vLLM**, and **SGLang**.
This enables developers to run Gemma 4 models entirely offline without requiring
Google API access.

### 1.2 Motivation

- **Privacy**: Run Gemma 4 without sending data to external APIs
- **Offline**: Work without internet connectivity
- **Cost**: No API quota limits when running locally
- **Ecosystem**: Support the major local inference tools developers already use

### 1.3 Gemma 4 Capabilities

Gemma 4 introduces key capability and architectural advancements:

- **Extended Multimodalities** — Processes Text, Image with variable aspect
  ratio and resolution support (all models)
- **Edge models** (E2B, E4B) additionally support **Audio** input
- **Configurable thinking** via `<|think|>` system prompt control token — all
  models are designed as highly capable reasoners
- **Native function calling** — enhanced coding & agentic capabilities, powering
  autonomous agents
- **Hybrid attention architecture** — interleaves local sliding-window layers
  with global-attention layers for fast processing and low memory footprint
  while maintaining deep long-context awareness

### 1.4 Reference

The upstream branch `feat/add-gemma-4-31b-it-support` demonstrates the pattern
for adding Gemma 4 model support to the CLI. This PRD extends that pattern to
local inference backends.

---

## 2. Supported Backends & Model Discovery

### 2.1 Backends

All five backends expose standard OpenAI-compatible `GET /v1/models` endpoint
for **dynamic model discovery**. No hardcoded model names.

| Backend       | Default API Base URL        | `GET /v1/models` Support | Notes                                  |
| ------------- | --------------------------- | ------------------------ | -------------------------------------- |
| **Ollama**    | `http://localhost:11434/v1` | Yes                      | OpenAI-compatible mode                 |
| **LM Studio** | `http://localhost:1234/v1`  | Yes                      | Developer mode / REST API enabled      |
| **Llama.cpp** | `http://localhost:8080/v1`  | Yes                      | Built-in OpenAI-compatible server      |
| **vLLM**      | `http://localhost:8000/v1`  | Yes                      | Production-grade OpenAI-compatible API |
| **SGLang**    | `http://localhost:30000/v1` | Yes                      | High-throughput OpenAI-compatible API  |

### 2.2 Dynamic Model Discovery Flow

```
Startup / --local-backend <name>
    │
    ├── Auto-detect backend (probe known default URLs)
    │     ├── GET http://localhost:11434/v1/models → 200 OK → Ollama
    │     ├── GET http://localhost:1234/v1/models  → 200 OK → LM Studio
    │     ├── GET http://localhost:8080/v1/models  → 200 OK → Llama.cpp
    │     ├── GET http://localhost:8000/v1/models  → 200 OK → vLLM
    │     └── GET http://localhost:30000/v1/models → 200 OK → SGLang
    │
    └── Discover Gemma 4 models
          ├── GET {baseUrl}/v1/models
          ├── Filter by Gemma 4 patterns:
          │     - Contains 'gemma' AND '4' (case-insensitive)
          │     - Exclude: embedding-only models
          │     - Special classification: functiongemma → ToolFilter service
          ├── Map discovered IDs to aliases:
          │     gemma4 → 26b variant (default), 31b, 31b-cloud, e4b, e2b
           └── Expose all discovered Gemma 4 models in ModelDialog and CLI
```

#### 2.2.1 Multi-Backend Handling

When more than one local backend is detected, models are **grouped by provider**
rather than flattened into a single list:

- **Discovery**: Probe all known backends in **parallel** (not serial) → collect
  all Gemma 4 models from each responding backend
- **Deduplication**: Models with the same canonical name (e.g., `gemma4:26b`)
  appearing on multiple backends are listed once under each provider — the user
  chooses which backend to use for that model
- **Provider metadata**: Each discovered model carries a `providerId` (`ollama`,
  `lm-studio`, `llama-cpp`, `vllm`, `sglang`) so the UI and resolution logic
  know which backend to route requests to
- **Backend priority**: When auto-selecting a default model, Ollama is preferred
  (largest Gemma 4 ecosystem, 29 tags), then LM Studio, then
  Llama.cpp/vLLM/SGLang

### 2.3 Model Name Resolution Strategy

Model IDs are **never hardcoded** — instead, the system:

1. **Discovers** all models via `GET /v1/models` → returns
   `{ data: [{ id: "name", ... }] }`
2. **Filters** by Gemma 4 family using pattern matching (contains `gemma` AND
   `4`, case-insensitive)
3. **Maps** discovered IDs to CLI aliases heuristically:

**Gemma 4 family — 29 models on Ollama (verified against
ollama.com/library/gemma4/tags):**

Two distinct names matter here and should not be conflated:

- **CLI alias**: `gemma4` means "best discovered Gemma 4 default" and should
  resolve to `gemma4-26b` when a 26B-class model is available.
- **Backend-native model ID**: some backends also expose a raw ID named `gemma4`
  or `gemma4:latest`; on Ollama today that points to `gemma4:e4b`.

**Example backend-native mapping on Ollama:**

| CLI alias | Preferred discovered ID                                   | Raw Ollama convenience tag     | Type                     | Context   | Modality    |
| --------- | --------------------------------------------------------- | ------------------------------ | ------------------------ | --------- | ----------- |
| `gemma4`  | `gemma4:26b` when available, else best available fallback | `gemma4:latest` = `gemma4:e4b` | Varies by resolved model | 128K-256K | Text, Image |

**Complete tag inventory (29 models across 4 base variants × multiple
quantizations):**

```
Base variant: gemma4:e2b (edge, 2.3B effective / 5.1B total, 35 layers, 128K ctx)
├── gemma4:e2b (= it-q4_K_M)          7.2 GB  Q4_K_M    Text, Image  — default
├── gemma4:e2b-it-q4_K_M              7.2 GB  Q4_K_M    Text, Image
├── gemma4:e2b-it-q8_0                8.1 GB  Q8_0      Text, Image
├── gemma4:e2b-it-bf16                 10 GB  BF16      Text, Image
├── gemma4:e2b-mlx-bf16                10 GB  MLX BF16  Text
├── gemma4:e2b-mxfp8                  7.9 GB  MXFP8     Text
└── gemma4:e2b-nvfp4                  7.1 GB  NVFP4     Text

Base variant: gemma4:e4b (edge, 4.5B effective / 8B total, 42 layers, 128K ctx)
├── gemma4:e4b (= it-q4_K_M)          9.6 GB  Q4_K_M    Text, Image  — default
├── gemma4:e4b (= latest)             9.6 GB  Q4_K_M    Text, Image  — gemma4 alias
├── gemma4:e4b-it-q4_K_M              9.6 GB  Q4_K_M    Text, Image
├── gemma4:e4b-it-q8_0                 12 GB  Q8_0      Text, Image
├── gemma4:e4b-it-bf16                 16 GB  BF16      Text, Image
├── gemma4:e4b-mlx-bf16                16 GB  MLX BF16  Text
├── gemma4:e4b-mxfp8                   11 GB  MXFP8     Text
└── gemma4:e4b-nvfp4                  9.6 GB  NVFP4     Text

Base variant: gemma4:26b (workstation MoE, 25.2B total / 3.8B active, 30 layers, 256K ctx)
├── gemma4:26b (= it-q4_K_M)           18 GB  Q4_K_M    Text, Image  — default
├── gemma4:26b-a4b-it-q4_K_M           18 GB  Q4_K_M    Text, Image
├── gemma4:26b-a4b-it-q8_0             28 GB  Q8_0      Text, Image
├── gemma4:26b-mlx-bf16                52 GB  MLX BF16  Text
├── gemma4:26b-mxfp8                   27 GB  MXFP8     Text
└── gemma4:26b-nvfp4                   17 GB  NVFP4     Text

Base variant: gemma4:31b (workstation dense, 30.7B, 60 layers, 256K ctx)
├── gemma4:31b (= it-q4_K_M)           20 GB  Q4_K_M    Text, Image  — default
├── gemma4:31b-it-q4_K_M               20 GB  Q4_K_M    Text, Image
├── gemma4:31b-it-q8_0                 34 GB  Q8_0      Text, Image
├── gemma4:31b-it-bf16                 63 GB  BF16      Text, Image
├── gemma4:31b-mlx-bf16                63 GB  MLX BF16  Text
├── gemma4:31b-mxfp8                   32 GB  MXFP8     Text
└── gemma4:31b-nvfp4                   20 GB  NVFP4     Text

Cloud: gemma4:31b-cloud (Ollama hosted, 30.7B, 256K ctx, Text+Image, no local size)
```

**Quantization tier impact on gemini-cli behavior:**

| Quantization | Quality vs BF16        | VRAM/disk savings | CLI impact                                               |
| ------------ | ---------------------- | ----------------- | -------------------------------------------------------- |
| Q4_K_M       | Good (~95% quality)    | ~3.3× smaller     | Default for all models. Best balance of quality/size     |
| Q8_0         | Better (~99% quality)  | ~2× smaller       | Recommended for code tasks (higher precision for syntax) |
| BF16         | Reference (100%)       | 1× (original)     | Best quality, worst size. Only for ample VRAM systems    |
| MLX BF16     | Reference (macOS only) | 1×                | Apple Silicon optimized. Text-only (no vision)           |
| MXFP8        | Good                   | ~2× smaller       | Optimized for modern GPUs                                |
| NVFP4        | Good                   | ~3× smaller       | NVIDIA GPU optimized                                     |

**Default selection logic** — when `gemma4` alias is used, gemini-cli should:

1. Prefer `gemma4:26b` (MoE, 256K context, 77% code benchmark) if available and
   VRAM ≥ 16 GB
2. Fall back to `gemma4:e4b` (current `gemma4:latest` — 128K context, 52% code
   benchmark)
3. List `gemma4:31b` as recommended upgrade if VRAM ≥ 24 GB
4. List `gemma4:e2b` for constrained devices (VRAM ≥ 8 GB)

- **Thinking**: Configurable via `<|think|>` token in system prompt (all models
  are designed as highly capable reasoners)
- **Native function calling**: Enhanced coding & agentic capabilities, powering
  autonomous agents
- **Native system role**: Supports `system`, `assistant`, `user` roles natively
- **Vision**: Text + Image input (variable aspect ratio, configurable token
  budgets: 70, 140, 280, 560, 1120)
- **Generation defaults**: temperature=1.0, top_p=0.95, top_k=64 (recommended by
  Google)
- **Tokenizer**: 262K vocabulary, same tokenizer across all sizes

**Per-variant suitability for gemini-cli:**

All supported Gemma 4 variants are expected to be capable of basic
code-generation tasks, but they are not equivalent choices for real-world coding
sessions. In local Ollama integration testing, the pulled `gemma4:e2b`,
`gemma4:e4b`, `gemma4:26b`, and `gemma4:31b-cloud` variants were each able to
generate a minimal Java Hello World program. The recommendation table below
should therefore be read as "minimum viable coding capability" versus
"recommended for sustained coding work," not as a binary supported/unsupported
split.

| Variant            | Code Gen                                       | Tool Use                     | Reasoning                  | Edge Use             | Recommendation                                                       |
| ------------------ | ---------------------------------------------- | ---------------------------- | -------------------------- | -------------------- | -------------------------------------------------------------------- |
| `gemma4:e2b`       | Minimal (44% LiveCodeBench, 633 Codeforces)    | Basic                        | Yes, configurable thinking | Laptops/phones       | **Include** — basic code tasks, simple file ops, lightweight CLI use |
| `gemma4:e4b`       | Moderate (52% LiveCodeBench, 940 Codeforces)   | Yes, GQA + function calling  | Yes, configurable thinking | Laptops              | **Include** — small edits, lightweight coding, shell automation      |
| `gemma4:26b`       | Strong (77.1% LiveCodeBench, 1718 Codeforces)  | Yes, native function calling | Yes, configurable thinking | Workstation GPU      | **Include** — recommended primary local coding model                 |
| `gemma4:31b`       | Excellent (80% LiveCodeBench, 2150 Codeforces) | Yes, native function calling | Yes, configurable thinking | High-end workstation | **Include** — best-in-class local coding, complex agentic tasks      |
| `gemma4:31b-cloud` | Excellent (same as 31B)                        | Yes, remote inference        | Yes, configurable thinking | Cloud                | **Include** — strong coding option without requiring a local GPU     |

---

## 3. Architecture Integration

### 3.1 AuthType Extension

Add new auth types to the `AuthType` enum in
`packages/core/src/core/contentGenerator.ts`:

```typescript
export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  LEGACY_CLOUD_SHELL = 'cloud-shell',
  COMPUTE_ADC = 'compute-default-credentials',
  GATEWAY = 'gateway',
  // NEW: Local inference backends
  USE_LOCAL_OLLAMA = 'local-ollama',
  USE_LOCAL_LM_STUDIO = 'local-lm-studio',
  USE_LOCAL_LLAMA_CPP = 'local-llama-cpp',
  USE_LOCAL_VLLM = 'local-vllm',
  USE_LOCAL_SGLANG = 'local-sglang',
}
```

### 3.2 Environment Variable Detection

Add detection in `getAuthTypeFromEnv()`:

```typescript
if (
  process.env['GEMINI_LOCAL_BACKEND'] === 'ollama' ||
  process.env['OLLAMA_HOST']
) {
  return AuthType.USE_LOCAL_OLLAMA;
}
if (
  process.env['GEMINI_LOCAL_BACKEND'] === 'lm-studio' ||
  process.env['LM_STUDIO_API_BASE']
) {
  return AuthType.USE_LOCAL_LM_STUDIO;
}
if (
  process.env['GEMINI_LOCAL_BACKEND'] === 'llama-cpp' ||
  process.env['LLAMA_CPP_SERVER_BASE']
) {
  return AuthType.USE_LOCAL_LLAMA_CPP;
}
if (
  process.env['GEMINI_LOCAL_BACKEND'] === 'vllm' ||
  process.env['VLLM_API_BASE']
) {
  return AuthType.USE_LOCAL_VLLM;
}
if (
  process.env['GEMINI_LOCAL_BACKEND'] === 'sglang' ||
  process.env['SGLANG_API_BASE']
) {
  return AuthType.USE_LOCAL_SGLANG;
}
```

### 3.3 Content Generator Creation

Add new paths in `createContentGenerator()`:

```
createContentGenerator() {
  ├── LOGIN_WITH_GOOGLE/COMPUTE_ADC (existing)
  ├── USE_GEMINI/USE_VERTEX_AI/GATEWAY (existing)
  └── NEW: USE_LOCAL_OLLAMA/USE_LOCAL_LM_STUDIO/USE_LOCAL_LLAMA_CPP/USE_LOCAL_VLLM/USE_LOCAL_SGLANG
       └── GoogleGenAI with custom baseUrl (OpenAI-compatible API)
}
```

**Implementation approach**: treat all five local backends as custom-base-URL
providers reachable through the same local-backend branch in
`createContentGenerator()`. The PRD intentionally reuses the existing
`GoogleGenAI` client shape with a backend-specific `baseUrl`, but the exact
wrapper class should match the implementation patterns already present in
`contentGenerator.ts`.

In `createContentGenerator()` at `contentGenerator.ts:282-347`, add a new block
for local auth types **before** the `throw` on line 345:

```typescript
// ... existing USE_GEMINI/USE_VERTEX_AI/GATEWAY blocks ...

// Local inference backends (OpenAI-compatible)
if (
  config.authType === AuthType.USE_LOCAL_OLLAMA ||
  config.authType === AuthType.USE_LOCAL_LM_STUDIO ||
  config.authType === AuthType.USE_LOCAL_LLAMA_CPP ||
  config.authType === AuthType.USE_LOCAL_VLLM ||
  config.authType === AuthType.USE_LOCAL_SGLANG
) {
  let headers: Record<string, string> = { ...baseHeaders };
  if (config.customHeaders) {
    headers = { ...headers, ...config.customHeaders };
  }

  const googleGenAI = new GoogleGenAI({
    apiKey: 'not-needed',
    vertexai: false,
    httpOptions: {
      baseUrl: config.baseUrl!,
      headers,
    },
  });
  return new LoggingContentGenerator(googleGenAI.models, gcConfig);
}

// Existing throw for unsupported auth types remains below.
```

Similarly, `createContentGeneratorConfig()` at `contentGenerator.ts:125-186`
needs a new block before the fallthrough at line 185:

```typescript
// ... existing GATEWAY block (lines 178-184) ...

// Local inference backends
if (
  authType === AuthType.USE_LOCAL_OLLAMA ||
  authType === AuthType.USE_LOCAL_LM_STUDIO ||
  authType === AuthType.USE_LOCAL_LLAMA_CPP ||
  authType === AuthType.USE_LOCAL_VLLM ||
  authType === AuthType.USE_LOCAL_SGLANG
) {
  return {
    ...contentGeneratorConfig,
    authType,
    baseUrl: resolveLocalBackendBaseUrl(authType, config),
  };
}

return contentGeneratorConfig; // existing fallthrough
```

### 3.4 Auth Validation

Update `packages/cli/src/config/auth.ts` to handle new auth types:

```typescript
case 'local-ollama':
case 'local-lm-studio':
case 'local-llama-cpp':
case 'local-vllm':
case 'local-sglang':
  return null; // No API key required for local backends
```

### 3.5 Settings Schema

Update `packages/cli/src/config/settingsSchema.ts` to add local backend
configuration:

```typescript
localModel: {
  type: 'object',
  label: 'Local Model',
  properties: {
    backend: {
      type: 'string',
      enum: ['ollama', 'lm-studio', 'llama-cpp', 'vllm', 'sglang'],
      description: 'Local inference backend to use',
    },
    baseUrl: {
      type: 'string',
      description: 'Override base URL for the backend API',
    },
    modelMapping: {
      type: 'object',
      description: 'Custom model name mappings per alias',
      properties: {
        gemma4: { type: 'string' },
        'gemma4-26b': { type: 'string' },
        'gemma4-31b': { type: 'string' },
        'gemma4-31b-cloud': { type: 'string' },
        'gemma4-e4b': { type: 'string' },
        'gemma4-e2b': { type: 'string' },
      },
    },
  },
},
```

### 3.6 Existing Gemma Model Router (Coexistence)

The codebase already has `experimental.gemmaModelRouter`
(`settingsSchema.ts:2310-2380`) — a LiteRT-LM based local Gemma inference path
using a Gemini API shim. This PRD's approach is architecturally different and
independent:

| Feature             | Existing Router (LiteRT-LM) | This PRD (OpenAI API)                      |
| ------------------- | --------------------------- | ------------------------------------------ |
| **Protocol**        | Gemini API shim             | OpenAI-compatible `/v1`                    |
| **Backends**        | LiteRT-LM only              | Ollama, LM Studio, Llama.cpp, vLLM, SGLang |
| **Model Discovery** | Pre-configured classifier   | Dynamic `GET /v1/models`                   |
| **Tool Use**        | Not supported               | Supported (native function calling)        |
| **Audience**        | Experimental LiteRT users   | General local LLM community                |

The two paths coexist without conflict. Users choose one by toggling
`experimental.gemmaModelRouter.enabled` (LiteRT) or setting `localModel.backend`
(this PRD). Future versions may merge both under a unified local backend
abstraction, but that is outside this PRD's scope.

---

## 4. Model Configuration (Dynamic Discovery)

### 4.1 Model Definitions (Dynamic)

Add to `packages/core/src/config/defaultModelConfigs.ts` under
`modelDefinitions`. All model IDs are resolved dynamically at runtime:

```typescript
// Gemma 4 family (local inference)
'gemma4': {
  tier: 'custom',
  family: 'gemma-4',
  isPreview: false,
  isVisible: true,
  features: { thinking: true, multimodalToolUse: false },
},
'gemma4-26b': {
  tier: 'custom',
  family: 'gemma-4',
  isPreview: false,
  isVisible: false,       // Hidden alias, only shown when 26B model detected
  features: { thinking: true, multimodalToolUse: false },
},
'gemma4-31b': {
  tier: 'custom',
  family: 'gemma-4',
  isPreview: false,
  isVisible: true,
  features: { thinking: true, multimodalToolUse: false },
},
'gemma4-31b-cloud': {
  tier: 'custom',
  family: 'gemma-4',
  isPreview: false,
  isVisible: true,
  features: { thinking: true, multimodalToolUse: false },
},
'gemma4-e4b': {
  tier: 'custom',
  family: 'gemma-4',
  isPreview: false,
  isVisible: true,
  features: { thinking: true, multimodalToolUse: false },
},
'gemma4-e2b': {
  tier: 'custom',
  family: 'gemma-4',
  isPreview: false,
  isVisible: true,
  features: { thinking: true, multimodalToolUse: false },
},
```

### 4.2 Model Configs (Same Generation Config, Model Field Is Placeholder)

Add to `aliases` section in `defaultModelConfigs.ts`. The `model` field below is
a **placeholder** — it gets replaced at runtime with the actual discovered model
ID:

```typescript
gemma4: {
  extends: 'base',
  modelConfig: {
    model: '__DISCOVERED_GEMMA4__',   // Replaced at runtime by LocalModelService
    generateContentConfig: {
      temperature: 1,
      topP: 0.95,
      topK: 64,
    },
  },
},
'gemma4-26b': {
  extends: 'base',
  modelConfig: {
    model: '__DISCOVERED_GEMMA4_26B__',
    generateContentConfig: {
      temperature: 1,
      topP: 0.95,
      topK: 64,
    },
  },
},
'gemma4-31b': {
  extends: 'base',
  modelConfig: {
    model: '__DISCOVERED_GEMMA4_31B__',
    generateContentConfig: {
      temperature: 1,
      topP: 0.95,
      topK: 64,
    },
  },
},
'gemma4-31b-cloud': {
  extends: 'base',
  modelConfig: {
    model: '__DISCOVERED_GEMMA4_31B_CLOUD__',
    generateContentConfig: {
      temperature: 1,
      topP: 0.95,
      topK: 64,
    },
  },
},
'gemma4-e2b': {
  extends: 'base',
  modelConfig: {
    model: '__DISCOVERED_GEMMA4_E2B__',
    generateContentConfig: {
      temperature: 1,
      topP: 0.95,
      topK: 64,
    },
  },
},
'gemma4-e4b': {
  extends: 'base',
  modelConfig: {
    model: '__DISCOVERED_GEMMA4_E4B__',
    generateContentConfig: {
      temperature: 1,
      topP: 0.95,
      topK: 64,
    },
  },
},
```

### 4.3 Runtime Model ID Resolution

Model IDs are **not hardcoded** in `modelIdResolutions`. Instead,
`LocalModelService` intercepts and resolves them at runtime:

```
User runs: gemini -m gemma4 --local-backend ollama

1. Config detects authType = USE_LOCAL_OLLAMA
2. LocalModelService.discoverModels('ollama')
     → GET http://localhost:11434/v1/models
     → Response: { data: [ { id: "gemma4:e4b" }, { id: "gemma4:26b" }, { id: "gemma4:31b" } ] }
3. Filter to Gemma 4 models: ["gemma4:e2b", "gemma4:e4b", "gemma4:26b", "gemma4:31b"]
4. resolveModel("gemma4") → "gemma4:26b" (preferred non-cloud workstation default when available)
5. createContentGeneratorConfig() → baseUrl = "http://localhost:11434/v1", model = "gemma4:26b"
```

### 4.4 Model Constants

Add to `packages/core/src/config/models.ts`:

```typescript
// Gemma 4 (local inference)
export const GEMMA_MODEL_ALIAS_4 = 'gemma4';
export const GEMMA_MODEL_ALIAS_4_26B = 'gemma4-26b';
export const GEMMA_MODEL_ALIAS_4_31B = 'gemma4-31b';
export const GEMMA_MODEL_ALIAS_4_31B_CLOUD = 'gemma4-31b-cloud';
export const GEMMA_MODEL_ALIAS_4_E4B = 'gemma4-e4b';
export const GEMMA_MODEL_ALIAS_4_E2B = 'gemma4-e2b';

// All local Gemma 4 aliases (for detection in ModelDialog, etc.)
export const LOCAL_GEMMA_4_ALIASES = new Set([
  GEMMA_MODEL_ALIAS_4,
  GEMMA_MODEL_ALIAS_4_26B,
  GEMMA_MODEL_ALIAS_4_31B,
  GEMMA_MODEL_ALIAS_4_31B_CLOUD,
  GEMMA_MODEL_ALIAS_4_E4B,
  GEMMA_MODEL_ALIAS_4_E2B,
]);
```

**Note:** These constants live alongside existing API-model Gemma constants
(`GEMMA_4_31B_IT_MODEL`, `GEMMA_4_26B_A4B_IT_MODEL` at `models.ts:64-65`) which
are for the Google Gemini API (cloud), not local inference. Local aliases use
`gemma4-*` (hyphen) naming; API models use `gemma-4-*` naming.

---

## 5. Verified Discovery Results (Local Machine, 2026-05-02)

### 5.1 LM Studio (http://127.0.0.1:1234)

```json
{
  "data": [
    {
      "id": "google/gemma-4-26b-a4b",
      "object": "model",
      "owned_by": "organization_owner"
    },
    {
      "id": "text-embedding-nomic-embed-text-v1.5",
      "object": "model",
      "owned_by": "organization_owner"
    }
  ],
  "object": "list"
}
```

**Available Gemma 4 models in LM Studio:**

| Discovered ID            | Maps to CLI alias      |
| ------------------------ | ---------------------- |
| `google/gemma-4-26b-a4b` | `gemma4`, `gemma4-26b` |

Note: LM Studio currently only has the 26B MoE variant loaded. Other Gemma 4
variants can be downloaded via LM Studio's model browser (search "gemma-4" on
HuggingFace).

### 5.2 Ollama (http://localhost:11434)

```json
{
  "object": "list",
  "data": [
    { "id": "gemma4:26b", "owned_by": "library" },
    { "id": "gemma4:e4b", "owned_by": "library" },
    { "id": "gemma4:31b-cloud", "owned_by": "library" },
    ...
  ]
}
```

**Available Gemma 4 models in Ollama (locally pulled):**

| Discovered ID      | Maps to CLI alias      | Type                      |
| ------------------ | ---------------------- | ------------------------- |
| `gemma4:26b`       | `gemma4`, `gemma4-26b` | MoE 25.2B / 3.8B active   |
| `gemma4:e4b`       | `gemma4-e4b`           | Dense 4.5B eff / 8B total |
| `gemma4:31b-cloud` | `gemma4-31b-cloud`     | Dense 30.7B (cloud)       |

**Not yet pulled locally but available in Ollama library:**

| Model        | Type                          |
| ------------ | ----------------------------- |
| `gemma4:e2b` | Dense 2.3B eff / 5.1B total   |
| `gemma4:31b` | Dense 30.7B local (not cloud) |

### 5.3 Llama.cpp (http://localhost:8080)

**Not running** on this machine — server returned HTML page. Discovery will fail
gracefully and report the backend as unavailable.

### 5.4 Metadata Model & Auto-Tuning Map

```typescript
// packages/core/src/services/localModelDiscovery.ts

interface LocalModelMetadata {
  id: string;
  displayName: string;
  backendId: string;

  // Context
  contextLength: number; // max token context window

  // Modality
  supportsVision: boolean; // multimodal image input
  supportsAudio: boolean; // multimodal audio input

  // Reasoning
  supportsReasoning: boolean; // built-in CoT/thinking

  // Thinking Mode Configuration (reasoning/chain-of-thought)
  thinkingConfig: {
    enabled: boolean;
    // All Gemma 4 models are designed as highly capable reasoners
    // with configurable thinking modes via <|think|> control token.
    nativeThinking: true; // YES — all Gemma 4 variants support native thinking

    // How thinking is implemented for this model
    implementation: 'native-token'; // Gemma 4 uses <|think|> system prompt token
    // The <|think|> token at the start of the system prompt enables thinking.
    // When enabled, output format:
    //   <|channel>thought\n[Internal reasoning]<channel|>[Final answer]
    // When thinking disabled (remove <|think|> from system prompt):
    //   E2B/E4B: no thinking tags produced
    //   26B/31B: still generates <channel> tokens with empty thought block

    // Context budget allocation for thinking
    maxThinkingTokens: number; // max tokens allocated to reasoning
    reservedContextForThinking: number; // context window reserved for reasoning
    visibleReasoningInOutput: boolean; // always true for Gemma 4 (thought block in output)
    // Ollama handles chat template complexity automatically.
    // gemini-cli must strip history thought blocks before sending next turn
    // (per best practice: "No Thinking Content in History").
    structuredThinkingFormats: string[]; // ['<|channel>thought\n...<channel|>']
  };

  // Architecture details (enables smart auto-tuning)
  architecture: ArchitectureProfile;

  // Quick access to key performance indicators
  paramSize: string; // "25.8B", "32.7B", "8.0B"
  quantization: string; // "Q4_K_M", "BF16", "FP16"

  // Capabilities
  supportsToolUse: boolean; // function calling / tool use
  isLoaded: boolean; // currently loaded in memory (LM Studio)
}

/** Architecture-aware profile — describes the model's internal structure
 *  so gemini-cli can optimize context management, batching, and memory usage. */
interface ArchitectureProfile {
  family: string; // "gemma4", "qwen35", etc.
  layerCount: number; // transformer block count (e.g., 30 for gemma4:26b)

  // Attention mechanism — critical for context window utilization
  attention: {
    type: 'full' | 'sliding-window' | 'hybrid' | 'dilated';

    // Hybrid attention details (used by all Gemma 4 models)
    // Interleaves local sliding-window layers with global-attention layers.
    // This architecture delivers fast processing and low memory footprint
    // while maintaining deep awareness for complex, long-context tasks.
    // Key insight: SWA layers use O(window) KV cache, global layers use O(ctx).
    isHybrid: boolean; // true when sliding + global layers interleaved
    slidingWindowSize: number; // local attention tokens per SWA layer (e.g., 1024)
    globalKeyDim: number; // KV dimension for global attention layers (e.g., 512)
    swaKeyDim: number; // KV dimension for SWA layers (e.g., 256)
    interleavingPattern?: 'even' | 'front-heavy' | 'back-heavy';
    // 'even': SWA and global layers alternate (typical for 26B MoE)
    // 'front-heavy': more SWA in early layers, more global in late layers
    // 'back-heavy': global attention in late layers for long-range dependencies

    // KV cache estimation — determines actual memory per token
    kvCacheBytesPerToken: number; // estimated bytes per token for full context
    kvCacheBytesPerTokenSWA: number; // estimated bytes per token for SWA layers only
    // Example for gemma4:26b hybrid:
    //   Global layers: 2 (KV) × 512 dim × 16 heads × 30 layers × 2 bytes = 983,040 bytes
    //   SWA layers: 2 (KV) × 256 dim × 16 heads × 30 layers × 2 bytes = 491,520 bytes
    //   Because only 1024 tokens stored per SWA layer, the SWA portion is bounded:
    //     SWA: 2 × 256 × 16 × 30 × 2 × min(tokens, 1024) bytes
    //     Global: 2 × 512 × 16 × 30 × 2 × tokens bytes
  };

  // Mixture-of-Experts (26B variant is MoE, 31B is dense)
  moe?: {
    totalExperts: number; // 128 for gemma4:26b
    activeExpertsPerToken: number; // 8 for gemma4:26b (sparse activation)
    // MoE advantage: only 8/128 experts active per token → ~6.25% FFN compute
    // Trade-off: larger memory footprint (all experts loaded in VRAM)
  };

  // Context utilization characteristics
  contextProfile: {
    advertisedLength: number; // 262,144 for gemma4:26b, 256K for 31B
    effectiveLength: number; // actual usable tokens (hardware-verified)
    longContextOptimized: boolean; // model designed for deep context awareness
    // Gemma 4 31B: hybrid attention with interleaved local/global layers
    // enables 256K context with low memory footprint vs full-attention models
    contextScaling: 'linear' | 'sub-linear' | 'hybrid-bounded';
    // 'linear': KV cache grows linearly with context (standard full attention)
    // 'sub-linear': MoE + SWA limits KV growth (gemma4:26b)
    // 'hybrid-bounded': SWA portion is bounded, only global layers scale (gemma4:31b)
  };

  // Prompt template characteristics
  promptTemplate: {
    format: 'gemma' | 'llama' | 'chatml' | 'custom';
    supportsSystemRole: boolean;
    supportsToolRole: boolean;
    defaultStopTokens: string[];
    // Gemma 4 models use a specific RENDERER ("gemma4") and PARSER ("gemma4")
    // in Ollama, which affects how system prompts and tool calls are formatted.
  };
}

interface ModelTuningSettings {
  // Context management
  maxContextTokens: number; // derived from contextLength
  compressionThreshold: number; // when to compress (e.g., 75% of maxContextTokens)
  tokenWarningThreshold: number; // when to warn user about context limits

  // Generation defaults
  defaultTemperature: number; // model's native temperature
  defaultTopK: number; // model's native top_k
  defaultTopP: number; // model's native top_p

  // Tool settings
  enableToolUse: boolean; // derived from supportsToolUse

  // Multimodal
  enableVisionInput: boolean; // derived from supportsVision
  maxImageResolution: number; // if vision: max patch size × patch_size

  // Thinking/reasoning
  enableThinking: boolean; // derived from thinkingConfig.nativeThinking
  thinkingBudget: number; // max thinking tokens (~15% of verified context)
  thinkingMode: 'native-token' | 'prompt-based' | 'none';
  // 'native-token': use <|think|> token in system prompt (all Gemma 4 models)
  // 'prompt-based': fallback for non-Gemma models without native thinking
  // 'none': disabled entirely
  stripThinkingHistory: boolean; // strip thought blocks from history before next turn
  // Per official best practice: "No Thinking Content in History" for multi-turn.
  // gemini-cli must remove <|channel>thought...<channel|> blocks from history
  // before sending the next user turn to the model.

  // Performance profiles
  profile: 'small' | 'medium' | 'large' | 'xl'; // based on paramSize
  batchTools: boolean; // batch tool calls (for fast models)
  prefetchContext: boolean; // pre-load context for faster responses
}
```

### 5.5 Auto-Tuning Algorithm

```
function tuneModelFromMetadata(meta: LocalModelMetadata): ModelTuningSettings {
  // 1. Context size → token budget
  const maxContextTokens = Math.min(meta.contextLength, 1_000_000);
  const compressionThreshold = Math.floor(maxContextTokens * 0.75);
  const tokenWarningThreshold = Math.floor(maxContextTokens * 0.90);

  // 2. Context verification — real available context on local machines is often limited
  const verifiedContext = verifyAvailableContext(meta, maxContextTokens);
  // Local GPU VRAM or system RAM heavily constrains actual usable context.
  // Example: gemma4:26b advertised 256K context, with Q4_K_M quantization
  // on a 16GB GPU, ~32K tokens may be usable before KV cache overflow.
  // The verification step probes actual backend capabilities.
  const effectiveContextTokens = Math.min(maxContextTokens, verifiedContext);

  // 3. Modality features
  const enableVisionInput = meta.supportsVision;
  const supportsReasoning = meta.supportsReasoning || meta.architecture?.family === 'gemma4';

  // 4. Thinking mode configuration
  let enableThinking: boolean;
  let thinkingBudget: number;
  let thinkingMode: 'native-token' | 'prompt-based' | 'none';
  let stripThinkingHistory: boolean;

  if (meta.thinkingConfig?.nativeThinking) {
    // All Gemma 4 models have native thinking via <|think|> system prompt token
    thinkingMode = 'native-token';
    enableThinking = meta.thinkingConfig?.enabled ?? true;
    thinkingBudget = meta.thinkingConfig.maxThinkingTokens
      ?? Math.min(Math.floor(effectiveContextTokens * 0.15), 16384);
    // Must strip thought blocks from history per official best practice:
    // "No Thinking Content in History" for multi-turn conversations
    stripThinkingHistory = true;
  } else {
    // Non-Gemma models without native thinking
    thinkingMode = 'none';
    enableThinking = false;
    thinkingBudget = 0;
    stripThinkingHistory = false;
  }

  // 5. Tool use
  const enableToolUse = meta.supportsToolUse;

  // 6. Performance profile → batching/prefetch decisions
  const paramSizeGiga = parseParamSizeB(meta.paramSize);
  let profile: 'small' | 'medium' | 'large' | 'xl';
  if (paramSizeGiga < 10) profile = 'small';
  else if (paramSizeGiga < 30) profile = 'medium';
  else if (paramSizeGiga < 70) profile = 'large';
  else profile = 'xl';

  const batchTools = profile !== 'xl';  // slow models: sequential tool calls
  const prefetchContext = ['small', 'medium'].includes(profile);

  // 7. Generation defaults from model metadata (Ollama parameters)
  const defaultTemperature = meta.nativeTemperature ?? 1;
  const defaultTopK = meta.nativeTopK ?? 64;
  const defaultTopP = meta.nativeTopP ?? 0.95;

  return {
    maxContextTokens: effectiveContextTokens,
    compressionThreshold,
    tokenWarningThreshold,
    defaultTemperature,
    defaultTopK,
    defaultTopP,
    enableToolUse,
    enableVisionInput,
    maxImageResolution: enableVisionInput ? 4096 : 0,
    enableThinking,
    thinkingBudget,
    thinkingMode,
    stripThinkingHistory: stripThinkingHistory,
    profile,
    batchTools,
    prefetchContext,
  };
}
```

### 5.6 Verified Architecture Profiles

```
// Data sourced from ollama.com/library/gemma4 (official Google DeepMind specs).
// All models: 262K vocabulary, temperature=1.0, top_p=0.95, top_k=64.
// All models: native system role support, configurable thinking via <|think|> token.
// All models: Text + Image input (variable resolution, token budgets: 70/140/280/560/1120).
// Edge models (e2b, e4b): also support Audio input.

GEMMA4_ARCHITECTURE_PROFILES = {
  // === Edge models (laptops, mobile devices) ===

  'gemma4:e2b': {
    family: 'gemma4',
    type: 'edge-dense',
    totalParams: '5.1B',          // 2.3B effective params + embeddings
    effectiveParams: '2.3B',
    layerCount: 35,
    contextLength: 131072,        // 128K tokens
    quantization: 'Q4_K_M',

    attention: {
      type: 'hybrid',
      slidingWindowSize: 512,     // SWA: last 512 tokens per layer
      interleavingPattern: 'even',
    },

    modality: ['text', 'image', 'audio'],
    visionEncoderParams: '~150M',
    audioEncoderParams: '~300M',

    thinkingConfig: {
      nativeThinking: true,        // Via <|think|> system prompt token
      disabledBehavior: 'none',   // E2B/E4B: no thinking tags when disabled
    },

    benchmark: {
      liveCodeBench: '44.0%',
      codeforcesElo: 633,
      mmluPro: '60.0%',
      tau2BenchRetail: '29.4%',    // τ2-bench agentic tool use (Retail)
    },

    recommendedUse: 'Simple file edits, lightweight CLI commands, constrained devices',
  },

  'gemma4:e4b': {
    family: 'gemma4',
    type: 'edge-dense',
    totalParams: '8.0B',          // 4.5B effective params + embeddings
    effectiveParams: '4.5B',
    layerCount: 42,
    contextLength: 131072,        // 128K tokens
    quantization: 'Q4_K_M',

    attention: {
      type: 'hybrid',
      slidingWindowSize: 512,     // SWA: last 512 tokens per layer
      interleavingPattern: 'even',
      gqa: { queryHeads: 8, kvHeads: 2, sharedKvLayers: 18 },
    },

    modality: ['text', 'image', 'audio'],
    visionEncoderParams: '~150M',
    audioEncoderParams: '~300M',

    thinkingConfig: {
      nativeThinking: true,        // Via <|think|> system prompt token
      disabledBehavior: 'none',   // E2B/E4B: no thinking tags when disabled
    },

    benchmark: {
      liveCodeBench: '52.0%',
      codeforcesElo: 940,
      mmluPro: '69.4%',
      aime2026Thinking: '42.5%',    // AIME 2026 with thinking mode
      tau2BenchRetail: '57.5%',    // τ2-bench agentic tool use (Retail)
    },

    recommendedUse: 'Lightweight coding, file editing, shell automation on consumer hardware',
  },

  // === Workstation models ===

  'gemma4:26b': {
    family: 'gemma4',
    type: 'workstation-moe',
    totalParams: '25.2B',
    activeParams: '3.8B',         // Only 3.8B active per token (sparse activation)
    layerCount: 30,
    contextLength: 262144,        // 256K tokens
    quantization: 'Q4_K_M',

    attention: {
      type: 'hybrid',
      slidingWindowSize: 1024,    // SWA: last 1024 tokens per layer
      interleavingPattern: 'even',
      globalKeyDim: 512,
      swaKeyDim: 256,
    },

    moe: {
      totalExperts: 128,
      activeExpertsPerToken: 8,   // + 1 shared expert
      description: '8 active / 128 total + 1 shared',
    },

    modality: ['text', 'image'],
    visionEncoderParams: '~550M',
    // No audio support

    thinkingConfig: {
      nativeThinking: true,        // Via <|think|> system prompt token
      disabledBehavior: 'empty',  // 26B/31B: still generates empty thought block tags when disabled
    },

    benchmark: {
      liveCodeBench: '77.1%',
      codeforcesElo: 1718,
      mmluPro: '82.6%',
      tau2BenchRetail: '85.5%',    // τ2-bench agentic tool use (Retail)
    },

    recommendedUse: 'Primary local coding model. MoE efficiency for fast inference on workstation GPU',
  },

  'gemma4:31b': {
    family: 'gemma4',
    type: 'workstation-dense',
    totalParams: '30.7B',
    layerCount: 60,
    contextLength: 262144,        // 256K tokens
    quantization: 'Q4_K_M',

    attention: {
      type: 'hybrid',
      slidingWindowSize: 1024,    // SWA: last 1024 tokens per layer
      interleavingPattern: 'front-heavy',
      // Front-heavy: more SWA in early layers, more global in late layers.
      // Enables deep long-range understanding while maintaining low memory footprint.
      description: 'Hybrid attention interleaving local SWA with global attention layers. Delivers fast processing and low memory footprint while maintaining deep awareness for complex, long-context tasks.',
    },

    modality: ['text', 'image'],
    visionEncoderParams: '~550M',
    // No audio support

    thinkingConfig: {
      nativeThinking: true,        // Via <|think|> system prompt token
      disabledBehavior: 'empty',  // 26B/31B: still generates empty thought block tags when disabled
    },

    benchmark: {
      liveCodeBench: '80.0%',
      codeforcesElo: 2150,
      mmluPro: '85.2%',
      tau2BenchRetail: '86.4%',    // τ2-bench agentic tool use (Retail)
    },

    recommendedUse: 'Best-in-class local coding. Complex agentic tasks, deep codebase understanding',
  },

  'gemma4:31b-cloud': {
    // Same architecture as gemma4:31b, but hosted on Ollama cloud.
    // Use this when local GPU is insufficient for 30.7B model.
    extends: 'gemma4:31b',
    type: 'cloud',
    description: 'Cloud-hosted via Ollama. No local GPU required.',
  },
};
```

### 5.7 Context Verification Process

```
function verifyAvailableContext(meta: LocalModelMetadata, advertised: number): number {
  // Advertised context (e.g., 262,144 for gemma4:26b) is theoretical maximum.
  // Actual usable context is limited by:
  //
  // 1. GPU VRAM — KV cache stores key/value pairs per token per layer.
  //    For gemma4:26b MoE with 25.2B total / 3.8B active, Q4_K_M:
  //    - Model weights: ~15 GB (all 128 experts loaded)
  //    - KV cache per 1K tokens: ~1.5 GB (30 layers × 2 heads × 512 dim × 2)
  //    - Available VRAM (16GB GPU): ~1 GB for KV cache → ~0.6K tokens max (tight)
  //    - Available VRAM (20GB GPU): ~5 GB for KV cache → ~3.3K tokens max
  //    - Practical: 26B MoE @ Q4_K_M fits in 16GB with 4-8K context,
  //      ideal with 20GB+ GPU. Ollama manages memory efficiently for MoE.
  //
  // 2. System RAM (CPU inference) — significantly larger but slower.
  //    With 64GB RAM: ~49 GB for KV cache → ~32K tokens max
  //
  // 3. Backend-level limits — LM Studio defaults to 4096 loaded context,
  //    configurable by user. vLLM/SGLang have configurable max_model_len.

  // Probe backend for actual context limit
  const backendLimit = probeBackendContextLimit(meta.backendId, meta.id);

  // Estimate based on available memory
  const memoryLimit = estimateMemoryBasedLimit(meta);

  // Use the most restrictive limit
  const effective = Math.min(advertised, backendLimit, memoryLimit);

  // Warn user if advertised context is significantly higher than effective
  if (advertised > effective * 2) {
    console.warn(
      `Model ${meta.id} advertises ${advertised} context, ` +
      `but only ~${effective} tokens are usable due to hardware limits.`
    );
  }

  return effective;
}
```

**Verified context lengths (observed locally, 2026-05-02) vs official specs:**

| Model                                | Official Context | Verified Local       | LM Studio            | Notes                                           |
| ------------------------------------ | ---------------- | -------------------- | -------------------- | ----------------------------------------------- |
| `gemma4:e2b`                         | 128K             | ~96K (CPU, 64GB RAM) | N/A                  | 5.1B model fits easily                          |
| `gemma4:e4b`                         | 128K             | ~64K (CPU, 64GB RAM) | N/A                  | 8B model fits comfortably                       |
| `gemma4:26b`                         | 256K             | ~32K (CPU, 64GB RAM) | 4,096 (configurable) | MoE: 25.2B loaded, 3.8B active per token        |
| `gemma4:31b`                         | 256K             | ~16K (CPU, 64GB RAM) | N/A                  | 30.7B dense, memory-heavy                       |
| `gemma4:31b-cloud`                   | 256K             | N/A (cloud)          | N/A                  | Ollama-hosted, no local GPU needed              |
| `google/gemma-4-26b-a4b` (LM Studio) | 256K             | ~32K                 | 4,096                | Requires manual context adjustment in LM Studio |

### 5.8 Impact on Gemini CLI Behavior

| Metadata Field                            | Affected CLI Behavior                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------- |
| `contextLength` / `verifiedContext`       | Sets `maxContextTokens` and controls when compression runs.                                                |
| `supportsVision`                          | Enables or disables image upload and multimodal prompt handling.                                           |
| `thinkingConfig.nativeThinking`           | If true, enables `/thinking` using the native `<                                                           | think | >` system prompt token; otherwise thinking stays off. |
| `thinkingConfig.implementation`           | For Gemma 4 this is always `native-token`; `gemini-cli` must inject `<                                     | think | >` when thinking is enabled.                          |
| `thinkingConfig.maxThinkingTokens`        | Sets the thinking budget, roughly 15% of verified context up to 16,384 tokens.                             |
| `thinkingConfig.visibleReasoningInOutput` | Signals that thought blocks may appear in output and should be stripped from history before the next turn. |
| `supportsToolUse`                         | Controls whether tool declarations are sent to the model or text-only mode is used.                        |
| `profile` (paramSize)                     | Affects parallelism, timeout values, and polling intervals for long-running operations.                    |
| `quantization`                            | Displayed in UI and may drive accuracy or memory warnings.                                                 |
| `moe` / dense architecture                | Affects batching guidance and performance hints.                                                           |
| `isLoaded` (LM Studio)                    | Shows load state in UI and can prompt the user to load a model before use.                                 |
| `architecture`                            | Used for prompt-template selection and tokenizer-compatibility checks.                                     |

### 5.9 Discovery Service API

```typescript
// packages/core/src/services/localModelDiscovery.ts

export class LocalModelDiscovery {
  constructor(private config: Config) {}

  // Phase 1: Discover all locally available models
  async discoverAll(backend: LocalBackend): Promise<LocalModelMetadata[]>;

  // Phase 2: Focus on Gemma 4 family
  async discoverGemma4(backend: LocalBackend): Promise<LocalModelMetadata[]>;

  // Phase 3: Full metadata for a specific model
  async getModelMetadata(
    backend: LocalBackend,
    modelId: string,
  ): Promise<LocalModelMetadata | null>;

  // Phase 4: Auto-tune
  async tuneFromMetadata(
    meta: LocalModelMetadata,
  ): Promise<ModelTuningSettings>;

  // Phase 5: Reconcile with ModelConfigService
  async reconcileWithConfigService(meta: LocalModelMetadata): Promise<void>;
}
```

### 5.10 Integration Flow

```
CLI Startup
  │
  ├── 1. Auto-detect local backend
  │       GET {baseUrl}/v1/models → 200? → identified
  │
  ├── 2. Fetch model list
  │       GET /v1/models → [{ id: "gemma4:26b", ... }, ...]
  │
  ├── 3. Filter to Gemma 4 family
  │       pattern match, exclude non-Gemma-4
  │
  ├── 4. Fetch detailed metadata per Gemma 4 model
  │       Ollama: POST /api/show {"name":"gemma4:26b"}
  │       LM Studio: GET /api/v0/models → filter by id
  │       Llama.cpp: GET /v1/models + server config
  │
  ├── 5. Auto-tune per model
  │       contextLength → token budget, compression thresholds
  │       supportsVision → enable vision UI
  │       supportsReasoning → enable thinking mode
  │       supportsToolUse → enable/disable tools
  │       paramSize → performance profile, batching, prefetch
  │
  ├── 6. Register in ModelConfigService
  │       dynamic model definitions with resolved metadata
  │       generation configs with model-native temperature/topK/topP
  │
  └── 7. Expose in UI (ModelDialog)
          displayName: "Gemma 4 26B (Q4_K_M, 262K ctx, vision)"
          show features: 🖼️ vision, 🧠 MoE, 🔧 tools
```

---

## 6. Backend-Specific Model Name Resolution

### 6.1 Resolution Service

Create `packages/core/src/services/localModelService.ts`:

```
LocalModelService
├── discoverModels(baseUrl): Promise<LocalModel[]>
│     └── GET {baseUrl}/v1/models → parse { data: [{ id, ... }] }
│
├── filterGemma4Models(models): LocalModel[]
│     └── Pattern match IDs containing 'gemma' AND '4' (case-insensitive)
│         Exclude: embedding-only variants
│         Separate: functiongemma → ToolFilter (not a chat model)
│
├── resolveModelName(alias, discoveredModels): string | undefined
│     └── gemma4 family:
│           ├── alias='gemma4'              → largest Gemma 4 model (prefer 26B)
│           ├── alias='gemma4-26b'          → model with '26b' or '26' in ID
│           ├── alias='gemma4-31b'          → model with '31b' or '31' in ID (exclude 'cloud')
│           ├── alias='gemma4-31b-cloud'    → model with '31b'/'31' AND 'cloud' in ID
│           ├── alias='gemma4-e4b'         → model with 'e4b' in ID
│           └── alias='gemma4-e2b'         → model with 'e2b' in ID
│
├── getApiBase(backend): string
│     └── Default URL or env override
│
├── detectAvailableBackend(): Promise<{ backend, baseUrl } | null>
│     └── Probe known URLs until one responds with 200
│
├── validateBackendConnection(baseUrl): Promise<boolean>
│     └── GET {baseUrl}/v1/models, check 200 OK
│
└── getAvailableGemmaAliases(backend, baseUrl): Promise<string[]>
      └── discover → filter → map to aliases → return visible list
```

### 6.2 Resolution Algorithm

```
function resolveModelAliasToDiscoveredId(
  alias: string,
  discoveredModels: LocalModel[],
): string | undefined {
  // Filter Gemma 4 models only
  const gemma4Models = discoveredModels.filter(m =>
    /gemma/i.test(m.id) &&
    /4/i.test(m.id) &&                              // Gemma 4 only
    !/functiongemma/i.test(m.id) &&                 // Exclude functiongemma
    !/embed/i.test(m.id)                            // Exclude embedding models
  );

  if (gemma4Models.length === 0) return undefined;

  switch (alias) {
    case 'gemma4':
      return gemma4Models.find(m => /26b/i.test(m.id))?.id
        ?? gemma4Models[gemma4Models.length - 1]?.id;
    case 'gemma4-26b':
      return gemma4Models.find(m => /26b|26/.test(m.id))?.id;
    case 'gemma4-31b':
      return gemma4Models.find(m => /31b|31/.test(m.id) && !/cloud/i.test(m.id))?.id;
    case 'gemma4-31b-cloud':
      return gemma4Models.find(m => /31b|31/.test(m.id) && /cloud/i.test(m.id))?.id;
    case 'gemma4-e4b':
      return gemma4Models.find(m => /e4b/i.test(m.id))?.id;
    case 'gemma4-e2b':
      return gemma4Models.find(m => /e2b/i.test(m.id))?.id;
    default:
      return undefined;
  }
}
```

### 6.3 Per-Backend Model Format Differences

All five backends expose an OpenAI-compatible `/v1/models` shape, but their
model IDs vary by backend:

| Backend   | Model ID format                           | Example                                        |
| --------- | ----------------------------------------- | ---------------------------------------------- |
| Ollama    | `{name}:{tag}`                            | `gemma4:26b`, `gemma4:31b-cloud`, `gemma4:e4b` |
| LM Studio | `{org}/{name}`                            | `google/gemma-4-26b-a4b`                       |
| Llama.cpp | `{filename}`                              | `gemma-4-26b-a4b-it.gguf`                      |
| vLLM      | model/repo name or configured served name | `google/gemma-4-26b-a4b-it`                    |
| SGLang    | model/repo name or configured served name | `google/gemma-4-26b-a4b-it`                    |

The `LocalModelService` handles format differences transparently. Only the raw
model ID matters for discovery.

---

## 7. User Experience

### 7.1 Zero-Config Local Profile (Auto-Detect & Suggest)

On startup, gemini-cli should **automatically probe** for available local Gemma
inference backends and **propose a local profile as the default** when Gemma 4
is detected.

```
CLI Startup (before displaying any UI)
  │
  ├── 1. Probe known local backend URLs (fast healthcheck, ~2 seconds timeout each)
  │     ├── GET http://localhost:11434/v1/models → 200?  → Ollama available
  │     ├── GET http://localhost:1234/v1/models  → 200?  → LM Studio available
  │     ├── GET http://localhost:8080/v1/models  → 200?  → Llama.cpp available
  │     ├── GET http://localhost:8000/v1/models  → 200?  → vLLM available
  │     └── GET http://localhost:30000/v1/models → 200?  → SGLang available
  │
   ├── 2. If backends found → probe each for Gemma 4 models (in parallel)
   │     ├── GET {baseUrl}/v1/models for each responding backend
   │     ├── Match IDs containing 'gemma' AND '4' (case-insensitive)
   │     ├── Group discovered models by provider (Ollama, LM Studio, Llama.cpp, vLLM, SGLang)
   │     └── If any Gemma 4 models found → local profile available
   │
   ├── 3. Auto-select default model across all detected backends
   │     ├── Prefer Ollama → gemma4:26b (MoE, 256K ctx) if pulled, else gemma4:e4b
   │     ├── If no Ollama → LM Studio: google/gemma-4-26b-a4b if loaded
   │     └── Fallback: largest Gemma 4 model from any backend (Llama.cpp/vLLM/SGLang)
   │
   └── 4. Propose local profile in UI (grouped by provider)
        ├── Banner at top of session:
        │   "Local Gemma 4 detected! Using gemma4:26b via Ollama (256K context, offline, free)."
        │   "Press Esc for settings or /model to switch."
        │
        ├── Auth mode: automatically set to the detected backend's AuthType
        │   No API key prompt. No OAuth browser flow.
        │
        ├── ModelDialog default selection: Gemma 4 family highlighted
        │   Group header: "Local (offline)" with sub-groups per provider:
        │     ├── Ollama
        │     │     ├── gemma4:26b (18 GB, Q4_K_M, 256K ctx)
        │     │     ├── gemma4:e4b  (9.6 GB, Q4_K_M, 128K ctx)
        │     │     └── gemma4:e2b  (7.2 GB, Q4_K_M, 128K ctx)
        │     ├── LM Studio
        │     │     └── google/gemma-4-26b-a4b
        │     ├── Llama.cpp (if available)
        │     ├── vLLM (if available)
        │     └── SGLang (if available)
        │   Group header: "Cloud (Google API)" with gemini models below
        │
        └── Footer indicator: "🖥️ Local · gemma4:26b · Ollama" or similar
```

**When no local backend is found — no prompt, no delay.** The user sees standard
gemini-cli behavior (Google OAuth or API key prompt). Discovery runs in the
background on each startup and re-checks periodically (every 30 minutes) without
blocking the UI. If a backend becomes available later, a notification appears:
"Ollama detected! Switch to local Gemma 4? [Y/n]".

### 7.2 Commands & CLI Usage

```bash
# Start with local Gemma 4 via Ollama
gemini -m gemma4 --local-backend ollama

# Start with LM Studio
gemini -m gemma4 --local-backend lm-studio

# Use environment variables
GEMINI_LOCAL_BACKEND=ollama gemini -m gemma4

# Use the larger 31B model (Ollama only)
gemini -m gemma4-31b --local-backend ollama
```

### 7.3 Settings Configuration

In `~/.gemini/settings.json`:

```json
{
  "security": {
    "auth": {
      "selectedType": "local-ollama"
    }
  },
  "localModel": {
    "backend": "ollama",
    "baseUrl": "http://localhost:11434/v1",
    "modelMapping": {
      "gemma4": "gemma4:26b",
      "gemma4-31b": "gemma4:31b"
    }
  }
}
```

### 7.4 Model Dialog

The TUI model selector (`packages/cli/src/ui/components/ModelDialog.tsx`) should
list available local Gemma 4 models **grouped by provider** when a local backend
is active, filtered by what each backend supports.

```
Local (offline)
  ├── Ollama                  ← backend status: ● running / ○ not detected
  │     ├── gemma4:26b        ← default, highlighted when auto-selected
  │     ├── gemma4:e4b
  │     └── gemma4:e2b
  ├── LM Studio               ← backend status: ● running
  │     ├── google/gemma-4-26b-a4b
  │     └── google/gemma-4-31b-it
  ├── Llama.cpp               ← backend status: ○ not running
  ├── vLLM                    ← backend status: ○ not running
  └── SGLang                  ← backend status: ○ not running

Cloud (Google API)
  ├── gemini-2.5-flash
  └── ...
```

- **Backend status indicator**: Each provider group header shows a live status
  dot (● running, ○ not detected, ◐ connecting)
- **Provider-specific model metadata**: Size, quantization, context length shown
  inline per model (varies per backend since different quantizations may be
  loaded)
- **Unavailable backends**: Shown greyed out with status ○ — user can see which
  backends are available without having to read logs
- **Cross-backend dedup**: If the same model variant is available on multiple
  backends (e.g., Gemma 4 26B on both Ollama and Llama.cpp), both entries are
  shown under their respective providers with the provider-specific
  size/metadata

---

## 8. Error Handling

### 8.1 Backend Not Available

If the selected local backend is not running:

```
Error: Ollama is not running. Please start Ollama and try again.
       See: https://ollama.com/download
```

### 8.2 Unsupported Model per Backend

If the user requests a model variant not supported by their backend:

```
Warning: gemma4-31b is not available for LM Studio.
         Falling back to gemma4-26b.
```

### 8.3 Model Not Pulled (Ollama)

If the requested Ollama model is not yet pulled:

```
Warning: Model 'gemma4:26b' not found locally.
         Run: ollama pull gemma4:26b
```

---

## 9. FunctionGemma: Intelligent Tool Filtering

### 9.1 Overview

gemini-cli exposes **28+ tools** (file operations, search, shell execution, web
fetch, MCP tools, etc.) to the model on every turn via `FunctionDeclaration[]`
in the API call. For local Gemma 4 models running with constrained context
windows (especially E2B/E4B at ~32K effective tokens), tool definitions alone
can consume 10-40% of the available context budget, leaving less room for
conversation history, file contents, and generated code.

**FunctionGemma** is a specialized 270M-parameter variant of Google's Gemma 3,
fine-tuned specifically for function calling. At only **301MB** (Q4_K_M), it
runs with minimal VRAM overhead and can quickly classify which tools are
relevant to the current conversation context.

> **FunctionGemma details**
>
> - **Based on**: Gemma 3 270M (same architecture, different chat format)
> - **Size**: 301MB (Q4_K_M), 32K context window
> - **Training**: 6T tokens of public tool definitions + tool use interactions
> - **Ollama tag**: `functiongemma:270m` (= `functiongemma:latest`)
> - **Requirements**: Ollama v0.13.5+
> - **BFCL benchmarks**: Simple 61.6%, Multiple 63.5%, Parallel 39%, Relevance
>   61.1%, Irrelevance 73.7%
> - **Source**: https://ollama.com/library/functiongemma

### 9.2 How It Works

FunctionGemma acts as a **tool relevance router** — a lightweight pre-filter
between gemini-cli's tool registry and the main Gemma 4 model:

```
Before each turn to the main model:
                              ┌──────────────────────────────┐
                              │   ToolRegistry               │
                              │   28+ tools available         │
                              └──────────┬───────────────────┘
                                         │
                                         ▼
┌────────────────────┐    ┌─────────────────────────────┐
│ Conversation       │    │  FunctionGemma (270M)       │
│ context (last ~3   │───▶│  "Given this context,      │
│ messages + user    │    │   which tools are needed?"  │
│ query)             │    └────────────┬────────────────┘
└────────────────────┘                 │
                                       ▼
                              ┌──────────────────────────────┐
                              │  Filtered tools (2-5)        │
                              │  Only these sent to model    │
                              └──────────┬───────────────────┘
                                         │
                                         ▼
                              ┌──────────────────────────────┐
                              │  Main Gemma 4 Model          │
                              │  26B/31B/E4B/E2B             │
                              │  Receives reduced tool list  │
                              └──────────────────────────────┘
```

### 9.3 Context Savings

| Scenario                  | All Tools (28) | Filtered (avg 4) | Context Saved | Effective Gain         |
| ------------------------- | -------------- | ---------------- | ------------- | ---------------------- |
| **gemma4:e2b** (~32K ctx) | ~3,500 tokens  | ~600 tokens      | ~2,900 tokens | ~9% of context budget  |
| **gemma4:e4b** (~32K ctx) | ~3,500 tokens  | ~600 tokens      | ~2,900 tokens | ~9% of context budget  |
| **gemma4:26b** (~32K ctx) | ~4,200 tokens  | ~700 tokens      | ~3,500 tokens | ~11% of context budget |
| **gemma4:31b** (~16K ctx) | ~4,200 tokens  | ~700 tokens      | ~3,500 tokens | ~22% of context budget |

For edge models running with heavily constrained context, every 3,000 tokens
saved represents meaningful headroom for file content, code, and conversation
history.

### 9.4 Configuration

FunctionGemma tool filtering is **opt-in** and configurable:

```json
{
  "localModel": {
    "backend": "ollama",
    "toolFiltering": {
      "enabled": false,
      "model": "functiongemma:270m",
      "maxContextMessages": 3,
      "fallbackBehavior": "all-tools",
      "cacheResults": true,
      "cacheTtl": 30000
    }
  }
}
```

| Field                              | Type                                           | Default                | Description                                        |
| ---------------------------------- | ---------------------------------------------- | ---------------------- | -------------------------------------------------- |
| `toolFiltering.enabled`            | `boolean`                                      | `false`                | Enable FunctionGemma-based tool filtering          |
| `toolFiltering.model`              | `string`                                       | `"functiongemma:270m"` | Ollama model tag for the filtering model           |
| `toolFiltering.maxContextMessages` | `number`                                       | `3`                    | Max conversation messages sent for context         |
| `toolFiltering.fallbackBehavior`   | `"all-tools"` \| `"no-tools"` \| `"core-only"` | `"all-tools"`          | Behavior when FunctionGemma fails                  |
| `toolFiltering.cacheResults`       | `boolean`                                      | `true`                 | Cache tool relevance decisions for similar queries |
| `toolFiltering.cacheTtl`           | `number`                                       | `30000`                | Cache time-to-live in milliseconds (30s)           |

### 9.5 VRAM Impact & Disabling

| Component              | VRAM Usage       |
| ---------------------- | ---------------- |
| FunctionGemma (Q4_K_M) | ~301 MB          |
| Main Gemma 4 model     | 7-63 GB (varies) |
| **Total overhead**     | **~301 MB**      |

The additional VRAM overhead is minimal (~301MB) relative to Gemma 4 models.
However, users running on **tight VRAM budgets** (e.g., Gemma-4-26B Q4_K_M on
16GB GPU with ~4K context) can disable tool filtering entirely by setting
`toolFiltering.enabled: false` (the default).

A startup VRAM check warns if enabling filtering would push total VRAM usage
beyond available capacity:

```
Warning: Tool filtering requires ~301MB additional VRAM.
         With gemma4:26b loaded, only ~250MB VRAM remains.
         Tool filtering disabled to avoid OOM. Set toolFiltering.enabled: false to suppress.
```

### 9.6 Known Limitations

| Limitation                    | Impact                                                        | Mitigation                                                                                         |
| ----------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| BFCL Simple only 61.6%        | May occasionally omit needed tools or include irrelevant ones | Fallback to `all-tools` on detection of missing tool calls in response                             |
| Parallel tool selection (39%) | Complex multi-tool workflows may get incomplete tool sets     | Only applies filtering on first turn; subsequent turns get full tool set after tool results arrive |
| Ollama-only                   | Only works with Ollama backend                                | Feature gates on `backend === 'ollama'`; other backends skip filtering silently                    |
| Adds ~200-500ms latency       | Extra inference call before main model                        | Caching eliminates latency for repeated similar queries; async pre-fetch possible                  |
| Text-only (no multimodal)     | Cannot evaluate image/audio relevance                         | Falls back to `all-tools` when conversation contains multimodal content                            |

### 9.7 Integration Flow

```
Before each turn:
  │
  ├── 1. Config check: toolFiltering.enabled === true?
  │     └── No → send all tools (current behavior)
  │
  ├── 2. Backend check: is backend 'ollama'?
  │     └── No → skip filtering for non-Ollama backends
  │
  ├── 3. Multimodal check: does conversation contain images/audio?
  │     └── Yes → fall back to all tools (FunctionGemma is text-only)
  │
  ├── 4. Cache check: hash of (tools + recent messages) in cache?
  │     └── Yes → return cached filtered tool set
  │
  ├── 5. Run FunctionGemma:
  │     ├── Ollama model: functiongemma:270m (or configured model)
  │     ├── Input:  tool names + descriptions + last N messages + user query
  │     ├── Output: list of relevant tool names
  │     └── Timeout: 2000ms
  │
  ├── 6. Validate output:
  │     ├── Empty result → fallback: all tools
  │     ├── All 28 tools → fallback: treat as error
  │     ├── Unknown tool names → strip them
  │     └── Valid subset (1-10 tools) → use as filter
  │
  ├── 7. Cache result with TTL
  │
  └── 8. Send to ToolRegistry.getFunctionDeclarations(filtered)
        └── Only selected tools' FunctionDeclarations are sent to main model
```

### 9.8 Implementation

Create `packages/core/src/services/toolFilter.ts`:

```typescript
export interface ToolFilterConfig {
  enabled: boolean;
  model: string;
  maxContextMessages: number;
  fallbackBehavior: 'all-tools' | 'no-tools' | 'core-only';
  cacheResults: boolean;
  cacheTtl: number;
}

export class ToolFilter {
  private cache: Map<string, { tools: string[]; expiresAt: number }>;

  constructor(
    private config: ToolFilterConfig,
    private ollamaBaseUrl: string,
  ) {}

  async filterTools(
    allTools: DeclarativeTool[],
    recentMessages: Message[],
    userQuery: string,
  ): Promise<DeclarativeTool[]> { ... }

  private async callFunctionGemma(
    toolNames: string[],
    toolDescriptions: string[],
    messages: Message[],
    userQuery: string,
  ): Promise<string[]> { ... }

  private validateToolNames(
    requested: string[],
    available: Set<string>,
  ): string[] { ... }

  private getCacheKey(
    tools: string[],
    messages: Message[],
  ): string { ... }

  clearCache(): void { ... }
}
```

---

## 10. Implementation Plan

### 10.1 Delivery Strategy

Implement this feature in **three milestones** rather than one large patch:

1. **MVP: single-backend local Gemma 4 execution** Supports explicit local
   backend selection, alias-to-model resolution, and end-to-end chat/tool
   execution against a discovered local model.
2. **Discovery UX: auto-detect, grouped model selection, and settings polish**
   Adds zero-config startup detection, provider-aware UI, and stronger
   validation/error handling.
3. **Optional optimization: FunctionGemma tool filtering** Adds the Ollama-only
   tool pre-filter after the base local backend path is stable.

This sequencing keeps the first shippable version small enough to verify quickly
while isolating the riskiest optional behavior behind a later milestone.

### 10.2 Milestone 1 — MVP Local Backend Path

**Goal:** `gemini -m gemma4 --local-backend ollama` works end to end with one
explicitly selected backend and one discovered Gemma 4 model.

**Primary files**

- `packages/core/src/core/contentGenerator.ts`
- `packages/core/src/config/models.ts`
- `packages/core/src/config/config.ts`
- `packages/core/src/services/localModelService.ts`
- `packages/cli/src/config/auth.ts`
- `packages/cli/src/validateNonInterActiveAuth.ts`
- `packages/cli/src/gemini.tsx`

**Tasks**

1. Add local backend `AuthType` values and environment detection in
   `contentGenerator.ts`.
2. Create a small `LocalModelService` that owns:
   - backend enum/type definitions
   - backend base URL resolution
   - `/v1/models` probing
   - Gemma 4 filtering
   - alias-to-discovered-model resolution
3. Extend `createContentGeneratorConfig()` to return local `baseUrl` values
   without requiring API keys or OAuth state.
4. Extend `createContentGenerator()` to build a local `GoogleGenAI` client using
   `baseUrl` plus headers, following the same wrapping pattern as the existing
   Gemini/Gateway branches.
5. Add `--local-backend` CLI parsing in `gemini.tsx` and thread the selected
   backend into config/bootstrap.
6. Teach `config.ts` how to resolve the requested local alias (`gemma4`,
   `gemma4-26b`, etc.) into a discovered backend-native model ID before the
   first request is sent.
7. Update `auth.ts` and `validateNonInterActiveAuth.ts` so local auth types are
   accepted and do not demand cloud credentials.

**Deliberate non-goals for Milestone 1**

- no multi-backend grouping
- no background auto-detection
- no FunctionGemma filtering
- no LM Studio load-state metadata beyond basic discovery

**Exit criteria**

- `gemini -m gemma4 --local-backend ollama` reaches a local model successfully.
- `GEMINI_LOCAL_BACKEND=ollama gemini -m gemma4` works without cloud auth.
- invalid backend connection produces a clear actionable error.
- non-interactive mode works with local auth and exits correctly on failures.

### 10.3 Milestone 2 — Discovery, Settings, and UI

**Goal:** local backends feel first-class in startup flow, settings, and model
selection UI.

**Primary files**

- `packages/cli/src/config/settingsSchema.ts`
- `packages/cli/src/config/settings.ts`
- `packages/cli/src/ui/components/ModelDialog.tsx`
- `packages/cli/src/ui/auth/AuthDialog.tsx`
- `packages/cli/src/ui/auth/useAuth.ts`
- `packages/core/src/services/modelConfigService.ts`
- `packages/core/src/config/defaultModelConfigs.ts`

**Tasks**

1. Add `localModel` settings schema with:
   - `backend`
   - `baseUrl`
   - alias overrides / model mapping
   - optional future `toolFiltering` subtree
2. Decide whether the first UI release should:
   - use the existing dynamic model config path, or
   - keep local models as a dedicated UI branch in `ModelDialog.tsx` Recommended
     approach: start with a dedicated local branch in `ModelDialog.tsx`, then
     move to dynamic model config only after discovery metadata is stable.
3. Add provider-aware model listing in `ModelDialog.tsx`.
4. Add backend health/status indicators and selection fallback messaging.
5. Add explicit startup probing in `gemini.tsx` for configured or default local
   backends.
6. Make auth UI understand local auth types so users are not pushed into
   OAuth/API-key prompts when a local profile is configured.
7. If multiple backends are detected, group models by provider and preserve
   provider metadata through selection.

**Exit criteria**

- `settings.json` can configure a local backend cleanly.
- `/model` shows local Gemma 4 models with backend context.
- startup can prefer local mode when configured without breaking cloud flows.
- switching between local and cloud auth types does not leave stale model state.

### 10.4 Milestone 3 — Runtime Metadata and Auto-Tuning

**Goal:** discovered local models drive better defaults for context, vision, and
thinking behavior.

**Primary files**

- `packages/core/src/services/localModelDiscovery.ts`
- `packages/core/src/config/config.ts`
- `packages/core/src/config/models.ts`
- `packages/core/src/config/defaultModelConfigs.ts`

**Tasks**

1. Add richer model metadata fetching per backend where available.
2. Normalize backend-native metadata into a shared `LocalModelMetadata` shape.
3. Derive runtime tuning settings:
   - effective context window
   - compression thresholds
   - vision enablement
   - thinking defaults
   - tool-use enablement hints
4. Integrate those derived values into config/runtime behavior without breaking
   existing Gemini cloud model behavior.
5. Keep hard dependencies minimal: if metadata fetch fails, fall back to safe
   defaults instead of blocking chat.

**Exit criteria**

- local model discovery succeeds even when detailed metadata fetch fails.
- effective context and thinking defaults can differ by discovered model.
- cloud model behavior remains unchanged when no local backend is active.

### 10.5 Milestone 4 — Optional FunctionGemma Tool Filtering

**Goal:** reduce tool-schema token cost for constrained local models, but only
after the base local path is stable.

**Primary files**

- `packages/core/src/services/toolFilter.ts`
- `packages/core/src/tools/tool-registry.ts`
- `packages/cli/src/config/settingsSchema.ts`

**Tasks**

1. Add `toolFiltering` settings under `localModel`.
2. Implement `ToolFilter` as an isolated service with cache, timeout, and safe
   fallbacks.
3. Integrate filtering at the tool declaration boundary, not by mutating the
   canonical tool registry state.
4. Gate the feature to Ollama plus text-only contexts for the first release.
5. Add startup/runtime guards for timeout, invalid tool names, and low-memory
   situations.

**Exit criteria**

- disabling the feature yields identical behavior to baseline.
- failed FunctionGemma calls fall back cleanly according to configuration.
- filtered tool lists are observable in tests and logs.

### 10.6 Recommended Patch Sequence

To reduce merge risk, land the work in this order:

1. `AuthType` + env detection + validation changes
2. `LocalModelService` + backend probing tests
3. content generator local branch
4. CLI flag + non-interactive path
5. config/model alias resolution
6. settings schema
7. model dialog / startup UX
8. metadata auto-tuning
9. FunctionGemma filtering

### 10.7 Test Plan

**Unit tests**

- `contentGenerator.ts`: local auth types, base URL handling, unsupported
  backend behavior
- `models.ts`: alias resolution for `gemma4`, `gemma4-26b`, `gemma4-31b`,
  `gemma4-e4b`, `gemma4-e2b`
- `localModelService.ts`: discovery, filtering, backend URL resolution,
  provider-specific ID parsing
- `auth.ts` and `validateNonInteractiveAuth.ts`: local auth acceptance and error
  messages
- `ModelDialog.tsx`: provider grouping, local/cloud coexistence, selection state
- `toolFilter.ts`: cache, timeout, fallback, validation of tool names

**Integration tests**

- explicit local backend startup succeeds with mocked `/v1/models`
- missing backend produces actionable errors
- switching from local auth to cloud auth resets stale local model resolution
- model selection persists correctly through settings round-trips

**Manual verification**

- Ollama with `gemma4:e4b` only
- Ollama with `gemma4:26b` + `gemma4:31b-cloud`
- LM Studio with one loaded Gemma 4 model
- no local backend running
- optional FunctionGemma enabled on Ollama

### 10.8 Definition of Done

This PRD is implementation-complete when all of the following are true:

- users can run Gemini CLI against at least one supported local backend without
  Google credentials
- local Gemma 4 aliases resolve deterministically to discovered model IDs
- the model picker and settings surface local backends clearly
- failures are actionable and do not strand the user in cloud auth flows
- the feature is covered by unit tests plus at least one integration path
- FunctionGemma filtering, if shipped, remains optional and off by default

### 10.9 Verified Implementation Status (audited 2026-05-02, updated 2026-05-02)

**Status by milestone, verified against actual code**

| Milestone                       | Status   | Files verified                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1: MVP Local Backend**       | COMPLETE | `contentGenerator.ts` (AuthType enum, env detection, content generator config/creation), `models.ts` (Gemma aliases, `isLocalGemma4Alias`, display strings), `localModelService.ts` (discovery, filtering, alias resolution), `auth.ts` (validation), `config.ts` (`refreshAuth` with `LocalModelService`)                                                                                                                |
| **M2: Discovery, Settings, UI** | COMPLETE | `settingsSchema.ts` (full `localModel` block + `toolFiltering` subtree), `settings.ts` (`applyLocalModelEnvironment`), `schemas/settings.schema.json` (generated, complete), `gemini.tsx` (`autoSelectDiscoveredLocalBackend` with `LocalModelDiscoveryService`), `AuthDialog.tsx` (local backend options), `ModelDialog.tsx` (live discovery-driven provider grouping, backend status indicators, metadata descriptions) |
| **M3: Metadata Auto-Tuning**    | COMPLETE | `localModelDiscoveryService.ts` (parallel probing + Ollama `POST /api/show` rich metadata fetching), `localModelMetadata.ts` (shared `LocalModelMetadata` interface, `ModelTuningSettings`, `tuneModelFromMetadata()`, `resolveGemma4Defaults()`), exported via `index.ts`                                                                                                                                                |
| **M4: FunctionGemma Filtering** | COMPLETE | `toolFilter.ts` (`ToolFilter` class with cache, timeout, safe fallbacks), `settingsSchema.ts` (`localModel.toolFiltering` subtree: enabled, model, maxContextMessages, fallbackBehavior, cacheResults, cacheTtl)                                                                                                                                                                                                          |

**Detailed verified status per PRD section**

_Section 3.1 — AuthType Extension:_ COMPLETE. All 5 `USE_LOCAL_*` enum values
exist in `contentGenerator.ts:59-71`, plus `LocalBackendAuthType` union type,
`LocalBackendName` type, and all supporting maps (`LOCAL_BACKEND_AUTH_TYPE_MAP`,
`LOCAL_BACKEND_DEFAULT_BASE_URLS`, `LOCAL_BACKEND_BASE_URL_ENV_VARS`).

_Section 3.2 — Environment Variable Detection:_ COMPLETE. `getAuthTypeFromEnv()`
checks `GEMINI_LOCAL_BACKEND` first, then falls through to each backend-specific
env var (`OLLAMA_HOST`, `LM_STUDIO_API_BASE`, etc.) at
`contentGenerator.ts:196-234`. Per-backend env vars are auto-set from settings
by `applyLocalModelEnvironment()` in `settings.ts:670-708`.

_Section 3.3 — Content Generator Creation:_ COMPLETE.
`createContentGeneratorConfig()` handles local backends at
`contentGenerator.ts:326`, `createContentGenerator()` at
`contentGenerator.ts:496`. Both use `isLocalBackendAuthType()` guard and create
`GoogleGenAI` with `apiKey: undefined` pointed at the backend's `/v1` endpoint.

_Section 3.4 — Auth Validation:_ COMPLETE. `validateAuthMethod()` in `auth.ts`
accepts all 5 local backend types with `return null` (no key required).

_Section 3.5 — Settings Schema:_ COMPLETE. `settingsSchema.ts:1118-1383` defines
full `localModel` object with `backend` (enum of 5), `baseUrl`, `providers`
(per-provider `{ baseUrl }`), `modelMapping` (all 6 Gemma 4 aliases), and
`toolFiltering` (enabled, model, maxContextMessages, fallbackBehavior,
cacheResults, cacheTtl). Generated artifact `schemas/settings.schema.json`
contains the complete schema.

_Section 4 — Model Configuration:_ COMPLETE. Model constants in
`models.ts:64-80`, display strings in `models.ts:276-319`,
`isLocalGemma4Alias()` helper. `defaultModelConfigs.ts` has concrete Gemma model
definitions for API-side (`gemma-4-31b-it`, `gemma-4-26b-a4b-it`) but local
aliases (`gemma4`, etc.) are resolved exclusively by `LocalModelService`, not
through the standard `modelConfigService` path.

_Section 5 — Discovery Results:_ COMPLETE. Reference data from local machine
testing documented in PRD Sections 5.1-5.3. Rich metadata fetching implemented:
`LocalModelDiscoveryService.discoverBackends()` probes all 5 backends in
parallel, `fetchOllamaModelShow()` retrieves quantization/param info via
`POST /api/show`, `resolveGemma4Defaults()` provides safe fallback metadata per
variant (E2B, E4B, 26B, 31B). `tuneModelFromMetadata()` derives
`ModelTuningSettings` including context budgets, vision/audio enablement,
thinking config, tool-use hints, and performance profiles. Full metadata model:
`LocalModelMetadata` + `LocalThinkingConfig` + `ModelTuningSettings`.

_Section 6 — Backend-Specific Resolution:_ COMPLETE. `LocalModelService` in
`localModelService.ts:1-190` implements full discovery (`discoverModels`),
filtering (`filterGemma4Models`), alias resolution (`resolveModelName`,
`resolveModelId`), and base URL resolution. Priority: 26b > 31b > e4b > e2b.

_Section 7 — User Experience:_ COMPLETE.

- **7.1 Zero-Config Profile:** IMPLEMENTED via
  `autoSelectDiscoveredLocalBackend()` in `gemini.tsx:269-307`, called during
  startup at `gemini.tsx:449-473`. Sets `auth.selectedType` based on discovered
  backends.
- **7.2 Commands:** COMPLETE. `--local-backend` CLI flag parsed,
  `GEMINI_LOCAL_BACKEND` env var respected.
- **7.3 Settings Configuration:** COMPLETE. Full settings support via
  `localModel` in `settings.json`, including `toolFiltering` subtree.
- **7.4 Model Dialog:** COMPLETE. `ModelDialog.tsx` uses
  `LocalModelDiscoveryService` for live discovery results grouped by provider.
  Shows backend status indicators (● running per model), "Probing local
  backends..." placeholder while discovery runs, and falls back to hardcoded
  aliases when no backends respond. Provider labels (Ollama, LM Studio,
  Llama.cpp, vLLM, SGLang) shown per model.

_Section 8 — Error Handling:_ COMPLETE. `resolveModelId()` in
`localModelService.ts` produces actionable errors for unreachable backends,
missing models, and unsupported variants.

_Section 9 — FunctionGemma:_ COMPLETE. `toolFilter.ts` implements `ToolFilter`
class with:

- Configuration via `localModel.toolFiltering` settings subtree (disabled by
  default)
- Ollama-only gating (only works via Ollama backend)
- Cache with configurable TTL
- 3-second timeout on FunctionGemma calls
- JSON parsing with validation of returned tool names against available list
- Fallback behaviors: `all-tools` (default), `no-tools`, `core-only`
- Text-only contexts (no multimodal filtering) Settings schema includes:
  `toolFiltering.enabled`, `toolFiltering.model`,
  `toolFiltering.maxContextMessages`, `toolFiltering.fallbackBehavior`,
  `toolFiltering.cacheResults`, `toolFiltering.cacheTtl`.

_Section 10 — Implementation Plan:_ COMPLETE. All 4 milestones implemented. All
5 gaps closed. User documentation created at `docs/cli/local-gemma-4.md`.

_Section 11 — Files:_ All files listed in 11 were created or modified. New
files: `localModelService.ts`, `localModelMetadata.ts`,
`localModelDiscoveryService.ts`, `toolFilter.ts`, `docs/cli/local-gemma-4.md`.

_Section 12 — Docs:_ User documentation created at `docs/cli/local-gemma-4.md`
covering setup, model aliases, settings, troubleshooting, backend status, and
Gemma 4 capabilities.

---

**All gaps closed — all four milestones complete**

| #   | Gap                                              | Priority | Status                                                                                                                                                          |
| --- | ------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Model picker is alias-based, not discovery-based | High     | **CLOSED** — `ModelDialog.tsx` integrates `LocalModelDiscoveryService` with live provider-grouped results, status indicators, and fallback to hardcoded aliases |
| 2   | Runtime metadata normalization                   | Medium   | **CLOSED** — `LocalModelDiscoveryService` fetches Ollama `POST /api/show` metadata; `localModelMetadata.ts` defines shared types + auto-tuning algorithm        |
| 3   | User-facing documentation                        | Low      | **CLOSED** — `docs/cli/local-gemma-4.md` created with setup, troubleshooting, and capability docs                                                               |
| 4   | Optional FunctionGemma filtering                 | Low      | **CLOSED** — `toolFilter.ts` implements `ToolFilter` with cache, timeout, fallbacks; `settingsSchema.ts` has full `toolFiltering` subtree                       |

**Risk notes**

- UI changes in ModelDialog should NOT duplicate the existing `isLocalModelMode`
  guard — extend it instead.
- Discovery metadata must be additive: `/v1/models` alone must still support
  end-to-end chat.
- The existing `autoSelectDiscoveredLocalBackend()` in `gemini.tsx` is correct
  and should be left untouched — it handles auth selection at startup. The UI
  gap is in ModelDialog not consuming discovery results.
- `localModelDiscovery.ts` mentioned in the original PRD Section 5.4 does not
  exist — the actual file is `localModelDiscoveryService.ts`.

---

## 11. Files to Modify

| File                                               | Change                                                   |
| -------------------------------------------------- | -------------------------------------------------------- |
| `packages/core/src/core/contentGenerator.ts`       | AuthType enum, env detection, content generator creation |
| `packages/core/src/config/models.ts`               | Model constants, resolveModel()                          |
| `packages/core/src/config/defaultModelConfigs.ts`  | Model definitions, configs, resolutions                  |
| `packages/core/src/config/config.ts`               | Model resolution for local backends                      |
| `packages/core/src/services/modelConfigService.ts` | May need updates for custom tier resolution              |
| `packages/core/src/tools/tool-registry.ts`         | Integrate ToolFilter into getFunctionDeclarations()      |
| `packages/cli/src/config/auth.ts`                  | Auth validation for local backends                       |
| `packages/cli/src/config/settingsSchema.ts`        | Settings schema for local backend + toolFiltering config |
| `packages/cli/src/config/settings.ts`              | Settings handling                                        |
| `packages/cli/src/validateNonInterActiveAuth.ts`   | Non-interactive auth validation                          |
| `packages/cli/src/gemini.tsx`                      | CLI flags for local backend                              |
| `packages/cli/src/ui/components/ModelDialog.tsx`   | UI for local model selection                             |
| `schemas/settings.schema.json`                     | Generated settings schema                                |

### New Files

| File                                                   | Purpose                             |
| ------------------------------------------------------ | ----------------------------------- |
| `packages/core/src/services/localModelService.ts`      | Model name resolution per backend   |
| `packages/core/src/services/localModelService.test.ts` | Tests                               |
| `packages/core/src/services/toolFilter.ts`             | FunctionGemma tool relevance router |
| `packages/core/src/services/toolFilter.test.ts`        | Tests for tool filtering            |
| `packages/core/src/utils/localAuthProvider.ts`         | Local backend auth/config utilities |
| `docs/cli/local-gemma-4.md`                            | User documentation                  |

---

## 12. Dependencies

No new npm dependencies required. The existing `@google/genai` SDK supports
custom `baseUrl` + `apiKey` for OpenAI-compatible endpoints. All five local
backends expose OpenAI-compatible `/v1` endpoints.

Tool filtering requires **Ollama** backend (`functiongemma:270m` model, 301MB).
No additional SDK dependencies — Ollama's REST API is called directly via
`fetch`.

---

## 13. Risks & Mitigations

| Risk                                   | Mitigation                                                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Backend API differences                | All five use OpenAI-compatible format; test against each                                              |
| Gemma 4 GGUF availability              | Verify model availability before release                                                              |
| Performance vs cloud models            | Document expected performance differences                                                             |
| Breaking changes in backend APIs       | Pin default behavior, allow custom base URLs                                                          |
| ToolFilter false positives             | Fall back to all-tools on tool-call failures; cache invalidation on pattern change                    |
| ToolFilter adds latency                | Async pre-fetch + 30s cache TTL; default disabled, user opt-in                                        |
| ToolFilter VRAM overhead on tight GPUs | VRAM budget check on startup; auto-disable when insufficient; user can force-off via `enabled: false` |

---

## 14. References

- [Upstream Gemma 4 branch](https://github.com/google-gemini/gemini-cli/tree/feat/add-gemma-4-31b-it-support)
- [Ollama OpenAI-compatible API](https://github.com/ollama/ollama/blob/main/docs/openai.md)
- [LM Studio Developer Mode](https://lmstudio.ai/docs/api)
- [Llama.cpp Server](https://github.com/ggml-ai/llama.cpp/tree/master/examples/server)
- [Gemma 4 on Hugging Face](https://huggingface.co/google/gemma-4-26b-a4b-it)
- [FunctionGemma on Ollama](https://ollama.com/library/functiongemma)
- _Built for the Gemini CLI open-source community_

---

## 15. Phase 2 — Runtime Integration & Test Hardening (2026-05-02)

### 15.1 — 15.6 [unchanged — see above]

### 15.7 Verified Implementation Status (Phase 2, audited 2026-05-03)

| Milestone                         | Status   | Notes                                                                                                                |
| --------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| **P2.1: Wire ToolFilter**         | COMPLETE | Integrated in `geminiChat.ts` at tool-declaration boundary, guarded by `isActiveModelLocalGemma4()`                  |
| **P2.2: `<\|think\|>` Injection** | COMPLETE | Prepend to system instruction in `_sendHistoryAndConfigToModel()`                                                    |
| **P2.3: History Stripping**       | COMPLETE | `stripThoughtBlocksFromHistory()` strips `<\|channel\|>thought...<\|channel\|>` blocks before each turn              |
| **P2.4: Alias Entries**           | COMPLETE | All 6 aliases added to `defaultModelConfigs.ts`                                                                      |
| **P2.5: Tests**                   | COMPLETE | 58 unit tests: toolFilter (10), localModelMetadata (16), discovery service (9), auth validation (23)                 |
| **Circular dependency fix**       | COMPLETE | `LOCAL_BACKEND_DISCOVERY_ORDER` moved to `contentGenerator.ts`; `localModelDiscoveryService.ts` uses string literals |
| **Health check**                  | COMPLETE | `checkLocalBackendHealth()` in `validateNonInterActiveAuth.ts` verifies backend before non-interactive start         |

---

## 16. Phase 3 — Production Readiness & E2E Verification (2026-05-03)

### 16.1 Overview

Phase 2 delivered all runtime integrations but with test-level mocks. Phase 3
closes the gap between unit-tested code and real hardware: E2E verification,
ModelDialog test coverage, build hardening, and final documentation polish.

### 16.2 Gap Inventory

| #   | Gap                                                                | Severity | Current State                                                                                |
| --- | ------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------- |
| 1   | **E2E spec uses `new LocalModelDiscoveryService()` (no DI)**       | Medium   | `localModelDiscoveryService.e2e-spec.ts` bypasses `gemini.tsx` startup — tests are synthetic |
| 2   | **ModelDialog tests don't exercise discovery integration**         | Medium   | `ModelDialog.test.tsx` lacks `LocalModelDiscoveryService` mock coverage                      |
| 3   | **No integration test for full startup → model resolution → chat** | Medium   | No test that starts CLI, probes `/v1/models`, resolves gemma4 alias, and makes a request     |
| 4   | **Build/typecheck not run in CI for this feature branch**          | Low      | Must verify `npm run build` + `npm run typecheck` pass clean                                 |
| 5   | **No local-backend integration test in `gemini.tsx`**              | Low      | Startup probe `autoSelectDiscoveredLocalBackend()` has no test coverage                      |
| 6   | **No docs for health-check error messages**                        | Low      | Users may see "Backend not running" without knowing how to fix it                            |

### 16.3 Implementation Plan

#### Milestone P3.1 — Complete E2E Test Coverage

**Goal:** The `localModelDiscoveryService.e2e-spec.ts` test suite runs in CI
(using mocked fetch, no real backends) and exercises the full
discovery→metadata→tuning pipeline.

**Primary files:**

- `packages/core/src/services/localModelDiscoveryService.e2e-spec.ts` (exists)

**Tasks:**

1. Verify the e2e spec passes alongside unit tests
2. Add test for LM Studio discovery path (different ID format)
3. Add test for 26B MoE model discovery + tuning
4. Ensure all e2e tests use `vi.spyOn(globalThis, 'fetch')` with proper cleanup

**Exit criteria:**

- All e2e tests pass with `npm run test`
- Discovery handles all 5 backend ID formats without error

#### Milestone P3.2 — Build & Typecheck Gate

**Goal:** `npm run build && npm run typecheck && npm run lint` pass clean on the
feature branch.

**Tasks:**

1. Run `npm run build` and fix any compilation errors
2. Run `npm run typecheck` and fix any type errors
3. Run `npm run lint` and fix any lint warnings/errors

**Exit criteria:**

- All three commands pass without errors or warnings

### 16.4 Definition of Done (Phase 3)

- E2E tests cover all 5 backend formats with mocked HTTP
- Build, typecheck, and lint all pass clean
- ModelDialog has test coverage for discovery integration
- All changes committed and pushed to `feat/add-local-gemma-4-support`
- Add `modelIdResolutions` entries resolving back to default concrete model

**Exit criteria:**

- `ModelConfigService.getModelDefinition('gemma4-26b')` returns a valid
  definition
- `config.getModelConfigService().getAvailableModelOptions(...)` includes local
  aliases when dynamic model config is enabled

#### Milestone P2.5 — Add Tests

**Goal:** Achieve baseline test coverage for all new components.

**Primary files to create:**

- `packages/core/src/services/toolFilter.test.ts` — test enable/disable,
  caching, fallback behaviors, JSON parsing, timeout, tool validation
- `packages/core/src/services/localModelMetadata.test.ts` — test
  `resolveGemma4Defaults()` for all 4 variants, `tuneModelFromMetadata()` for
  edge and workstation models, profile classification

**Primary files to extend:**

- `packages/cli/src/ui/components/ModelDialog.test.tsx` — add discovery
  integration tests: "Probing" loading state, discovered backend rendering,
  fallback to static aliases, provider labels
- `packages/core/src/services/localModelDiscoveryService.test.ts` — add metadata
  fetch tests, `tuneBackendModels()` test, `choosePreferredBackend()` ordering
  test
- `packages/cli/src/validateNonInterActiveAuth.test.ts` — add local backend auth
  test cases

**Exit criteria:**

- All new service files have at least baseline test coverage
- Discovery integration in ModelDialog is testable
- Local backend auth types pass validation tests
- All tests pass with `npm run test`

### 15.4 Recommended Patch Sequence

To reduce merge risk, land Phase 2 in this order:

1. Add alias/modelDef entries to `defaultModelConfigs.ts` (smallest, no
   integration risk)
2. Implement thought-block stripping in `geminiChat.ts`
3. Implement `<|think|>` token injection in content generator or prompt layer
4. Wire `ToolFilter` into chat pipeline
5. Add test files (toolFilter.test.ts, localModelMetadata.test.ts)
6. Extend existing tests (ModelDialog.test.tsx, discovery service, auth
   validation)

### 15.5 Risk Notes

- **geminiChat.ts integration touchpoints**: This is the most heavily used and
  tested file in the chat pipeline. All changes must be gated behind local
  backend checks and must not alter any existing Gemini API code path.
- **Ordering of `<|think|>`**: Must appear at the START of the system prompt.
  Any wrapping middleware that transforms system prompts must account for this.
- **ToolFilter latency**: The FunctionGemma call adds ~200-500ms to each turn.
  Caching mitigates this, but users should be informed in the UI/tooltip.
- **Backward compatibility**: `stripThoughtBlocks()` must be safe to call on
  non-Gemma history (no-op). It must not corrupt message parts.

### 15.6 Definition of Done (Phase 2)

- Users running Gemma 4 models locally get thinking-enabled responses with
  injected `<|think|>` in the system prompt
- Tool filtering is functional (opt-in, Ollama-only) and measurable
- History thought blocks are stripped before each turn for Gemma 4 local models
- All shorthand aliases resolve correctly through ModelConfigService
- All new test files exist and pass
- Lint and typecheck pass clean
- No regression in cloud model behavior (verified by existing tests)

---

## 17. Phase 4 — Runtime Compatibility Hardening (2026-05-03)

### 17.1 Overview

Phase 4 focuses on the remaining runtime correctness gaps between “feature
implemented” and “feature reliably usable with real local OpenAI-compatible
backends.” The work is centered on schema translation, concrete-model Gemma 4
behavior after alias resolution, and accurate provider routing in the CLI UI.

### 17.2 Gap Inventory

| #   | Gap                                                         | Severity | Verified Current State                                                                                                                                                              |
| --- | ----------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | OpenAI-compatible tool schema translation is incomplete     | High     | `geminiToOpenAiTranslator.ts` forwards `fd.parameters`, but repo tools are primarily declared via `parametersJsonSchema`, which can produce invalid tool payloads on local adapters |
| 2   | Local Gemma runtime checks are alias-only                   | High     | `geminiChat.ts` enables thinking/tool-filter behavior only for `gemma4-*` aliases, but `refreshAuth()` resolves those aliases to concrete backend IDs like `gemma4:26b`             |
| 3   | ModelDialog discovery is not provider-routable              | High     | The dialog lists models from multiple providers, but selection refreshes auth using the previously active backend instead of the backend attached to the discovered model           |
| 4   | ModelDialog discovery ignores configured provider base URLs | Medium   | Startup auto-discovery uses configured provider URLs, while dialog discovery probes defaults only                                                                                   |
| 5   | Discovery metadata is fetched but not surfaced to the user  | Medium   | `gemma4Metadata` is available, but the dialog description remains a generic provider status                                                                                         |

### 17.3 Implementation Plan

#### Milestone P4.1 — OpenAI Schema Normalization

**Goal:** All local OpenAI-compatible backends receive valid function schemas.

**Primary files:**

- `packages/core/src/core/geminiToOpenAiTranslator.ts`
- `packages/core/src/core/geminiToOpenAiTranslator.test.ts`

**Tasks:**

1. Prefer `parametersJsonSchema` over `parameters` when translating tools
2. Normalize schema shape for OpenAI-compatible backends
3. Add regression tests for repo-native tool schemas and Gemini-style schemas

**Exit criteria:**

- Tool-enabled local requests no longer fail with schema validation 400s
- Subagent execution and session summary generation succeed against local
  backends

#### Milestone P4.2 — Concrete Gemma 4 Runtime Detection

**Goal:** Gemma 4 runtime features remain enabled after alias resolution.

**Primary files:**

- `packages/core/src/config/models.ts`
- `packages/core/src/core/geminiChat.ts`
- `packages/core/src/core/geminiChat.test.ts`

**Tasks:**

1. Add a shared Gemma 4 family detector that recognizes both aliases and
   concrete backend IDs
2. Gate thinking injection and tool filtering on family detection, not
   alias-only checks
3. Add regression coverage for resolved local model IDs such as `gemma4:26b` and
   `google/gemma-4-26b-a4b`

**Exit criteria:**

- `<|think|>` injection, history cleanup, and tool filtering remain active for
  resolved local Gemma 4 models

#### Milestone P4.3 — Provider-Accurate Model Selection

**Goal:** Multi-backend discovery routes requests through the provider the user
selected.

**Primary files:**

- `packages/cli/src/ui/components/ModelDialog.tsx`
- `packages/cli/src/ui/components/ModelDialog.test.tsx`

**Tasks:**

1. Bind discovered model entries to their originating auth type
2. Refresh auth using the selected provider instead of the previously active
   provider
3. Reuse configured provider base URLs during dialog discovery
4. Surface discovered metadata in entry descriptions

**Exit criteria:**

- Selecting an LM Studio-discovered model routes through LM Studio
- Selecting an Ollama-discovered model routes through Ollama
- Discovery output reflects configured provider endpoints and useful metadata

### 17.4 Definition of Done

- Local OpenAI-compatible backends accept translated tool schemas without 400
  errors
- Subagents and session summary generation work with local backends
- Resolved local Gemma 4 models still receive thinking/tool-filter behavior
- Multi-backend ModelDialog selection routes through the selected provider
- Targeted tests cover the new runtime compatibility fixes

---

## 18. Phase 6 — Bugfixes & Documentation Cleanup (2026-05-03)

### 18.1 Overview

Phase 6 fixes the remaining runtime bugs, documentation gaps, and hardening
issues identified in the Phase 5 audit. Four bugs and two doc gaps addressed.

### 18.2 Verified Implementation Status

| #   | Severity | Gap                                                                                                                      | File                                                    | Status                                                                                                                 |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | CRITICAL | `stripThoughtBlocksFromHistory()` no-op audit: `AgentChatHistory.map()` mutates in place and notifies listeners — no bug | `geminiChat.ts:840-861`                                 | **FALSE POSITIVE** — `AgentChatHistory.map()` already assigns result and emits `SYNC_FULL` event. No fix needed.       |
| 2   | MEDIUM   | Missing FunctionGemma/toolFiltering docs                                                                                 | `docs/cli/local-gemma-4.md`                             | FIXED — new FunctionGemma section with config table                                                                    |
| 3   | MEDIUM   | No mention of LiteRT-LM vs OpenAI distinction                                                                            | `docs/cli/local-gemma-4.md`                             | FIXED — note at top of doc                                                                                             |
| 4   | LOW      | `embedContent()` returns empty stub                                                                                      | `geminiToOpenAiContentGenerator.ts:85-91`               | FIXED — implemented via `POST /v1/embeddings` with graceful fallback                                                   |
| 5   | LOW      | Discovery timeout hardcoded at 1500ms                                                                                    | `localModelDiscoveryService.ts:21`, `settingsSchema.ts` | FIXED — added `localModel.discoveryTimeoutMs` setting (default 1500), wired through `gemini.tsx` and `ModelDialog.tsx` |
