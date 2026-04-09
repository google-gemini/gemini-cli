---
name: requirements-analyzer
description: >-
  Analyzes GitHub Issues, PRs, and discussions to extract structured product
  requirements. Produces user stories, acceptance criteria, and dependency maps.
  Activate when asked to "analyze requirements", "what do users want", or
  "extract user stories".
---

## Workflow

1. **Gather data**: Use the `analyze_project_issues` MCP tool to fetch recent Issues. If the user specifies a topic, filter by relevant labels.

2. **Categorize issues** into:
   - Feature requests
   - Bug reports
   - UX feedback
   - Technical debt
   - Documentation gaps

3. **Extract requirements**: For each category, identify:
   - Explicit requirements (directly stated in the issue)
   - Implicit requirements (inferred from context, related issues, or comments)
   - Non-functional requirements (performance, security, accessibility)

4. **Generate user stories**: Transform extracted requirements into user stories using the format:
   ```
   As a [user type], I want [goal] so that [benefit].
   Acceptance criteria:
   - [ ] Criterion 1
   - [ ] Criterion 2
   ```

5. **Map dependencies**: Identify which requirements depend on others and flag potential blockers.

6. **Produce output**: Present a structured requirements document with:
   - Summary of sources analyzed
   - Categorized requirements table
   - User stories (top 10 by estimated impact)
   - Dependency map
   - Gaps and risks identified

## Important Notes

- Always cite the specific Issue/PR number for each extracted requirement
- Flag conflicting requirements across different issues
- Distinguish between "must have" and "nice to have" using MoSCoW terminology
- If the project has a ROADMAP.md, cross-reference requirements against it
