# Gemini CLI Bot (Cognitive Repository)

This directory contains the foundational architecture for the `gemini-cli-bot`,
transforming the repository into a proactive, evolutionary system.

It implements a dual-layer approach to balance immediate responsiveness with
long-term strategic optimization.

## Layered Execution Model

### 1. System 1: The Pulse (Reflex Layer)

- **Purpose**: High-frequency, deterministic maintenance and data collection.
- **Frequency**: 30-minute cron (`.github/workflows/gemini-cli-bot-pulse.yml`).
- **Implementation**: Pure TypeScript/JavaScript scripts.
- **Role**: Currently focuses on gathering repository metrics
  (`tools/gemini-cli-bot/metrics/scripts`).
- **Output**: Action execution and `metrics-before.csv` artifact generation.

### 2. System 2: The Brain (Reasoning Layer)

- **Purpose**: Strategic investigation, policy refinement, and
  self-optimization.
- **Frequency**: 24-hour cron (`.github/workflows/gemini-cli-bot-brain.yml`).
- **Implementation**: Agentic Gemini CLI phases.
- **Role**: Analyzing metric trends and running deeper repository health
  investigations.

## Directory Structure

- `metrics/`: Contains the deterministic runner (`index.ts`) and individual
  TypeScript scripts (`scripts/`) that use the GitHub CLI to track metrics like
  open issues, PR latency, throughput, and reviewer domain expertise.
- `processes/scripts/`: Placeholder directory for future deterministic triage
  and routing scripts.
- `investigations/`: Placeholder directory for agentic root-cause analysis
  phases.
- `critique/`: Placeholder directory for policy evaluation.
- `history/`: Storage for downloaded metrics artifacts from previous runs.

## Usage

To manually collect repository metrics locally, run the following command from
the workspace root:

```bash
npm run metrics
```

This will execute all scripts within `metrics/scripts/` and output the results
to a `metrics-before.csv` file in the root directory.
