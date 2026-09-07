# ZOE Roadmap

> **Engineering, not autocomplete.**

This document outlines the phased development roadmap for Zoe, evolving from a clean independent terminal foundation into a Socratic engineering mentor.

---

## 🎯 Phased Roadmap

### ✅ Milestone 1 — Independent CLI (Current)
- [x] Hard fork from Gemini CLI on `refactor/zoe-core`.
- [x] Retain Apache 2.0 license and required attribution.
- [x] Purge all Google/Gemini branding, Google OAuth, Vertex/GCP integrations, and Clearcut telemetry.
- [x] Prune monorepo down to clean `packages/core` and `packages/cli`.
- [x] Decouple presentation from model: implement `SessionEngine`, typed `EventBus`, and `PlaceholderRuntime`.
- [x] Polish Ink terminal UI: custom Zoe box banner, `zoe > ` input prompt with history, slash commands (`/help`, `/clear`, `/exit`, `/version`), and signal handling (`Ctrl+C`).

### 🔜 Milestone 2 — Model Provider Abstraction
- Define unified, minimal `ModelProvider` contract:
  ```typescript
  interface ModelProvider {
    chat(request: ChatRequest): AsyncIterable<ModelEvent>;
  }
  ```
- Implement local-first `OllamaProvider` (e.g. `llama3.2`) with zero auth overhead.
- Keep all provider implementations quarantined behind `providers/` so core and UI remain completely vendor-agnostic.
- Expand to `AnthropicProvider`, `OpenAIProvider`, and `OpenRouterProvider`.

### 🛡️ Milestone 3 — Capability & Permission Matrix
- Define explicit capability guards before introducing agent tools:
  - `filesystem.read`: ALLOW
  - `filesystem.search`: ALLOW
  - `filesystem.write`: DENY
  - `shell.inspect`: ALLOW
  - `shell.execute`: ASK
  - `git.status` / `git.diff` / `git.log`: ALLOW
  - `git.commit`: DENY
  - `code.patch` / `code.generate`: DENY
- Deliver read-only codebase comprehension MVP (explain repos, trace routes, find bugs without modifying source code).

### 🧠 Milestone 4 — Mentor Engine & Socratic Guidance
- Introduce intent classifier (`Learn`, `Solve`, `Debug`).
- Implement Socratic mentoring policies for slash commands: `/learn`, `/solve`, `/hint`, `/review`, `/debug`, `/explain`.
- Guide developers to discover solutions rather than generating autocomplete sludge.

### ✂️ Milestone 5 — Ponytail Skill
- Integrate Ponytail as an extensible skill:
  - Can we remove the requirement?
  - Can existing project code or stdlib solve it?
  - Can existing dependencies solve it?
  - Do we actually need new code?

### 📐 Milestone 6 — Archify Visual Reasoning
- Integrate Archify as a visual reasoning skill.
- Generate architecture, sequence, and data-flow diagrams into `.zoe/architecture/`.

### 📊 Milestone 7 — Knowledge & Concept Tracking
- Track developer concept mastery and progress across projects (`.zoe/learning/`).
