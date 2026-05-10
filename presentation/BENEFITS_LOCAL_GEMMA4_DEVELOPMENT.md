# Local Gemma 4 for Development — Benefits & Features

Companion note for Gemini CLI **local Gemma 4** support (OpenAI-compatible
backends). For measured scenarios and timings, see
[REPORT_LOCAL_GEMMA4.md](./REPORT_LOCAL_GEMMA4.md). For configuration detail,
see [docs/cli/local-gemma-4.md](../docs/cli/local-gemma-4.md).

---

## Why run Gemma 4 locally?

### Benefits for developers

| Benefit                         | What it means in practice                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Privacy & data control**      | Source code, prompts, file paths, and intermediate reasoning stay on hardware you control (or your org’s network). No round-trip to hosted inference for the main chat model when fully local.                |
| **Predictable cost**            | After hardware is paid for, incremental usage does not accrue per-token cloud charges for the primary model. Useful for long sessions, tight loops, and CI-style experiments (with appropriate runners).      |
| **Offline-capable workflows**   | Once models are pulled and the backend is running, core coding assistance can continue without external API availability—subject to optional tools (web search, cloud auth, etc.) still needing connectivity. |
| **Latency you can tune**        | End-to-end delay is bounded by your GPU/CPU and quantization choices—not shared cloud capacity. Edge variants (E2B/E4B) favor interactive iteration; MoE/dense variants favor depth over raw speed.           |
| **Model choice per task**       | Swap weights (26B MoE, 31B dense/cloud path, E4B/E2B) without changing how you invoke the CLI—aliases and discovery map friendly names to whatever is Installed locally.                                      |
| **Compliance-friendly posture** | Organizations that restrict external LLM traffic can still adopt agentic CLI patterns when paired with approved local inference stacks and policies.                                                          |
| **Reproducibility**             | Pin exact backend model IDs via `**localModel.modelMapping`\*\* so teammates and automation resolve the same weights across machines that share naming conventions.                                           |

---

## Product features (Gemini CLI)

### Multi-backend inference

Gemini CLI speaks **OpenAI-compatible** HTTP to common local stacks:

- **Ollama**, **LM Studio**, **llama.cpp** server, **vLLM**, **SGLang**

Each backend gets sensible **default base URLs** and optional overrides via
`**localModel.baseUrl`**,
`**localModel.providers.<name>.baseUrl`**, or environment variables (for example `**OLLAMA_HOST**`, `**LM_STUDIO_API_BASE**`).

### Discovery & UX

- **Live discovery** probes backends (with configurable
  `**discoveryTimeoutMs**`) and surfaces Gemma 4-capable models in the
  `**/model**` flow when multiple providers are available.
- **Grouped presentation**: manual model selection can show **provider + model
  id +** hints such as quantization and context length (enriched from **Ollama**
  metadata where available).
- **TUI settings**: `**/settings**` can expose **Local Backend**, **Local
  Backend Base URL**, per-provider base URLs, and discovery timeout—no manual
  JSON edit required for endpoint tweaks.

### Stable aliases (no hard-coded GPU SKUs in your muscle memory)

Six CLI aliases resolve against **whatever your backend lists** under
`**GET /v1/models**`:

| Alias                  | Role                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `**gemma4**`           | Preferred “best available” default (favors 26B-class, then 31B-class, then E4B, then E2B, then first listing). |
| `**gemma4-26b**`       | MoE / 26B-class variant.                                                                                       |
| `**gemma4-31b**`       | Dense 31B-class (non-cloud id match).                                                                          |
| `**gemma4-31b-cloud**` | Cloud-hosted 31B-style offering when exposed by the backend (e.g. some Ollama tags).                           |
| `**gemma4-e4b**`       | Edge E4B-class.                                                                                                |
| `**gemma4-e2b**`       | Edge E2B-class.                                                                                                |

`**localModel.modelMapping**` overrides any alias → concrete backend model id
(must exist in the catalog).

### Flexible activation

Pick what fits automation vs. interactive use:

- `**security.auth.selectedType**` → `local-ollama`, `local-lm-studio`, etc.
- `**GEMINI_LOCAL_BACKEND**` or `**--local-backend**`
- `**localModel.backend**` (also seeds env when unset)

Switching to local auth can **normalize** a previously hosted-style selection
toward `**gemma4**` so you land on a local weight instead of a cloud id.

### Agentic development affordances

| Capability                                | Notes                                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tool use**                              | Local Gemma 4 runs through the same agent loop patterns as remote models; suitability depends on the served checkpoint and backend.                                                   |
| **Optional FunctionGemma tool filtering** | Small sidecar model can **pre-filter tool declarations** to save context on constrained setups (**Ollama-oriented** flow; configurable enable/model/fallback/cache).                  |
| **Thinking / reasoning channels**         | Thought-style output can be surfaced or stripped for compatibility with downstream APIs and history (`\*\*<                                                                           |
| **Multimodal (text + image)**             | Supported where the pulled Gemma 4 variant and backend expose vision inputs—validated in integration-style scenarios on Ollama in project reports.                                    |
| **Context-aware tuning hooks**            | Discovery builds **metadata-driven tuning hints** (context length, vision/tool flags, thinking defaults) from `**localModelMetadata`** plus **Ollama `/api/show`\*\* when applicable. |

### Compression & auxiliary tasks

When local auth is active, chat-compression-related **runtime model
registrations** can track the **resolved local model id**, keeping auxiliary
behavior aligned with the main session model.

---

## Choosing a variant for development work

Orienting guidance (hardware-dependent; treat latency numbers as
environment-specific):

| Tier                | Typical role                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| **E2B**             | Fast feedback, lightweight edits, exploratory prompts on modest hardware.                              |
| **E4B**             | Stronger general assistant behavior with still moderate resource use.                                  |
| **26B MoE**         | Strong default for sustained coding when VRAM allows; common `**gemma4`\*\* alias target when present. |
| **31B / 31B-cloud** | Heavier reasoning or cloud-assisted strong model without forcing everyone onto identical local GPUs.   |

---

## Relationship to other Gem features

- **LiteRT-LM + `gemini gemma …`** targets **Gemma 3** style workflows with
  different binaries and ports—not the same path as **local Gemma 4 via
  OpenAI-compatible servers**.
- **Hosted `gemma-4-*-it`** IDs remain **Google API** flows with normal Gemini
  auth; **local `gemma4`** aliases are for **local catalogs**.

---

## Suggested talking points (elevator pitch)

1. **Same Gemini CLI agent UX**, **your silicon**, **your data boundary.**
2. **Aliases + discovery** reduce operational friction—“install weights once,
   type `**gemma4`\*\*.”
3. **Optional tool filtering** keeps fat tool lists from dominating context on
   smaller models.
4. **/settings + env + flags** cover beginners through CI/CD.

---

## References

- [REPORT_LOCAL_GEMMA4.md](./REPORT_LOCAL_GEMMA4.md) — integration outcomes and
  timings
- [docs/cli/local-gemma-4.md](../docs/cli/local-gemma-4.md) — user guide and
  configuration reference
- [plans/LOCAL_GEMMA_4_PRD.md](../plans/LOCAL_GEMMA_4_PRD.md) — full
  product/design context
