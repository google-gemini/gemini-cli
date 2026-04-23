# Repository Metrics

This file documents the metrics tracked by `optimizer1000`.

| Metric | Description | Script | Goal |
|--------|-------------|--------|------|
| open_issues | Number of open issues in the repo | `metrics/scripts/open_issues.js` | Lower is better |
| user_touches_* | User touches prior to completion of issues and PRs (overall, maintainers, community) | `metrics/scripts/user_touches.js` | Lower is better |
| latency_* | Time from open to completion for issues and PRs in hours (overall, maintainers, community) | `metrics/scripts/latency.js` | Lower is better |
| throughput_* | Completion rate of PRs and issues per day, plus cycle time per issue (overall, maintainers, community) | `metrics/scripts/throughput.js` | Greater is better (rate), Lower is better (cycle time) |
| time_to_first_response_* | Time to first response for issues and PRs in hours (overall, maintainers, 1p) | `metrics/scripts/time_to_first_response.js` | Lower is better |
| review_distribution | Variance of reviews completed across the core maintainer group | `metrics/scripts/review_distribution.js` | Lower variance is better (even distribution) |
| domain_expertise | Tracks if reviewers in the maintainers group have domain expertise based on git blame of changed files and their neighbors | `metrics/scripts/domain_expertise.js` | Higher is better |
