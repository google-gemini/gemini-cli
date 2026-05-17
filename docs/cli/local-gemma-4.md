# Using local Gemma 4 models (experimental)

Gemini CLI supports running local **Gemma 4** models through OpenAI-compatible
local backends such as [Ollama](https://ollama.com/),
[LM Studio](https://lmstudio.ai/),
[Llama.cpp](https://github.com/ggerganov/llama.cpp),
[vLLM](https://github.com/vllm-project/vllm), and
[SGLang](https://github.com/sgl-project/sglang).

When a local backend is active, Gemini CLI discovers available Gemma 4 variants
automatically, shows them in the model dialog, and maps user-friendly aliases
like `gemma4` to the concrete model served by your backend.

<!-- prettier-ignore -->
> [!NOTE]
> Local model support is **experimental**. Discovery, alias resolution, and tool-filtering behavior may change in future releases.

## Supported local backends

| Backend   | Default base URL            | Environment variable    |
| --------- | --------------------------- | ----------------------- |
| Ollama    | `http://localhost:11434/v1` | `OLLAMA_HOST`           |
| LM Studio | `http://localhost:1234/v1`  | `LM_STUDIO_API_BASE`    |
| Llama.cpp | `http://localhost:8080/v1`  | `LLAMA_CPP_SERVER_BASE` |
| vLLM      | `http://localhost:8000/v1`  | `VLLM_API_BASE`         |
| SGLang    | `http://localhost:30000/v1` | `SGLANG_API_BASE`       |

## Quick start

### 1. Start a local backend

For example, with Ollama:

```bash
ollama run gemma4:31b
```

Keep the server running so Gemini CLI can probe it at
`http://localhost:11434/v1`.

### 2. Tell Gemini CLI to use the local backend

You can select a local backend in three ways:

**Option A: Environment variable**

```bash
export GEMINI_LOCAL_BACKEND=ollama   # or lm-studio, llama-cpp, vllm, sglang
gemini
```

**Option B: `--auth-type` flag**

```bash
gemini --auth-type=local-ollama
```

**Option C: Settings file**

Add the following to your user or workspace `settings.json`:

```json
{
  "security": {
    "auth": {
      "selectedType": "local-ollama"
    }
  },
  "localModel": {
    "baseUrl": "http://localhost:11434/v1"
  }
}
```

### 3. Select a model

Run the `/model` command inside Gemini CLI. When a local backend is active, the
dialog shows:

- **Auto (Gemma 4 Local)** — use the preferred Gemma 4 model for the active
  backend
- **Manual** — pick a specific discovered variant or alias

If multiple backends are discovered, models are grouped by provider (e.g.,
_Ollama_, _LM Studio_).

## Gemma 4 aliases

When a local backend is active, Gemini CLI recognizes these aliases and resolves
them to the best matching discovered model:

| Alias              | Description                                                   |
| ------------------ | ------------------------------------------------------------- |
| `gemma4`           | Preferred Gemma 4 model (falls back to 26B → 31B → E4B → E2B) |
| `gemma4-26b`       | Gemma 4 26B parameter variant                                 |
| `gemma4-31b`       | Gemma 4 31B (non-cloud) variant                               |
| `gemma4-31b-cloud` | Gemma 4 31B cloud variant                                     |
| `gemma4-e4b`       | Gemma 4 E4B (expert 4B) variant                               |
| `gemma4-e2b`       | Gemma 4 E2B (expert 2B) variant                               |

You can also pass an alias directly on startup:

```bash
gemini --auth-type=local-ollama --model=gemma4
```

## Model discovery

On startup, Gemini CLI probes all configured backends concurrently (default
timeout: **1500 ms**). If a backend responds and reports Gemma 4 models, they
are listed in the model dialog with metadata such as:

- Quantization level (e.g., `Q4_K_M`)
- Context length (e.g., `262144`)
- Parameter size (e.g., `30.7B`)

If no backends are discovered, the model dialog falls back to the static alias
list above.

### Disable discovery or change the timeout

Add to `settings.json`:

```json
{
  "localModel": {
    "discoveryTimeoutMs": 3000
  }
}
```

## Per-provider configuration

You can configure a different base URL for each backend independently:

```json
{
  "localModel": {
    "providers": {
      "ollama": {
        "baseUrl": "http://ollama.internal:11434"
      },
      "lm-studio": {
        "baseUrl": "http://lm-studio.local:1234"
      }
    }
  }
}
```

## Custom alias-to-model mappings

If your backend serves a model under a non-standard name, map the alias to the
exact model ID:

```json
{
  "localModel": {
    "modelMapping": {
      "gemma4": "my-custom-gemma4-name",
      "gemma4-31b": "google/gemma-4-31b-it"
    }
  }
}
```

## Tool filtering (Ollama only)

When using Ollama, you can enable experimental **FunctionGemma-based tool
pre-filtering** to reduce context usage. Only Ollama supports this feature.

```json
{
  "localModel": {
    "toolFiltering": {
      "enabled": true,
      "model": "functiongemma:270m",
      "maxContextMessages": 3,
      "fallbackBehavior": "all-tools",
      "cacheResults": true,
      "cacheTtl": 30000
    }
  }
}
```

- `enabled` — turn tool filtering on or off
- `model` — the lightweight model used for filtering decisions
- `maxContextMessages` — how many recent messages are sent to the filter model
- `fallbackBehavior` — what to do if filtering fails (`all-tools`, `no-tools`,
  or `core-only`)
- `cacheResults` / `cacheTtl` — cache filter results to avoid redundant calls

## Switching back to a hosted model

To stop using a local backend and return to a hosted Gemini model, change the
auth type:

```bash
/auth --type=oauth-personal
```

Or update `settings.json`:

```json
{
  "security": {
    "auth": {
      "selectedType": "oauth-personal"
    }
  }
}
```

## Troubleshooting

| Issue                                          | Solution                                                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Backend not discovered                         | Verify the server is running and accessible at the configured `baseUrl`. Increase `discoveryTimeoutMs` if needed. |
| Alias cannot be resolved                       | Ensure the backend serves a model whose ID contains the alias pattern (e.g., `26b`, `31b`, `e4b`, `e2b`).         |
| `GEMINI_LOCAL_BACKEND` not recognized          | Use one of: `ollama`, `lm-studio`, `llama-cpp`, `vllm`, `sglang`.                                                 |
| Wrong model selected when multiple are running | Use `localModel.modelMapping` to pin the alias to the exact model ID.                                             |

## Related topics

- [Model selection (`/model` command)](./model.md)
- [Model routing](./model-routing.md)
- [Configuration reference](../reference/configuration.md)
