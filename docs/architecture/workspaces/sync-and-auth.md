# Detailed Design: Sync & Authentication Mechanism

## 1. Introduction
A core requirement for Gemini CLI Workspaces is the secure and seamless synchronization of developer settings and repository credentials between the local machine and the remote environment.

## 2. Configuration Sync (`~/.gemini/`)
To maintain a consistent experience, the local CLI synchronizes the developer's environment to the remote workspace.

### Sync Strategy
- **Trigger:** Initial creation and subsequent connections via `gemini workspace connect`.
- **Mechanism:** Secure `rsync` over SSH tunnel.
- **Scope:**
  - `~/.gemini/settings.json` (aliases, UI preferences).
  - `~/.gemini/commands/` (custom user commands).
  - `~/.gemini/skills/` (custom user-defined skills).
- **Exclusions:**
  - `.gemini/logs/` (local device specific).
  - `.gemini/cache/` (can be large and re-generated).
  - Sensitive files containing the word `*secret*` or `*key*` (these use the injection mechanism below).

## 3. Git Authentication (SSH Agent Forwarding)
Private SSH keys never leave the developer's local machine.

- **Setup:** The local CLI ensures `ssh-agent` is running and the required keys are added.
- **Connection:** The SSH connection from the CLI uses the `-A` (Agent Forwarding) flag.
- **Remote:** Git on the remote VM automatically uses the forwarded agent socket for cloning or pushing to repositories (GitHub, GitLab, internal).

## 4. GitHub CLI (`gh`) Authentication
For advanced integration (PRs, issues), the GitHub CLI requires a token.

- **Injection Process:**
  1.  Local CLI fetches a GitHub Personal Access Token (PAT) from the OS Keychain (e.g., via `keytar`).
  2.  During the SSH handshake, the CLI writes the token to `/dev/shm/.gh_token` (a memory-only, non-persistent mount).
  3.  The remote shell profile (`.bashrc` or `.zshrc`) exports `GH_TOKEN=$(cat /dev/shm/.gh_token)`.
- **Cleanup:** Terminating the workspace container or VM wipes the `/dev/shm` mount, ensuring no long-lived PATs remain on the remote disk.

## 5. Hub Authentication
Access to the Workspace Hub API is secured via Google OAuth.

- **Local:** The CLI uses the `gcloud` or a built-in OAuth flow to obtain a token.
- **Hub:** The Hub service (on Cloud Run) validates the bearer token and extracts the `sub` (Google User ID) to partition data in Firestore.

## 6. Multi-Device "Handover" Workflow
1.  **Device A (Laptop):** Creates workspace `work-1`. Hub records `owner=user-x`.
2.  **Device B (Surface):** User moves to a coffee shop. Runs `gemini workspace connect work-1`.
3.  **Hub Check:** Hub verifies the user is `user-x`.
4.  **Client Sync:** **Device B** pushes its local `~/.gemini` settings and its own GitHub PAT to `work-1`.
5.  **Result:** `work-1` now behaves exactly like the user's local **Device B** environment.
