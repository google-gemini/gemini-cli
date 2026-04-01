# TASK-01: Agent Team Definitions, Loader, and Registry

## Objective

Define the fundamental data models and services for discovering, loading, and
managing Agent Teams within the `packages/core` module.

## Implementation Details

### 1. Types (`packages/core/src/agents/types.ts`)

- [ ] Define the `TeamDefinition` interface:
  ```typescript
  export interface TeamDefinition {
    name: string; // The directory name (slug)
    displayName: string; // From frontmatter 'display_name'
    description: string; // From frontmatter 'description'
    instructions: string; // The body text of TEAM.md
    agents: AgentDefinition[]; // Loaded from the 'agents/' subfolder
    metadata?: {
      hash?: string;
      filePath?: string;
    };
  }
  ```
- [ ] Extend existing schemas (e.g., using `zod`) to support the metadata
      validation for teams.

### 2. Team Loader (`packages/core/src/agents/teamLoader.ts`)

- [ ] Create a new service to scan directories for teams.
- [ ] `loadTeamsFromDirectory(dir: string)`:
  - [ ] Reads all subdirectories in `dir`.
  - [ ] For each subdirectory, looks for `TEAM.md`.
  - [ ] Uses `parseAgentMarkdown` (from `agentLoader.ts`) or similar logic to
        extract frontmatter and instructions.
  - [ ] Looks for an `agents/` subfolder within the team directory.
  - [ ] Calls `loadAgentsFromDirectory` (from `agentLoader.ts`) on that
        subfolder.
  - [ ] Returns an array of `TeamDefinition` and any loading errors.

### 3. Team Registry (`packages/core/src/agents/teamRegistry.ts`)

- [ ] Create a new `TeamRegistry` class to manage loaded teams.
- [ ] Methods:
  - [ ] `initialize()`: Triggers team discovery.
  - [ ] `getAllTeams()`: Returns all loaded teams.
  - [ ] `setActiveTeam(name: string)`: Sets the current active team.
  - [ ] `getActiveTeam()`: Returns the currently active `TeamDefinition`.
- [ ] Ensure that agents loaded as part of a team are also registered in the
      global `AgentRegistry` (so they can be surfaced as `SubagentTool`s).

## Verification

- Unit tests in `packages/core/src/agents/teamLoader.test.ts`.
- Unit tests in `packages/core/src/agents/teamRegistry.test.ts`.
- Verify that a mocked team directory structure is correctly parsed into a
  `TeamDefinition` list.
