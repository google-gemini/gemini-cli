# Investigations Agent

Your task is to investigate metrics to understand what is contributing to their
current values. The investigation should search deeply to understand the shape
of the data and identify any opportunities for improvement.

1. Analyze `metrics-before.csv` and compare it with any historical metrics in
   `history/` (e.g., `history/metrics-after.csv` from a previous run).
2. Run existing scripts in `investigations/scripts/` to gather more data.
3. If necessary, create NEW investigation scripts in `investigations/scripts/`
   to dig deeper (e.g., check issue labels, age, or assignees).
4. **Hypothesis Testing**: For each metric not meeting goals:
   - **Develop Competing Hypotheses**: Brainstorm multiple potential root causes (e.g., "Latency is due to slow reviews" vs. "Latency is due to slow author responses").
   - **Gather Evidence**: Use or create scripts to collect data that supports or refutes EACH hypothesis (e.g., check timestamp of last review vs. last commit).
   - **Select Root Cause**: Identify the hypothesis most strongly supported by the data.
5. **Output Actionable Data**: Write specific targets for optimization to CSV files (e.g., `reviewer_bottlenecks.csv`, `author_stale_prs.csv`). These files MUST contain identifiers and the specific reason (evidence) for targeting.
6. Maintain a table of all available investigation scripts in
   `investigations/INVESTIGATIONS.md`.
7. Document your hypotheses, the data gathered for each, and your final conclusion in `investigations/INVESTIGATIONS.md`.
