# TASK-05: Active Team Visual Indicator and Sample Coding Team

## Objective

Provide visual feedback to the user when a team is active and create a sample
"Coding Team" to verify the end-to-end orchestration flow.

## Implementation Details

### 1. Status Indicator (`packages/cli/src/ui/components/StatusRow.tsx`)

- [ ] Add an `ActiveTeamIndicator` component.
- [ ] Render the indicator within the `StatusRow` (next to Shell or Approval
      mode indicators).
- [ ] If a team is active, display: `[ Team: ${displayName} ]` in a distinctive
      color.
- [ ] Ensure that it is clearly visible during idle states.

### 2. Sample Coding Team

- [ ] Create `.gemini/teams/coding-team/`.
- [ ] Create `TEAM.md`:
  - [ ] Frontmatter: `name: coding-team`, `display_name: Coding Team`,
        `description: A team of coder, reviewer, and tester agents.`
  - [ ] Body:
    ```
    You are managing a software development task.
    Use the 'coder' agent for implementing new code or major refactors.
    Use the 'tester' agent to write or run tests for the changes.
    Use the 'reviewer' agent to ensure the code and tests meet quality standards.
    Prioritize delegating to these specialists rather than performing the implementation yourself.
    ```
- [ ] Create `.gemini/teams/coding-team/agents/`:
  - [ ] `coder.md`: Agent with code editing tools.
  - [ ] `reviewer.md`: Agent with code review instructions.
  - [ ] `tester.md`: Agent with test running tools.

## Verification

- Manual verification of the active team indicator.
- End-to-end verification of the Coding Team by asking a complex task (e.g.,
  "Implement feature X with tests and review").
- Verify that the top-level agent correctly delegates to the team agents as
  instructed.
