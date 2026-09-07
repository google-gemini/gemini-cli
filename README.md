# ZOE

> **Engineering, not autocomplete.**

```text
 ╭────────────────────────────────────╮
 │ ZOE                                │
 │ Engineering, not autocomplete.     │
 ╰────────────────────────────────────╯
```

Zoe is an independent, terminal-native Socratic engineering platform. 

Most modern AI coding assistants act as autocomplete crutches — hallucinating dependencies, generating bloated boilerplate, and degrading software craftsmanship. **Zoe takes the opposite stance.** Zoe is a collaborative engineering partner that questions assumptions, analyzes architecture, challenges design trade-offs, and guides you toward simple, robust solutions through Socratic dialogue.

Zoe will **never** silently overwrite your files or commit code behind your back. Zoe acts as an advisor and mentor, leaving code ownership and agency firmly with the human engineer.

---

## 🌟 Key Capabilities

### 1. 🧠 Socratic Mentor Engine & Behavioral Policies
Zoe classifies developer intent and dynamically adapts its behavioral policy:
- **`learning`**: Deep-dives into fundamental principles and concepts without rushing to code.
- **`problem_solving`**: Breaks complex problems into step-by-step design decisions.
- **`debugging`**: Drives systematic hypothesis generation, isolating root causes before suggesting fixes.
- **`reviewing`**: Socratic code reviews examining maintainability, edge cases, and performance.
- Commands: `/learn <topic>`, `/solve <problem>`, `/debug <issue>`, `/review [target]`, `/explain`, `/hint`, `/policy [name]`.

### 2. ✂️ Ponytail — The Minimalist Code Philosopher
Named after the minimalist software philosophy, Ponytail questions every line of code and external dependency:
- Audits `package.json` for unused or heavy packages with standard-library equivalents.
- Computes cyclomatic complexity and nesting depth to highlight refactoring targets.
- Commands: `/ponytail [target]`, `/simplify [target]`.

### 3. 📐 Archify — Terminal-Native Visual Reasoning
Engineering architecture should be visual. Archify renders ASCII system topologies and sequential execution pipelines directly inside the terminal:
- Generates clean ASCII component boxes with bidirectional data flows.
- Visualizes request/data pipelines step-by-step.
- Commands: `/archify [target]`, `/diagram <pipeline>`.

### 4. 📈 Concept Knowledge & Memory Graph
Zoe tracks your engineering growth over time. As you interact, Zoe builds a persistent concept graph in `.zoe/knowledge.json`:
- Tracks concept mastery levels (`novice`, `intermediate`, `advanced`, `mastered`).
- Calibrates system prompts automatically to match your experience level (avoiding patronizing explanations for concepts you have already mastered).
- Commands: `/knowledge [query]`, `/progress`, `/mastered <concept>`, `/practice <concept>`.

### 5. 🎯 Socratic Challenge Mode & Active Practice
Zoe generates knowledge-driven architectural dilemmas and design trade-off challenges based on your active project:
- Tests understanding of real-world failure modes, concurrency, scalability, and state management.
- Evaluates your proposed solutions Socratically rather than grading with binary true/false.
- Commands: `/challenge [topic]`, `/quiz [topic]`.

### 6. 🔍 Deep Codebase Context & Symbol Indexer
Instant multi-language symbol extraction without heavy compiler dependencies:
- Indexes classes, interfaces, types, functions, and methods across **TypeScript/JavaScript**, **Python**, and **Go**.
- Powers an in-memory inverted index for lightning-fast symbol lookups.
- Equips Zoe's internal agent harness with the read-only `inspect_symbol` tool.
- Commands: `/symbols [query]`, `/find <query>`.

### 7. 🛡️ Security & Read-Only Capability Matrix
Zoe enforces a strict, capability-based security model:
- `filesystem.read`: **ALLOW**
- `git.read`: **ALLOW**
- `filesystem.write`: **DENY** (Enforced by default)
- `code.patch`: **DENY** (Enforced by default)
- `code.generate`: **DENY** (Enforced by default)
- `git.commit`: **DENY** (Enforced by default)

### 8. Model Providers
Zoe connects to installed local CLI tools (`agy`, `codex`, `claude`) and the Ollama daemon. Use `/model <provider>` or `/model <provider>:<model>` to select one. The current default is Antigravity (`agy`); install and authenticate your chosen CLI before chatting. For Ollama, start the daemon and pull the model you select, for example `llama3.2`.

Groq, OpenRouter, and `/key` are not implemented in this version. `--model placeholder` is an offline smoke-test mode that returns a fixed response, without model inference.

---

## 🕹️ Slash Commands Reference

