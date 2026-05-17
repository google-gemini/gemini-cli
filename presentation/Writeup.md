# Gemini CLI: Local Gemma 4 Support

_Run Gemma 4 as a first-class, local reasoning engine in Gemini CLI—with
OpenAI-compatible discovery, smart aliasing, and agent tooling that match the
cloud experience._

**Tracks:**

- Primary: **Special Technology — Ollama** (Gemma 4 via Ollama as a first-class
  backend)
- Secondary: **Safety & Trust** (agent workflows on hardware you control).

---

## 1. Introduction

Gemini CLI is a terminal-based coding agent: it reads repositories, calls tools,
and carries multi-turn sessions against Gemini models. Until now, that
experience assumed hosted Gemini or related cloud auth.

This project turns **Gemma 4** into a first-class backend for the same CLI, with
**production-grade local support**: the CLI talks to **Gemma 4 weights served
locally** over an OpenAI-compatible surface, with **automatic model discovery**,
**stable aliases**, optional **tool-declaration filtering**, and full
**settings/TUI integration**.

The video demo walks real code paths—no mocked adapters—so what judges see is
exactly what users can run.

---

## 2. Problem and goals

**Problem.** Gemma 4 is designed to run locally with multimodal reasoning and
native function calling, but that power is hard to use inside a coding agent if:

- Every runtime names weights differently (`gemma4:26b` vs `gemma4:e4b` vs
  fine-tune tags).
- Switching from cloud auth to local backends breaks model selection and
  confuses users.
- Large tool schemas overwhelm smaller GPUs or low-VRAM quantizations.

**Goals.**

1. Treat **OpenAI-compatible** endpoints—`GET /v1/models` plus chat
   completions—as first-class, so Ollama, LM Studio, llama.cpp proxies, vLLM,
   and SGLang “just work.”
2. Let users type **`gemma4`** and have the CLI resolve to the **best locally
   available Gemma 4 variant**, instead of memorizing backend-specific ids.
3. Support common local runtimes (Ollama, LM Studio, llama.cpp, vLLM, SGLang)
   with sensible defaults and override hooks.
4. Preserve **agent loops**, **multimodal** flows, and **tool calling** wherever
   the chosen Gemma 4 checkpoint supports them.
5. Offer **optional tool filtering** via a smaller FunctionGemma-style companion
   so local deployments can trade latency for context headroom.
6. Back this with **automated tests** that run against real local Gemma 4 models
   when present.

From the user’s perspective, the experience should feel like: “Install Gemma 4
in Ollama, point Gemini CLI at it, type `/model gemma4`, and get the same agent
behavior you’d expect from the cloud—just on your own machine.”

---

## 3. Architecture

The work is split across **`packages/core`** (protocols, resolution, chat
behavior) and **`packages/cli`** (UX, settings, staRun Gemma 4 as a first-class,
local reasoning engine in Gemini CLI—with OpenAI-compatible discovery, smart
aliasing, and agent tooling that match the cloud experience.rtup).

### Auth and transport

