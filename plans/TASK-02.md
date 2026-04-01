# TASK-02: Integrating Team Registry and Discovery into Config

## Objective

Embed the `TeamRegistry` into the `Config` service and manage the team discovery
lifecycle during application startup and configuration reloads.

## Implementation Details

### 1. Config Modifications (`packages/core/src/config/config.ts`)

- [ ] Add a private `teamRegistry` member:
      `private teamRegistry!: TeamRegistry;`.
- [ ] In the `Config` constructor or initializer:
  - [ ] Initialize `teamRegistry = new TeamRegistry(this);`.
  - [ ] Call `await this.teamRegistry.initialize();`.
- [ ] Update `reloadAgents()` to also reload the `TeamRegistry`.
- [ ] Provide a public accessor: `getTeamRegistry(): TeamRegistry`.
- [ ] Implement `getActiveTeam()` and `setActiveTeam(name: string | undefined)`
      delegates to the registry.

### 2. Discovery Path

- [ ] Ensure `TeamRegistry` scans the correct paths:
  - [ ] User-level: `~/.gemini/teams/`
  - [ ] Project-level: `.gemini/teams/`

### 3. State Persistence

- [ ] While the MVP can use memory, consider if the active team should be saved
      in `settings.json` via the `SettingsService` so it persists across
      sessions.

## Verification

- Unit tests for `Config.getTeamRegistry()`.
- Integration tests ensuring that a team in `.gemini/teams/` is discovered and
  loaded during `Config` initialization.
- Test that reloading the configuration correctly refreshes the list of
  available teams.
