# Optimization Processes

This file documents the automated processes implemented to drive repository metrics toward their goals.

| Process | Goal | Script | Description |
|---------|------|--------|-------------|
| Stale Manager | Reduce `open_issues` | `stale_manager.ts` | Identifies inactive community issues (>30d) and maintainer issues (>90d), labels them as Stale, and eventually closes them. |
| Triage Router | Reduce untriaged backlog | `triage_router.ts` | Automatically assigns untriaged issues to maintainers or requests more info for low-quality reports. |
| PR Nudge | Reduce `latency_pr_community` | `pr_nudge.ts` | Nudges maintainers for community PRs that pass CI but are stalled waiting for review (>48h). |

## Implementation Details

### Stale Manager
- **Trigger**: No activity for 30 days (Community) or 90 days (Maintainer Only).
- **Grace Period**: 14 days after labeling as Stale.
- **Exemptions**: None, but maintainers get more time.

### Triage Router
- **Batch Size**: 50 issues per run.
- **Routing**: Round-robin across 13 active maintainers.
- **Quality Check**: Issues with <50 chars body are asked for more info instead of being routed.

### PR Nudge
- **Criteria**: Community PR, Non-Draft, SUCCESS CI, REVIEW_REQUIRED, >48 hours old.
- **Action**: Add `status/nudge` label and comment pinging the maintainers team.
