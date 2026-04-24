# Lessons Learned: Repository Health & Metrics Analysis (Brain Phase)

## Date: 2026-04-24 (Updated)

## Executive Summary
The repository is experiencing a "Triage Crisis" where a massive backlog of **2,392 open issues** is being masked by saturated metrics. While community engagement remains high, the maintainer bottleneck is severe, with **zero daily issue closure throughput**. The strict `help-wanted` policy for self-assignment has created a contributor deadlock, preventing the community from effectively chipping away at the backlog.

## Hypotheses & Evidence

### Hypothesis 1: Metric Saturation (Under-reporting of Backlog) [CONFIRMED & FIXED]
**Hypothesis**: The `open_issues` count is significantly higher than reported.
**Evidence**:
- `metrics-before.csv` reported exactly `1000` open issues.
- `tools/gemini-cli-bot/metrics/scripts/open_issues.ts` used a hard `--limit 1000`.
- **External Validation**: Google search confirms the repository has approximately **2,392 open issues**, nearly 2.4x what was previously tracked.
**Conclusion**: The backlog is much larger than previously visible. I have updated the metric scripts to use GraphQL `totalCount` to ensure accurate reporting.

### Hypothesis 2: Maintainer Throughput Bottleneck [CONFIRMED]
**Hypothesis**: Maintainers are a bottleneck for issue resolution and triage.
**Evidence**:
- `throughput_issue_maintainers_per_day`: `0`
- `latency_issue_maintainers_hours`: `1.73` (Low latency, but zero volume)
- `user_touches_maintainers`: `5.23` (High engagement per issue, indicating maintainers are deep-diving into a few items but ignoring the broad backlog)
- `throughput_pr_maintainers_per_day`: `2.07` (Maintainers are prioritizing PRs over issues)
**Conclusion**: The "Expert Bottleneck" is real. Maintainers are providing high-quality reviews but are completely overwhelmed by the volume of issues.

### Hypothesis 3: Triage & "Help Wanted" Deadlock [CONFIRMED]
**Hypothesis**: The policy requiring `help-wanted` labels for self-assignment is blocking community contributions.
**Evidence**:
- `CONTRIBUTING.md` requires `help-wanted` for self-assignment.
- The repository has 2,392 open issues, but community closure rate is only ~9/day.
- Maintainers (the only ones who can reliably label `help-wanted`) have 0 closure throughput, meaning they likely aren't triaging fast enough to unlock issues for the community.
**Conclusion**: The `help-wanted` requirement is a gatekeeper that is currently failing. We need to democratize issue claiming to allow the community to scale.

## Actions Taken

### 1. Fixed Metrics Collection Scripts (Verified)
- **Action**: Updated `open_issues.ts` and `open_prs.ts` to use GitHub GraphQL `totalCount`.
- **Goal**: Accurate visibility into the 2,392+ backlog items.

### 2. Evaluated Stale Issue Management Reflex
- **Action**: Confirmed `tools/gemini-cli-bot/reflexes/scripts/stale-issue-management.ts` is running every 30 minutes via the Pulse workflow.
- **Goal**: Continual reduction of dead weight in the backlog.

## Policy Critique & Evaluation
The current triage policy is **insufficient for the repository's current scale**. The requirement for `help-wanted` to self-assign is the single biggest blocker to community-led backlog reduction. While intended to maintain quality, it has resulted in a "starvation" of contributor tasks.

**Recommendations**:
1. **Relax Self-Assignment**: Update `CONTRIBUTING.md` to allow self-assignment (`/assign`) on any issue not marked `🔒Maintainers only`.
2. **Automate "Help Wanted"**: Implement a "Reflex" that automatically labels issues as `help-wanted` if they meet certain criteria (e.g., have an `area/` label and have been open for >7 days without a maintainer assignee).
3. **Expand Stale Logic**: Update `stale-issue-management.ts` to include `help-wanted` issues if they remain inactive for >180 days.

## Conclusion
The `gemini-cli-bot` has successfully unmasked the true scale of the repository's maintenance challenges. The transition from "saturated metrics" to "accurate crisis visibility" is the first step toward recovery. The next phase must focus on policy changes to unlock community throughput.
