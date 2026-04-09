---
name: roadmap-generator
description: >-
  Generates or updates product roadmaps based on current Issues, PR activity,
  commit velocity, and stated priorities. Outputs timeline views, milestone
  definitions, and alignment analysis. Activate when asked to "create roadmap",
  "update roadmap", or "what should we build next".
---

## Workflow

1. **Gather current state**: Ask the user for the target repository (`owner/repo`) if not already known.
   - Use `analyze_project_issues` (state: open, limit: 100) to get open Issues and their labels
   - Use `analyze_commit_velocity` (owner, repo, months: 3) to understand development pace
   - Check for an existing ROADMAP.md in the project if one is referenced

2. **Identify themes**: Group Issues and PRs into strategic themes:
   - Core functionality improvements
   - Developer experience
   - Performance and reliability
   - Ecosystem and integrations
   - Documentation and onboarding

3. **Estimate effort**: Based on commit velocity and issue complexity signals:
   - Small (1–2 days): Simple bug fixes, doc updates
   - Medium (3–5 days): Feature additions, moderate refactors
   - Large (1–2 weeks): New subsystems, major refactors
   - XL (2+ weeks): Architecture changes, new platforms

4. **Generate roadmap**: Produce a time-based roadmap with:
   - **Now** (current sprint/month): Items actively being worked on (evidence: recent PR activity)
   - **Next** (1–2 months): High-priority items ready to start (evidence: high RICE score, clear requirements)
   - **Later** (3–6 months): Strategic items needing planning
   - **Exploring** (future): Ideas under discussion

5. **Alignment check**: If an existing ROADMAP.md exists:
   - Compare planned items against actual development activity
   - Flag items that are behind schedule or no longer relevant
   - Identify work happening that is not on the roadmap

6. **Output format**:
   ```
   ## Roadmap — [Project Name]
   Generated: [date] | Based on: [N] issues, velocity: [M] commits/month

   ### Now (In Progress)
   | Theme | Item | Issue(s) | Effort | Status |
   |-------|------|----------|--------|--------|

   ### Next (1–2 months)
   ...

   ### Later (3–6 months)
   ...

   ### Exploring
   ...
   ```

## Important Notes

- `analyze_commit_velocity` requires `owner` and `repo` parameters — always pass them explicitly
- Null velocity values mean the metric was unavailable; note this in the roadmap header
- Base timeline estimates on actual commit velocity, not wishful thinking
- Flag dependencies between roadmap items
- Note which items have active contributors vs. need help
- Suggest which items could be labeled `good first issue` or `help-wanted`
