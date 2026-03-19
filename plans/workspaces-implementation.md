# Gemini CLI Workspaces: High-Level Implementation Plan

## 1. Objective

Transform the architectural vision of "Gemini CLI Workspaces" into a
production-ready, self-service feature for `gemini-cli`.

## 2. Milestones & Phases

### Milestone 1: The Workspace Core (Phase 1)

Build the foundational container environment and the core management API.

- [x] Define and build the `Workspace Container Image`.
- [x] Deploy a basic `Workspace Hub` (Cloud Run) with GCE provisioning.
- [x] Implement simple `/create`, `/list`, `/delete` API endpoints.

### Milestone 2: Basic CLI Management (Phase 2)

Enable developers to manage their remote fleet from the local CLI. See
[Milestone 2 Sub-plan](./milestone-2-cli-management.md) for details.

- [x] Add `gemini workspace create/list/delete` commands.
- [x] Implement Hub authentication (Google OAuth/IAP).
- [x] Add local configuration for Hub discovery (`settings.json`).

### Milestone 3: Connectivity & Persistence (Phase 3)

Enable the "Teleport" experience with session persistence.

- [ ] Implement `gemini workspace connect`.
- [ ] Setup `gcloud compute ssh --tunnel-through-iap` logic in the client.
- [ ] Integrate `shpool` into the container entrypoint for session detachment.

### Milestone 4: Secure Sync & Identity (Phase 4)

Make the remote workspace "feel like home" with secure credential forwarding.

- [ ] Implement `~/.gemini/` configuration synchronization.
- [ ] Implement SSH Agent Forwarding (`-A`) in the connectivity logic.
- [ ] Implement secure GitHub PAT injection via `/dev/shm`.

### Milestone 5: UI & Advanced Hub Features (Phase 5)

Polish the developer experience and add enterprise-grade Hub capabilities.

- [ ] Implement the "Workspaces Ability" in the CLI (interactive React UI).
- [ ] Implement multi-tenancy models (User, Team, Repo) in the Hub.
- [ ] Add auto-cleanup (TTL) and resource monitoring to the Hub.

## 3. Implementation Strategy

- **Surgical Changes:** Each phase will be implemented as a series of small,
  verified PRs.
- **Verification:** Every phase must include integration tests (using mocks for
  GCP if necessary).
- **Documentation:** Architecture docs will be updated as implementation details
  evolve.

## 4. Next Steps

1.  **Phase 1 Sub-plan:** Define the exact Dockerfile and initial Hub API
    schema.
2.  **Phase 1.1:** Build and push the initial `gemini-workspace:latest` image.
