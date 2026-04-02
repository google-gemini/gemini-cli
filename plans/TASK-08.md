# TASK-08: Interactive Team Creation Wizard

## Objective

Implement a guided, step-by-step CLI wizard to allow users to create new Agent
Teams without manually editing files and directories.

## Implementation Details

### 1. The Wizard Flow (`packages/cli/src/ui/components/TeamCreatorWizard.tsx`)

- [ ] Create a multi-step Ink component:
  - **Step 1: Identity**: Prompt for Team Name and Display Name (Text Input).
  - **Step 2: Objective**: Prompt for the orchestration instructions (Multiline
    Text Input). This guides the top-level agent on how to use the team.
  - **Step 3: Roster**: A multi-select list of available agents:
    - Include local agents from `.gemini/agents/`.
    - Include "External" templates: `Claude Code (External)`,
      `Codex (External)`.
  - **Step 4: Confirmation**: Display a summary and ask for final confirmation.

### 2. Scaffolding Service (`packages/core/src/agents/teamScaffolder.ts`)

- [ ] Create a service to handle the filesystem operations:
  - [ ] Create the directory `.gemini/teams/<slug>/`.
  - [ ] Generate the `TEAM.md` with the collected frontmatter and instructions.
  - [ ] Create the `agents/` sub-folder.
  - [ ] For each selected agent:
    - If it's an existing local agent, copy/link its definition.
    - If it's an "External" agent, generate a placeholder `.md` file with the
      correct `kind: external` and `provider`.

### 3. UI Integration (`packages/cli/src/ui/AppContainer.tsx`)

- [ ] In the `TeamSelectionDialog` (from TASK-04/07), when "Create New Team" is
      selected:
  - [ ] Set `isTeamCreatorActive(true)`.
- [ ] Render the `TeamCreatorWizard` overlay.
- [ ] On completion, refresh the `TeamRegistry` and return to the selection list
      with the new team highlighted.

## Verification

- Manual verification of the creation flow.
- Verify that the resulting directory structure and `TEAM.md` are valid and
  loadable.
- Unit tests for `teamScaffolder.ts`.
