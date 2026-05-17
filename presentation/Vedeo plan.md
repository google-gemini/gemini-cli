# Video plan

Here’s a one‑page, ~2‑minute **recording checklist with what to show on screen
every ~10–15 seconds**. You can keep your script from before and just line it up
with these visuals.

---

## 0:00–0:10 — Hook (camera + title)

**On screen**

- Your face + small overlay text: “Local Gemma 4 in Gemini CLI” and “Gemma 4
  Good Hackathon”.
- [kaggle](https://www.kaggle.com/competitions/gemma-4-good-hackathon)

**You say (paraphrase)**

- Name, “Gemma 4 Good submission”, one‑liner: Gemma 4 as a local reasoning
  engine for Gemini CLI.

---

## 0:10–0:30 — Problem (simple slide)

**On screen**

- Slide with 3 short bullets:
  - “Different model names per backend”
  - “Cloud vs local model mismatch”
  - “Tool schemas blow up context”

Maybe small icons for “cloud”, “laptop”, “tools”.

**You say**

- Gemma 4 is great locally, but runtimes name weights differently, switching
  cloud→local breaks model selection, and big tool sets hurt smaller GPUs,
  especially for students / low‑connectivity / privacy‑sensitive teams.
  [youtube](https://www.youtube.com/watch?v=LMhV5EQ06wI)

---

## 0:30–0:40 — Solution title (slide)

**On screen**

- Slide: “Solution: Local Gemma 4 in Gemini CLI” with small Gemini CLI + Gemma 4
  logos / text. [geminicli](https://geminicli.com/docs/cli/model-routing/)

**You say**

- One sentence: “I added production‑grade local Gemma 4 support to Gemini CLI.”

---

## 0:40–0:55 — Solution summary (slide or diagram)

**On screen**

- Simple diagram:
  - Left: “Ollama / local runtimes (`/v1/models`)"
  - Middle: “Discovery + aliases + tool filter”
  - Right: “Gemini CLI agent”

**You say**

- CLI discovers Gemma 4 via OpenAI‑style `/v1` endpoints, you type `gemma4`, it
  picks the best local variant, keeps tools/multimodal, and can optionally run a
  small FunctionGemma‑style model to shrink tool schemas.
  [github](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/model-routing.md)

---

## 0:55–1:25 — Quick demo (terminal + TUI)

**On screen**

- Switch to terminal, font large.

**Steps to show (can be pre‑run, just re‑type quickly):**

1.

```bash
ollama pull gemma4:e4b
```

(Scroll if it’s already pulled; no need to wait.)
[youtube](https://www.youtube.com/watch?v=tQ9eIMVpMUs)

2.

```bash
gemini --local-backend ollama
```

[dev](https://dev.to/polar3130/using-gemini-cli-with-a-local-llm-5f5l)

3. Switch to Gemini CLI TUI, open `/model`, highlight `gemma4` row showing
   provider “ollama”.

4. Trigger one short command: paste a prompt like “Scan this folder and propose
   a refactor plan.” Show the assistant start responding (few lines is enough).

**You say**

- Explain that `gemma4:e4b` is pulled in Ollama, CLI is started with
  `--local-backend ollama`, `/model` lets you pick `gemma4` instead of raw ids,
  and then the agent runs the task fully on local Gemma 4.
  [knolli](https://www.knolli.ai/post/how-to-run-gemma-4-locally-with-ollama)

---

## 1:25–1:45 — Under the hood (short diagram)

**On screen**

- Go back to the earlier diagram, maybe zoom on the middle box:
  - “Discovery → Aliases → Tool filter → Chat runtime”.

**You say**

- One line on `/v1/models` discovery and Gemma‑4 filtering.
- One line on alias mapping (`gemma4` → concrete id, override table for CI).
- One line on small companion model picking relevant tools before the main Gemma
  4 call.
  [dev](https://dev.to/grovertek/running-gemma-4-locally-with-ollama-and-opencode-2h6)

---

## 1:45–1:55 — Proof (tests)

**On screen**

- Brief flash of your test file tree in the editor or terminal:
  `integration-tests/local-ollama-gemma4.test.*` and one or two test names.

**You say**

- “We have integration tests that only run when Gemma 4 is installed locally,
  covering discovery, alias resolution, backend selection, and tool‑filter
  flows, so this behavior is enforced in code, not just a demo.”
  [fossies](https://fossies.org/linux/gemini-cli/docs/core/local-model-routing.md)

---

## 1:55–2:05 — Impact & close

**On screen**

- Slide: “Impact: Equity & Trust” plus small icons (laptop, globe, lock).

**You say**

- “This supports **Digital Equity & Inclusivity** and **Safety & Trust**: a
  serious coding agent on a single GPU, offline or in constrained environments,
  using open weights and configurations you control.”
  [googlecloudgeminihackathon.devpost](https://googlecloudgeminihackathon.devpost.com/updates/33248-lights-camera-action-submission-video-tips-for-hackers)
- “Thanks for watching.”
