# TASK-07: External Agent Registry and Team Marketplace placeholders

## Objective

Enable teams to include external agents and provide the "marketplace" UI
placeholders that suggest where one might find or browse external agents.

## Implementation Details

### 1. Team Discovery (`packages/core/src/agents/teamLoader.ts`)

- [ ] Ensure that `TEAM.md` can specify agents with `kind: external` and
      `provider`.
- [ ] If a team specifies an external agent that isn't found locally, provide a
      clear error message or auto-generate a polyfill definition.

### 2. Team Marketplace UI (`packages/cli/src/ui/components/TeamSelectionDialog.tsx`)

- [ ] Populate the "Browse Team Marketplace" and "Create New Team" placeholders
      from TASK-04.
- [ ] For the marketplace, show a list of "Curated Teams" (hardcoded for the
      MVP) that include external agents.
  - Example: "The Polyglot Team" (Gemini + Claude Code + Codex).
- [ ] **Visual Language:**
  - Add color-coded tags next to agents in the team list:
    - **Anthropic Purple** for Claude Code (`provider: 'claude-code'`).
    - **OpenAI Green** for Codex (`provider: 'codex'`).
    - **Google Blue** for Gemini agents.
  - Use a "Multi-Model" badge if a team contains agents from multiple providers.

### 3. Team Builder/Creator (MVP)

- [ ] In the "Create New Team" placeholder, provide a simple prompt to create a
      `TEAM.md` in a new subdirectory.
- [ ] Allow users to specify `providers` for their agents in this builder.

### 4. Status Indicator Enhancement (`packages/cli/src/ui/components/StatusRow.tsx`)

- [ ] If a team is active, the `ActiveTeamIndicator` should show the "Provider"
      icons or tags for the agents in the team.
  - Example: `[ Team: Polyglot (G, C, X) ]` where G/C/X are color-coded letters
    for Gemini/Claude/Codex.

## Verification

- Manual verification of the "Marketplace" and "Create Team" placeholders in the
  selection dialog.
- Verify that a team with an external Claude Code agent displays correctly and
  its instructions are correctly surfaced.