New **`AuthType`** values (`local-ollama`, `local-lm-studio`, etc.) map to
**default base URLs**, such as `http://localhost:11434/v1` for Ollama.  
A helper **`resolveLocalBackendBaseUrl`** merges:
[github](https://github.com/ollama/ollama/issues/2430)

- per-session overrides (`localModel.baseUrl`),
- per-provider overrides (`localModel.providers.*`), and
- environment variables like `OLLAMA_HOST`, `LM_STUDIO_API_BASE`, etc.,

then normalizes the path to **`/v1`** so the same code can speak to multiple
runtimes with an OpenAI-style interface.

### Discovery and resolution

A **`LocalModelService`** calls each backend’s model catalog (`…/models` or
equivalent), normalizes entries, and **`filterGemma4Models`** keeps ids that
look like Gemma 4 chat models: names containing both `gemma` and `4` while
excluding `embed` and any reserved FunctionGemma-style ids.

On top, **`resolveModelName`** implements deterministic aliasing tuned to Gemma
4’s family structure.

- Bare **`gemma4`** resolves to the most capable Gemma 4 variant available
  locally, prioritizing 26B-class, then 31B-class, then E4B, then E2B, and
  finally the first matching listing.
- Aliases like **`gemma4-31b`** vs **`gemma4-31b-cloud`** are split by naming
  patterns so local and hosted usage stay unambiguous.
- A **`localModel.modelMapping`** table allows pinning any alias to an exact
  backend id when reproducibility or CI stability matters.

This gives humans a simple mental model (“use Gemma 4”) while still letting
power users and pipelines lock to specific checkpoints.

### Config integration

When authentication switches to a **local** backend, the **`Config`** layer
prevents users from being stranded on cloud-shaped model ids. Stored selections
that look like `gemini-*`, `gemma-*`, or auto-routed choices are normalized
toward the `gemma4` alias before resolution.

After **`resolveModelId`** chooses the concrete id, that resolved value is
stored and reused so that chat compression helpers and other auxiliary
components stay aligned with the same Gemma 4 checkpoint.

### Discovery service UI

A **`LocalModelDiscoveryService`** probes supported local backends in parallel
(with a configurable **`discoveryTimeoutMs`**), attaches **`gemma4Metadata`** to
discovered models, and chooses a **preferred** backend if multiple expose
Gemma 4.

- Default metadata (context length, rough size, intended use) is inferred from
  id substrings.
- Ollama backends are enriched with **`/api/show`** so the CLI can surface more
  accurate details.
- Preferred backend selection favors the one with **more** Gemma 4 variants,
  then follows a fixed priority order starting with Ollama, which is also a
  featured Special Technology track.

In the CLI, this powers clear, provider-labeled model lists instead of one
opaque dropdown.

### Chat runtime

The **`GeminiChat`** runtime detects sessions that use the **Gemma 4 local
family** and, when **`localModel.toolFiltering`** is enabled, runs a
**`ToolFilter`** pass over recent messages before the main model turn. A compact
FunctionGemma-class checkpoint scores tool relevance and emits a reduced schema,
which shrinks prompt size and helps smaller or aggressively-quantized Gemma 4
variants stay within context limits.

Where Gemma-style thought-channel traces are present, the runtime can strip or
truncate them from long histories while keeping final user-visible content
intact, so local sessions can run longer tool-heavy workflows on constrained
hardware.

### CLI experience

From the CLI, local Gemma 4 usage is controlled through a small number of flags
and commands:

- **`--local-backend`** and **`GEMINI_LOCAL_BACKEND`** select which local
  runtime to use for the session.
- **`/auth`** exposes local providers alongside hosted options.
- **`/model`** offers **`gemma4`** plus manual model picks, each row labeled by
  provider so users can see exactly where a model is running.
- **`/settings`** surfaces the key **`localModel`** URL and provider fields so
  configuring a new backend does not require hand-editing JSON files.

In practice: install Gemma 4 in Ollama, run `gemini --local-backend ollama`,
open `/model`, choose `gemma4`, and start coding.

---

## 4. How we used Gemma 4 specifically

We do not ship Gemma 4 weights; instead, we **wire Gemma 4 into Gemini CLI as
the reasoning core** whenever users opt into local inference. All instruction
following, tool use, and multimodal reasoning in local mode run against
user-supplied Gemma 4 checkpoints—e.g., an Ollama model like `gemma4:26b` or a
tuned variant.

The alias layer encodes **product intent** (“prefer workstation-class MoE when
present; fall back to smaller dense checkpoints gracefully”) while remaining
faithful to what each backend’s `/models` actually returns. Optional tool
filtering explicitly mirrors patterns practitioners use with open-weight stacks:
a **small, cheap** FunctionGemma-style model ranks tools and a **larger Gemma
4** model invests its capacity in the substantive answer.

---

## 5. Challenges and how we solved them

**Naming fragmentation.** Different vendors and fine-tuners expose different
tags, and `gemma4:latest` is not always the “best coder” or the most stable
choice. **Solution:** Regex-driven, deterministic alias resolution tuned to
Gemma 4’s variants, plus a **`modelMapping`** override layer and clear error
messages that list all available Gemma 4 ids when resolution fails.

**Auth vs model coupling.** Switching to local auth while a cloud-style model
string remained in config produced confusing “model not found” errors.
**Solution:** Explicit normalization to the `gemma4` alias when the stored model
id looks hosted, so users can switch auth modes without manually updating model
names.

**Metadata quality.** Not every backend exposes context length, quantization, or
function-calling support in a uniform way. **Solution:** Tiered defaults in a
**`localModelMetadata`** helper keyed by id substrings, upgraded
opportunistically via Ollama’s `show` API and other provider-specific metadata
endpoints.

**Tool overload on smaller models.** Full tool schemas can crowd out user and
code context on smaller or aggressively quantized Gemma 4 builds. **Solution:**
Optional FunctionGemma-based filtering with a cache and conservative fallbacks
(`all-tools`, `no-tools`, `core-only`) so, if the filter fails, behavior
degrades in a safe, predictable way.

**Tester reproducibility.** CI environments without Gemma 4 installed cannot run
live local-inference tests, but we still want coverage. **Solution:**
Integration tests **skip** cleanly when discovery finds no Gemma 4 models, while
unit tests cover resolution and configuration logic without requiring a running
backend.

---

## 6. Why these choices

**OpenAI-compatible surface.** We intentionally chose the OpenAI-style `/v1` API
instead of bespoke protocols, because major local runtimes (Ollama, LM Studio,
OpenAI-compatible proxies) already converge on it, and many libraries assume
that shape. This makes the feature usable today, without waiting for ecosystem
changes.

**Alias layer tuned to Gemma 4.** Developers think in terms of “use Gemma 4” or
“use the bigger one,” but CI and regulated environments need exact ids. We
bridge that gap with a human-friendly alias layer plus **`modelMapping`** for
cases where reproducibility matters more than convenience.

**Parallel discovery.** Probing backends in parallel keeps startup responsive
even when several runtimes are running on the same machine, and it drives
**accurate, provider-aware grouping** in the CLI model picker.

**Filtering opt-in, not mandatory.** We keep the default path as simple as “run
Gemma 4 with tools” so new users are not forced into extra configuration.
Advanced users can turn on filtering to reclaim context for code and history
when they are willing to pay a small latency cost.

Taken together, these choices turn Gemma 4 from “a model you can run locally”
into “a model you can build real, reproducible agent workflows on”—without
giving up the ergonomics of a cloud-first CLI.

---

## 7. Verification (proof of engineering)

Beyond the UI demo, the repository includes an
**`integration-tests/local-ollama-gemma4.test.ts`** suite that exercises:

- backend discovery for Gemma 4 via Ollama,
- alias resolution and `modelMapping`,
- `GEMINI_LOCAL_BACKEND` and `--local-backend` behavior,
- multimodal prompts and file tools such as `read_file`, and
- tool-filter flows and fallbacks.

These tests run end-to-end only when the host has a Gemma 4 model pulled, and
skip gracefully otherwise. Core **`LocalModelService`** tests lock in alias
semantics and resolution behavior independently of any local runtime. Together,
they demonstrate that the documented behavior is enforced in code, not
aspirational.

---

## 8. Impact

For users, this lowers the barrier to full-featured coding agents backed by
**Gemma 4 open weights**, especially where cloud access is expensive,
unreliable, or not allowed. A student with a single GPU, a team in a
privacy-sensitive environment, or a developer on a flaky connection can run the
same agent experience locally, with transparent configuration and test-backed
behavior.

This aligns directly with the hackathon’s focus on **Digital Equity &
Inclusivity** and **Safety & Trust**: capable tools that run on local hardware,
in reproducible ways, using open models that users can inspect, tune, and
extend.

---

Would you like a shorter, “speaker-notes” version of this that you can mirror in
your video script so the story and the writeup stay tightly aligned?
