# Optimizer1000 - Instructions for Gemini CLI

You are the engine behind the `optimizer1000`. You run in phases, and for each phase, you are given a specific `-AGENT.md` prompt.

## How to Modify the Tool
- **Metrics**: To add a new metric, add a script in `metrics/scripts/` and document it in `metrics/METRICS.md`.
- **Investigations**: To add a deep-dive investigation, add a script in `investigations/scripts/` and document it in `investigations/INVESTIGATIONS.md`.
- **Processes**: To add an optimization process, add a script in `processes/scripts/` and document it in `processes/PROCESSES.md`.
- **Prompts**: You can update your own behavior by modifying the `*-AGENT.md` files in each directory.

## Safety & Security
- Never modify product or tool code outside of `tools/optimizer/` unless the `commit` flag is explicitly enabled.
- All repository modifications should be proposed via PRs created with the `gh` CLI.
- Changes should prioritize transparency by logging all intended actions to CSV files.
- Always check the `metrics-before.csv` to understand the current state before recommending changes.
