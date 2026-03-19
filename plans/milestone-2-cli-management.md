# Milestone 2 Sub-plan: Basic CLI Management

## 1. Objective

Enable developers to manage their remote workspaces directly from the local
`gemini-cli`.

## 2. Tasks

### Task 2.1: CLI Command Infrastructure

Add the base `workspace` command and its sub-commands to the CLI.

- [x] Save post-mortem of "Command Registration & UI Bypass" failure to global
      memory.
- [x] Investigate why `workspace` command is shadowed by positional `query..` in
      `yargs`.
- [x] Ensure `workspace` commands correctly bypass the interactive UI.
- [x] Define the `workspace` command group logic in
      `packages/core/src/commands/`.
- [x] Implement `wsr list`: Fetch and display workspaces from the Hub.
- [x] Implement `wsr create <name>`: Call the Hub API to provision a new
      workspace.
- [x] Implement `wsr delete <id>`: Call the Hub API to terminate a workspace.

### Task 2.2: Hub Configuration & Discovery

Allow the CLI to know where the Workspace Hub is located.

- [x] Add `workspaces` configuration section to `packages/core/src/config/`.
- [x] Support multiple Hub profiles in `settings.json`.

### Task 2.3: Basic Hub Client & Auth

Implement the communication layer between the CLI and the Hub.

- [x] Create `packages/core/src/services/workspaceHubClient.ts`.
- [x] Implement Google OAuth/IAP token injection for API requests.
- [x] Handle API errors and provide user-friendly feedback in the CLI.

## 3. Verification & Success Criteria

- **List:** `gemini wsr list` shows workspaces currently tracked in Firestore.
- **Create:** `gemini wsr create my-task` returns a success message and the new
  workspace ID.
- **Delete:** `gemini wsr delete [ID]` removes the entry from the list.
- **Auth:** Commands fail with a clear message if the user is not authenticated
  or the Hub is unreachable.

## 4. Next Steps

- Milestone 3: Connectivity & Persistence.
