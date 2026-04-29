# Gemini CLI Bot (Cognitive Repository)

This directory contains the foundational architecture for the `gemini-cli-bot`,
transforming the repository into a proactive, evolutionary system.

It implements a dual-layer approach to balance immediate responsiveness with
long-term strategic optimization.

## Layered Execution Model

### 1. System 1: The Pulse (Reflex Layer)

- **Purpose**: High-frequency, deterministic maintenance.
- **Frequency**: 30-minute cron (`.github/workflows/gemini-cli-bot-pulse.yml`).
- **Implementation**: Pure TypeScript/JavaScript scripts.
- **Classification**: Optionally utilizes Gemini CLI for high-confidence
  semantic classification (e.g., triage, labeling, sentiment) while preferring
  deterministic logic for equivalent tasks.
- **Phases**:
  - **Reflex Execution**: Runs triage, routing, and automated maintenance
    scripts in `reflexes/scripts/`.
- **Output**: Real-time action execution.

### 2. System 2: The Brain (Reasoning Layer)

- **Purpose**: Strategic investigation, policy refinement, and proactive
  self-optimization.
- **Frequency**: 24-hour cron (`.github/workflows/gemini-cli-bot-brain.yml`).
- **Implementation**: Agentic Gemini CLI phases.
- **Phases**:
  - **Metrics Collection**: Executes scripts in `metrics/scripts/` to track
    repository health (Open issues, PR latency, throughput, etc.).
  - **Phase 1: Reasoning (Metrics & Root-Cause Analysis)**: Analyzes time-series
    metric trends and repository state to identify bottlenecks or productivity
    gaps, tests hypotheses, and proposes script or configuration changes to
    improve repository health and maintainability.
  - **Phase 2: Critique**: A technical and logical validation layer that reviews
    proposed changes for robustness, actor-awareness, and anti-spam protocols.
  - **Phase 3: Publish**: Automatically promotes approved changes to Pull
    Requests, handles branch management, and responds to maintainer feedback.

## Directory Structure

- `metrics/`: Deterministic runner (`index.ts`) and scripts for tracking
  repository metrics via GitHub CLI.
- `reflexes/scripts/`: Deterministic triage and routing scripts executed by the
  Pulse.
- `brain/`: Prompt templates and logic for strategic root-cause analysis (Phase
  1: `metrics.md`) and technical validation (Phase 2: `critique.md`).
- `history/`: Persistent storage for time-series metrics artifacts.
- `lessons-learned.md`: The bot's structured memory, containing the Task Ledger,
  Hypothesis Ledger, and Decision Log.

## Usage

### Local Metrics Collection

To manually collect repository metrics locally, run the following command from
the workspace root:

```bash
npx tsx tools/gemini-cli-bot/metrics/index.ts
```

This will execute all scripts within `metrics/scripts/` and output the results
to `tools/gemini-cli-bot/history/metrics-before.csv`.

### Development

When modifying the bot's logic:

1. **Reflexes**: Add or update scripts in `reflexes/scripts/`.
2. **Reasoning**: Update the prompts in `brain/` to refine how the bot
   identifies bottlenecks.
3. **Critique**: Update the prompts in `critique/` to strengthen the validation
   of proposed changes.
