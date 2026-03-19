# Milestone 5 Sub-plan: UI & Advanced Hub Features

## 1. Objective
Provide a polished, interactive dashboard for managing workspaces and enhance the Hub with production-grade management features like TTL-based auto-cleanup and expanded multi-tenancy models.

## 2. Tasks

### Task 5.1: Workspaces "Ability" (React UI)
Create an interactive dashboard within the `gemini-cli`.
- [ ] Create `packages/cli/src/ui/abilities/workspaces/`.
- [ ] Implement `WorkspacesView` component using Ink.
- [ ] Logic to display a live-updating table of workspaces.
- [ ] Implement interactive actions: "Connect", "Start/Stop", "Delete" within the UI.

### Task 5.2: Hub Auto-Cleanup (TTL)
Prevent runaway GCP costs by cleaning up idle workspaces.
- [ ] Add `last_connected_at` tracking to `WorkspaceService`.
- [ ] Implement a `/cleanup` endpoint in the Hub.
- [ ] Logic to identify and delete/stop VMs that have been idle past a configurable TTL.

### Task 5.3: Expanded Multi-Tenancy (Team/Repo)
Enhance the Hub to support shared and automated environments.
- [ ] Implement `Team` mode logic where workspaces can be shared within a Google Group.
- [ ] Implement `Repo` mode primitives to tie workspaces to specific GitHub PRs.

## 3. Verification & Success Criteria
- **UI:** The user can navigate to the "Workspaces" ability and manage their fleet using keyboard shortcuts or a menu.
- **Cleanup:** A workspace not connected to for > TTL is automatically terminated by the Hub.
- **Tenancy:** Verified isolation and sharing rules in a simulated multi-user environment.

## 4. Next Steps
- Implement Task 5.1: Scaffold the Workspaces Ability in the CLI.
