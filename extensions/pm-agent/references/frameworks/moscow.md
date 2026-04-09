# MoSCoW Prioritization Framework

## Overview

MoSCoW is a prioritization technique that classifies requirements into four
categories to help teams agree on what to deliver in a given timeframe.

## Categories

### Must Have (Mo)

- Critical requirements without which the release is a failure
- Non-negotiable for the current delivery cycle
- If even one Must Have is not met, the release should be reconsidered

**OSS signals**: Labeled as `priority: critical` or `blocker`, affects core
functionality, security vulnerability, data loss risk.

### Should Have (S)

- Important requirements that are not critical
- Workarounds exist but are painful
- Should be included if at all possible

**OSS signals**: High reaction count, multiple duplicate issues, labeled
`priority: high`, affects user experience but not core functionality.

### Could Have (Co)

- Desirable but not necessary
- Included if time and resources allow
- First to be dropped if schedule pressure

**OSS signals**: Feature requests with moderate interest, quality-of-life
improvements, labeled `enhancement`, `nice-to-have`.

### Won't Have This Time (W)

- Explicitly out of scope for the current cycle
- Acknowledged and documented for future consideration
- Important to record to manage expectations

**OSS signals**: Long-standing issues with no activity, `wontfix` label,
requires major architecture changes, blocked by external dependencies.

## Decision Criteria

| Factor            | Must                 | Should           | Could               | Won't        |
| ----------------- | -------------------- | ---------------- | ------------------- | ------------ |
| Impact if missing | Release fails        | Significant pain | Minor inconvenience | None for now |
| Workaround exists | No                   | Painful          | Easy                | N/A          |
| User demand       | Universal            | High             | Moderate            | Low          |
| Effort vs. value  | Any effort justified | Good ROI         | Only if easy        | Defer        |

## Application Tips

- Start by identifying Must Haves (should be ~60% of effort)
- Should Haves should fill ~20% of available effort
- Could Haves get the remaining ~20%
- Won't Haves are explicitly listed to set expectations
