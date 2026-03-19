# Milestone 4 Sub-plan: Secure Sync & Identity

## 1. Objective
Ensure the remote workspace provides a seamless, personalized experience while maintaining strict security for user credentials.

## 2. Tasks

### Task 4.1: User Settings Sync (~/.gemini/)
Implement the logic to push local configuration to the remote workspace.
- [ ] Implement `SyncService` in `packages/core/src/services/syncService.ts`.
- [ ] Logic to use `gcloud compute scp` (recursive) for the `~/.gemini` directory.
- [ ] Implement exclusion patterns (logs, cache, large assets).
- [ ] Integrate sync into the `wsr connect` flow.

### Task 4.2: GitHub PAT Secure Injection
Safely provide GitHub credentials to the remote container without persisting them on disk.
- [ ] Implement logic in `SSHService` to push secrets to `/dev/shm/.gh_token` via a side-channel (e.g., small temp script or `scp`).
- [ ] Update `entrypoint.sh` to read from `/dev/shm/.gh_token` and perform `gh auth login`.
- [ ] Fetch PAT from local keychain before connection.

### Task 4.3: Identity-Aware Proxy (IAP) Auth Primitives
Ensure the Hub API correctly identifies the user.
- [ ] Implement `IapMiddleware` in `packages/workspace-manager/src/middleware/iap.ts`.
- [ ] Logic to extract and verify the `x-goog-authenticated-user-email` and `id` headers.
- [ ] Replace `DEFAULT_OWNER` with real identity in Hub routes.

## 3. Verification & Success Criteria
- **Sync:** After connecting, `gemini help` on the remote side shows the user's local custom commands and aliases.
- **GitHub Auth:** Running `gh auth status` on the remote workspace shows the user as authenticated without having manually logged in.
- **Tenancy:** A user can only see and delete their own workspaces when the Hub is running in multi-user mode.

## 4. Next Steps
- Implement Task 4.1: Create the `SyncService` for settings synchronization.
