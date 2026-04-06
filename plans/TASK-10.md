# TASK-10: Team Installation and Scaffolding Service

## Objective
Enhance the `TeamScaffolder` service to handle installing teams from a `RegistryTeam` definition, including support for definitions with only metadata or full Git-based teams.

## Implementation Details

### 1. Scaffolder Enhancements (`packages/core/src/agents/teamScaffolder.ts`)
- [ ] Implement `installRegistryTeam(team: RegistryTeam)`:
  - [ ] Validates the team definition.
  - [ ] If `sourceUrl` is provided (e.g., a GitHub link), handle cloning/downloading:
    - Reuse logic from `ExtensionManager` (`cloneFromGit`, `downloadFromGitHubRelease`).
    - Copy the contents to `.gemini/teams/<team-name>/`.
  - [ ] If only prompt/metadata are provided in the `RegistryTeam` JSON:
    - Scaffold the directory structure.
    - Generate `TEAM.md`.
    - Generate corresponding `.md` agent files in the `agents/` folder (especially for external kind agents).

### 2. Registry Update
- [ ] Ensure the `TeamRegistry` is notified to reload discovered teams after a successful installation.

## Verification
- Unit tests for `installRegistryTeam` with both "Definition only" and "Full Git-based" team mocks.
- Verify that a successfully installed team appears in the discovered teams list.
