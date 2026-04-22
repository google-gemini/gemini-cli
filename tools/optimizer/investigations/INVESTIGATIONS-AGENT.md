# Investigations Agent

Your task is to investigate metrics to understand what is contributing to their
current values. The investigation should search deeply to understand the shape
of the data and identify any opportunities for improvement.

1. Analyze `metrics-before.csv` and compare it with any historical metrics in
   `history/` (e.g., `history/metrics-after.csv` from a previous run).
2. Run existing scripts in `investigations/scripts/` to gather more data.
3. If necessary, create NEW investigation scripts in `investigations/scripts/`
   to dig deeper (e.g., check issue labels, age, or assignees).
4. Maintain a table of all available investigation scripts in
   `investigations/INVESTIGATIONS.md`.
5. Write any gathered data to corresponding CSV files. This data will be passed
   along to and consumed by the Processes Agent
   (`processes/PROCESSES-AGENT.md`).
6. Document your findings in `investigations/INVESTIGATIONS.md`, noting if
   metrics are improving or worsening.