| Command | Arguments | Description |
| :--- | :--- | :--- |
| `/help` | — | Display all available slash commands and descriptions |
| `/model` | `[name]` | Inspect current model or switch active model (e.g. `/model ollama:llama3.2`) |
| `/policy` | `[name]` | Inspect or switch active Socratic policy (`socratic`, `learning`, `debugging`, etc.) |
| `/learn` | `<topic>` | Start a Socratic conceptual deep-dive into a computer science or engineering topic |
| `/solve` | `<problem>` | Begin guided, step-by-step problem breakdown |
| `/debug` | `<issue>` | Perform root cause analysis and hypothesis-driven debugging |
| `/review` | `[target]` | Perform Socratic code review focused on trade-offs and edge cases |
| `/explain` | `[topic]` | Receive high-level conceptual explanations with real-world analogies |
| `/hint` | `[context]` | Request a targeted conceptual hint without giving away the solution |
| `/ponytail` | `[target]` | Invoke the Minimalist Code Philosopher for dependency and complexity critique |
| `/simplify` | `[target]` | Get concrete suggestions for eliminating boilerplate and reducing nesting |
| `/archify` | `[target]` | Render an ASCII system architecture topology diagram |
| `/diagram` | `<flow>` | Render a step-by-step ASCII flow pipeline diagram |
| `/knowledge` | `[query]` | Inspect your recorded concept knowledge graph and mastery ratings |
| `/progress` | — | View concept mastery statistics and learning trajectory |
| `/mastered` | `<concept>` | Mark an engineering concept as mastered in your knowledge store |
| `/practice` | `<concept>` | Mark a concept as practicing for future guidance |
| `/challenge` | `[topic]` | Start a Socratic engineering dilemma challenge |
| `/quiz` | `[topic]` | Quick conceptual check-in on a specific topic |
| `/symbols` | `[query]` | Scan and list symbols (classes, functions, types) in the workspace |
| `/find` | `<query>` | Inspect symbol signatures and exact file locations |
| `/clear` | — | Clear terminal screen and message history |
| `/exit` | — | Exit Zoe session |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `>= 20.0.0`
- **npm**: `>= 10.0.0`
- **Ollama** (optional, for local LLMs): [ollama.com](https://ollama.com)

### Installation

#### Local Development
```bash
# Clone the repository
git clone https://github.com/Abinjshaju/cli-zoe.git
cd cli-zoe

# Install dependencies
npm install

# Build all packages
npm run build

# Run Zoe
./bin/zoe
```

#### Piped input
```bash
printf 'Explain this project\n' | ./bin/zoe --model ollama:llama3.2
printf 'hello\n' | ./bin/zoe --model placeholder
```
Piped requests run sequentially and finish before Zoe exits at end of input. Slash commands are supported; `/exit` stops processing subsequent lines.

#### CLI Flags
```bash
# Check version
./bin/zoe --version
# zoe v0.1.0

# Display CLI help
./bin/zoe --help

# Start with a specific Ollama model
./bin/zoe --model llama3.2
```

---

## 🏗️ Repository Architecture

Zoe is structured as a clean, decoupled monorepo:

```text
cli-zoe/
├── bin/
│   └── zoe                          # Executable shell runner
├── packages/
│   ├── core/                        # @zoe/core — Headless intelligence engine
│   │   ├── src/
│   │   │   ├── challenges/          # Challenge generator & practice engine
│   │   │   ├── config/              # User configuration (~/.zoe/config.json)
│   │   │   ├── events/              # Strongly-typed EventBus
│   │   │   ├── indexer/             # Symbol extractor & workspace index
│   │   │   ├── memory/              # Knowledge graph & persistent memory
│   │   │   ├── mentor/              # Intent classifier & behavioral policies
│   │   │   ├── permissions/         # Capability matrix & security enforcer
│   │   │   ├── providers/           # ModelProvider (Ollama, Placeholder)
│   │   │   ├── session/             # SessionEngine coordinator
│   │   │   ├── skills/
│   │   │   │   ├── archify/         # ASCII boxes, flow visualizer, arch renderer
│   │   │   │   └── ponytail/        # Dependency auditor, complexity analyzer
│   │   │   └── tools/               # Read-only filesystem, git, project & symbol tools
│   │   └── index.ts
│   │
│   └── cli/                         # zoe — Terminal user interface
│       ├── src/
│       │   ├── commands/            # Slash command registry & handlers
│       │   ├── ui/                  # React + Ink terminal interface
│       │   │   ├── components/      # Header, MessageList, Box widgets
│       │   │   ├── input/           # Interactive input prompt & history
│       │   │   ├── screens/         # MainScreen layout coordinator
│       │   │   └── theme/           # Terminal color palette & styles
│       │   └── index.ts             # CLI entrypoint & flag parser
│       └── package.json
│
├── LICENSE                          # Apache 2.0 License
├── NOTICE                           # Attribution notice
└── package.json                     # Monorepo root manifest
```

---

## 🧪 Testing & Verification

```bash
# Run all unit test suites
npm test

# Run strict TypeScript validation
npm run typecheck

# Build and pack distribution tarballs
npm run build
npm run pack
```

---

## 📄 License & Attribution

Zoe is open-source software licensed under the **Apache License, Version 2.0**. See [LICENSE](LICENSE) for the full license text.

This project originated as a fork of Google's Gemini CLI and was subsequently restructured and refactored into an independent, terminal-native Socratic engineering platform. See [NOTICE](NOTICE) for original project attributions.
