# TASK-03: Team-aware Orchestration: Prompting and Tooling

## Objective

Enable the top-level Gemini CLI agent to use the instructions and agents of an
active team to fulfill user requests via delegation.

## Implementation Details

### 1. System Prompt Engineering (`packages/core/src/prompts/promptProvider.ts`)

- [ ] Add `activeTeam?: TeamDefinition` to the `SystemPromptOptions` interface.
- [ ] In `PromptProvider.getCoreSystemPrompt(context, ...)`:
  - [ ] If an active team exists, retrieve its `TeamDefinition`.
  - [ ] Pass the active team to the prompt composition logic.
- [ ] Update `snippets.ts`:
  - [ ] Add `renderActiveTeam(team?: TeamDefinition)`:
    - [ ] If a team is active, render a section:
      ```
      # Active Agent Team: ${team.displayName}
      ${team.instructions}
      You should prioritize delegating tasks to this team's agents whenever appropriate.
      ```
  - [ ] Update `getCoreSystemPrompt` to call `renderActiveTeam`.

### 2. Tool Prioritization (`packages/core/src/config/config.ts`)

- [ ] In `registerSubAgentTools(registry: ToolRegistry)`:
  - [ ] Identify which sub-agents are part of the active team.
  - [ ] Enhance the descriptions of `SubagentTool`s that belong to the team to
        indicate they are part of the active team.
  - [ ] Consider adding a priority flag to team tools so they appear higher in
        the model's tool list.

## Verification

- Unit tests for system prompt generation with and without an active team.
- Manual inspection of the prompt context in debug logs to verify team
  instructions injection.
- Verify that team agents are listed as available tools for the top-level agent.
