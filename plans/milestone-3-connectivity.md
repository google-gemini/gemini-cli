# Milestone 3 Sub-plan: Connectivity & Persistence

## 1. Objective
Enable the "Teleport" experience by allowing users to securely connect to their remote workspaces with persistent terminal sessions.

## 2. Tasks

### Task 3.1: SSH Tunneling Logic (IAP)
Implement the mechanism to securely tunnel SSH traffic through Google Identity-Aware Proxy.
- [ ] Implement `SSHService` in `packages/core/src/services/sshService.ts`.
- [ ] Logic to execute `gcloud compute ssh --tunnel-through-iap`.
- [ ] Handle SSH key generation and OS Login checks.

### Task 3.2: Workspace Connect Command
Implement the primary `wsr connect <id>` command.
- [ ] Add `workspace connect` subcommand to `packages/cli/src/commands/workspace/connect.ts`.
- [ ] Logic to fetch instance details (name, zone) from the Hub before connecting.
- [ ] Pass necessary SSH flags (Agent Forwarding, Environment variables).

### Task 3.3: Persistence Integration (shpool)
Ensure the remote session survives disconnects.
- [ ] Update `remoteCli.ts` to wrap the shell in `shpool attach`.
- [ ] Verify `shpool` daemon is running correctly via the container entrypoint.
- [ ] Logic to handle terminal resizing across local/remote.

## 3. Verification & Success Criteria
- **Connect:** `gemini wsr connect [ID]` successfully drops the user into a remote shell.
- **Persistence:** User can disconnect (Ctrl+C or close terminal), reconnect, and find their previous state intact.
- **Security:** Connection only works for the workspace owner and requires a valid `gcloud` session.

## 4. Next Steps
- Implement Task 3.1: Create the `SSHService` in the core package.
