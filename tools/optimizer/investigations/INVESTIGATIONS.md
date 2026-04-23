# Deep-Dive Investigations

This file documents ad hoc investigations performed to understand contributing factors to metrics.

| Investigation | Metric | Script | Findings |
|---------------|--------|--------|----------|
| Triage Backlog Analysis | open_issues | `analyze_issues.js` | 578/1000 issues are untriaged. 854/1000 are unassigned. 406 have 0 comments. |
| Community PR Latency | latency_pr_community | `analyze_community_prs.js` | 65/66 successful community PRs are stalled waiting for review (REVIEW_REQUIRED). |
| Stale Issue Analysis | open_issues | `stale_issues.js` | 152 issues are > 30 days old with 0 comments. |
| Maintainer Workload | workload | `maintainer_workload.csv` | 13 active maintainers, ~77 issues per maintainer ratio. |
| PR Conflict Analysis | latency_pr_community | `check_merge_conflicts.js` | 37/80 community PRs have merge conflicts. 34/80 are truly ready for review (Mergeable + CI Success). |
| Untriaged Deep Dive | open_issues | `analyze_untriaged.js` | 614/1000 untriaged issues are > 1 month old. Top reporter has 18 untriaged issues. |

## Hypotheses and Findings

### Metric: `open_issues` (Current: 2876)
- **Hypothesis 1**: High count is due to a massive triage backlog.
  - **Evidence**: 1122 issues (39%) have `status/need-triage`.
  - **Conclusion**: Supported. Triage is the primary bottleneck.
- **Hypothesis 2**: High count is due to stale/low-quality reports.
  - **Evidence**: 614 untriaged issues are > 30 days old. Many are missing template sections.
  - **Conclusion**: Supported. Automated stale-closure and template enforcement are needed.

### Metric: `latency_pr_community_hours` (Current: 75.24)
- **Hypothesis 1**: Latency is due to CI failures.
  - **Evidence**: Only 2/80 sampled community PRs had FAILURE status. 66/80 had SUCCESS.
  - **Conclusion**: Refuted.
- **Hypothesis 2**: Latency is due to waiting for maintainer review.
  - **Evidence**: 34/80 community PRs are Mergeable + CI Success and in `REVIEW_REQUIRED` state.
  - **Conclusion**: Supported for about half of the PRs.
- **Hypothesis 3**: Latency is due to author-side merge conflicts.
  - **Evidence**: 37/80 community PRs have CONFLICTING status.
  - **Conclusion**: Strongly Supported for about half of the PRs.

## Root Causes
1. **Manual Triage Overload**: 1122 untriaged issues for 13 maintainers.
2. **Review Bottleneck**: 34 ready-to-review community PRs are being neglected.
3. **Communication Gap**: Authors are not being notified when their PRs become unmergeable, leading to "stale conflicts".
4. **Stale Debt**: Over 600 issues are > 1 month old and untriaged.

## Actionable Data
- `author_stale_prs.csv`: Targets for author conflict nudges.
- `ready_for_review_prs.csv`: High-priority review targets for maintainers.
- `untriaged_high_quality.csv`: High-quality untriaged issues for immediate attention.
