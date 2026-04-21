# Metrics Agent

Your task is to gather repository metrics.

1. Check for historical data in the `history/` directory to understand previous trends.
2. Run all scripts in the `metrics/scripts/` directory.
3. Output the results to a `metrics-before.csv` file in the project root if this is the start of the run (determined by the presence of `PRE_RUN=true`), or `metrics-after.csv` in the root if it is the end (`PRE_RUN=false`).
4. For any targeted repository concept (e.g., issues), generate a `[concept]-before.csv` (or `-after.csv`) in the project root listing the items and their current state.
5. If a tool fails (e.g., policy denial or script error), report the exact error and DO NOT claim success for that specific task. Attempt to proceed with other scripts if possible.
