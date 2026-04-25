# Lessons Learned: Gemini CLI Bot

## Repository Health Analysis (April 25, 2026)

### Metrics Baseline
- **Open Issues**: 1000
- **Open PRs**: 490
- **Community PR Latency**: 50.18h
- **Maintainer PR Latency**: 17.50h
- **Community Issue Latency**: 46.87h
- **Time to First Response**: 1.43h (Overall), 0.17h (Maintainers)

### Key Findings
1.  **Backlog Management Conflict**: The repository currently has three overlapping stale-handling workflows. Specifically, `gemini-scheduled-stale-issue-closer.yml` is an aggressive, immediate-close script that violates the **Graceful Closures** policy. It closes issues that are >3 months old and >10 days idle without any prior nudge or warning.
2.  **Community Bottleneck**: There is a significant gap (32.68h) between community and maintainer PR latency. While initial triage is fast (0.17h), the path to merge for community members is 3x slower than for maintainers.
3.  **Process Redundancy**: `stale.yml` (using `actions/stale`) is already configured to handle stale items gracefully (60 days idle -> 14 days grace). The existence of a secondary, aggressive closer suggests a past attempt to clear the backlog that bypassed standard quality policies.

### Formulated Hypotheses
- **Hypothesis 1**: Consolidating stale-handling into the graceful `stale.yml` workflow will improve contributor sentiment without significantly increasing the backlog, as `stale.yml` is already active.
- **Hypothesis 2**: Introducing a targeted nudge for community PRs that exceed 48 hours of maintainer inactivity will reduce `latency_pr_community_hours` by ensuring these contributions don't "fall through the cracks" after initial triage.

### Actions Taken / Proposed
- **Action 1 (Policy Alignment)**: Remove the aggressive `gemini-scheduled-stale-issue-closer.yml` workflow. This ensures all issue closures follow the "Nudge then Close" principle.
- **Action 2 (Metric Improvement)**: [Future] Implement a 48h maintainer nudge for community PRs to address the latency gap.

## Future Investigations
- Investigate why 1000 issues remain open despite multiple stale closers. It's possible many have the `exempt-issue-labels` (e.g., `help wanted`).
- Analyze the impact of "linked issue" policy on community PR throughput.

## Critique Phase Analysis (April 25, 2026)

### Technical Audit
1.  **PR Nudge Script (`pr-nudge.ts`)**:
    - **Initial State**: Had a hardcoded limit of 100 PRs (insufficient for the ~490 open PRs). Event filtering was brittle, relying on `author_association` which is not always present on all timeline events (e.g., labeling).
    - **Fixes Applied**:
        - Increased `MAX_PRS_TO_CHECK` to 500 to ensure full coverage of the open backlog.
        - Hardened `maintainerEvents` filtering to include more engagement types (`review_requested`, `milestoned`, etc.) and added bot-filtering.
        - Improved date parsing robustness for mixed event types (`created_at` vs `submitted_at`).
    - **Performance**: Confirmed concurrency batching (5) is appropriate for preventing rate limit spikes while maintaining speed.
2.  **Workflow Deletion**:
    - **Validation**: Confirmed that `.github/workflows/stale.yml` is active and follows the required grace period policies (60d + 14d). The deleted aggressive closer was indeed redundant and policy-violating.

### Final Verdict: [APPROVED]
The combined changes successfully remove non-compliant aggressive automation and replace it with targeted, metric-driven engagement tools. The `pr-nudge.ts` script is now technically robust and correctly wired into the `Pulse` reflex layer.
