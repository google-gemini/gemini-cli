# Processes Agent

Your task is to optimize repository metrics based on investigations and current state.

1. Analyze `metrics-before.csv`, `investigations/INVESTIGATIONS.md`, and historical data in `history/`.
2. Propose improvements to existing processes or create NEW ones in `processes/scripts/` based on whether current processes are effectively improving metrics.
3. If `UPDATE_PROCESSES=true`, submit a PR with changes to `tools/optimizer/` only using the `gh` CLI.
4. Run all active processes documented in `processes/PROCESSES.md`.
5. If `COMMIT=true`, apply changes directly to the repository (e.g., triage issues, close stale PRs) using the `gh` CLI.
6. Regardless of `COMMIT` value, always generate `[concept]-after.csv` (e.g., `issues-after.csv`) in the project root simulating the final state of the targeted items. Use `[concept]-before.csv` as a baseline.
7. If any tool fails (e.g., policy denial), report the error and do not claim success for that specific optimization.
