# Deep-Dive Investigations

This file documents ad hoc investigations performed to understand contributing factors to metrics.

| Investigation | Metric | Script | Findings |
|---------------|--------|--------|----------|
| Issue Labels | open_issues | `investigate_issues.cjs` | 1000 open issues. 60% (609) are stuck in `status/need-triage`. Other prominent labels: `area/agent` (339), `area/core` (271). High number of `status/possible-duplicate` (207). |
| PR Labels | open_community_prs | `investigate_prs.cjs` | 485 total open PRs. Major categories: `area/core` (215), `help wanted` (204). Many lack linked issues (`status/need-issue`: 86). |
| Metrics Comparison | all | N/A | Current metrics (open_issues: 1000, open_community_prs: 336, completed_community_prs: 1136) match the latest `metrics-after.csv` in the root exactly. Metrics are currently static/unchanged compared to recent runs. |
