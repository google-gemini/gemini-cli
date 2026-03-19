# Detailed Design: Workspace Client & Connectivity

## 1. Introduction
The Workspace Client is the part of `gemini-cli` that communicates with the Workspace Hub and provides the user interface for remote task management.

## 2. CLI Commands

### Management
- `gemini workspace list`: Lists all active, stopped, and provisioning workspaces.
- `gemini workspace create <name> [--image <tag>]`: Provisions a new remote environment.
- `gemini workspace delete <name>`: Terminates the remote VM and cleans up state.
- `gemini workspace stop/start <name>`: Manages the VM power state for cost savings.

### Connection
- `gemini workspace connect <name>`:
  - Fetches the VM's IAP connection details from the Hub.
  - Initiates the secure SSH tunnel.
  - Syncs the local `~/.gemini` settings.
  - Attaches to the remote `shpool` session.

## 3. Connectivity Logic
The client handles the complexity of IAP (Identity-Aware Proxy) and SSH.

### IAP Tunnelling
1.  **Auth Check:** Verifies the user is logged in to `gcloud` and has an active OAuth token for the Workspace Hub.
2.  **Lookup:** Queries the Hub's API to get the VM's internal name and zone.
3.  **Tunnel:** Executes `gcloud compute ssh <vm_name> --tunnel-through-iap`.

### SSH Parameters
- **Agent Forwarding (`-A`):** Critical for Git operations on the remote VM.
- **Environment Injection:** Pass local environment variables (like `TERM` or `LANG`) to ensure terminal compatibility.
- **Secret Sync:** Before starting the shell, a side-channel (e.g., `scp`) pushes the GitHub PAT to `/dev/shm/.gh_token`.

## 4. UI Implementation (Workspaces Ability)
A new interactive component in `packages/cli/src/ui/abilities/workspaces/`.

- **Sidebar:** Tree view of all workspaces across registered Hubs.
- **Main View:**
  - **Status Dashboard:** Shows CPU/Memory load, active repo/branch, and uptime.
  - **Control Center:** Large buttons for Connect, Start/Stop, and Delete.
  - **Batch Console:** Allows broadcasting a command (e.g., `npm run lint`) to multiple selected workspaces.

## 5. Multi-Hub Configuration
The CLI supports talking to multiple Hubs simultaneously (e.g., one personal, one team-wide).

- **Settings (`settings.json`):**
```json
{
  "workspaces": {
    "hubs": [
      { "name": "Personal", "url": "https://hub-xyz.a.run.app" },
      { "name": "Team Alpha", "url": "https://hub-alpha.a.run.app" }
    ]
  }
}
```
- **Context Awareness:** The CLI automatically switches the active Hub context based on the current directory or a command-line flag.
