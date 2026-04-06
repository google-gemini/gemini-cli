# TASK-12: Sample Teams Registry and End-to-End Integration

## Objective
Finalize the "Browse Agent Teams" experience by providing a sample registry and verifying the full browsing and installation lifecycle.

## Implementation Details

### 1. Sample Registry (`packages/core/assets/teams-registry.json`)
- [ ] Create a sample `teams.json` registry containing 2-3 experimental teams.
  - Team A (Local Only): "System Admin Team" (Shell + FS Expert agents).
  - Team B (Multi-LLM): "Creative Polyglot" (Gemini + Claude Code).
  - Team C (Remote): "Open Source Contributor" (Git source pointing to a repo).

### 2. Integration Testing
- [ ] Add an integration test in `integration-tests/agent-teams-browse.test.ts`:
  - Mocks the registry endpoint.
  - Verifies "Browse Agent Teams" lists the teams.
  - Verifies "Install Team" correctly scaffolds the local directory and notifies the registry.

### 3. Polish
- [ ] Ensure all "Marketplace" strings are replaced with "Browse Agent Teams".
- [ ] Ensure the `/team` slash command also supports browsing/installing teams.

## Verification
- Run `npm test -w @google/gemini-cli-core` for the new backend services.
- Run `npm run test:e2e` for the full browser and installation flow.
