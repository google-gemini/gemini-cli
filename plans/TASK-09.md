# TASK-09: Team Registry Client and Remote Discovery

## Objective
Implement the backend client and discovery logic for browsing agent teams from a remote or local registry, similar to the Gemini CLI extension registry.

## Implementation Details

### 1. Type Definitions (`packages/core/src/agents/types.ts`)
- [ ] Define `RegistryTeam` interface:
  ```typescript
  export interface RegistryTeam {
    id: string;
    name: string; // The slug
    displayName: string;
    description: string;
    instructions: string;
    agents: Array<{
      name: string;
      provider: string; // 'gemini', 'claude-code', etc.
      description: string;
    }>;
    author?: string;
    stars?: number;
    lastUpdated?: string;
    version?: string;
    sourceUrl?: string; // Optional Git/GitHub source
  }
  ```

### 2. Team Registry Client (`packages/core/src/agents/teamRegistryClient.ts`)
- [ ] Create a new `TeamRegistryClient` class.
- [ ] Implement `fetchAllTeams()`:
  - Supports `https://` URLs (JSON files).
  - Supports local file paths.
- [ ] Implement `searchTeams(query: string)`:
  - Use `AsyncFzf` for fuzzy searching by name, description, and agents.

### 3. Config Support (`packages/core/src/config/config.ts`)
- [ ] Ensure `teamRegistryURI` is correctly initialized from settings.
- [ ] Set a default `TeamRegistryClient.DEFAULT_REGISTRY_URL` (e.g., `https://geminicli.com/teams.json`).

## Verification
- Unit tests in `packages/core/src/agents/teamRegistryClient.test.ts`.
- Verify fetching from a mocked JSON endpoint.
