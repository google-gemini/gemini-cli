# Detailed Design: Workspace Container Image

## 1. Introduction
The Workspace Container Image defines the standardized software environment for all remote execution. It is pre-built and optimized for fast startup on GCE instances.

## 2. Dockerfile Specification
The image is maintained in `packages/grid-manager/docker/Dockerfile`.

- **Base:** `node:20-slim`
- **Environment:**
  - `GEMINI_CLI_WORKSPACE=1`
  - `DEBIAN_FRONTEND=noninteractive`
- **Tools:**
  - `git`, `rsync`, `curl`, `vim`, `tmux`, `shpool`.
  - `gh` (GitHub CLI).
  - `google-cloud-sdk` (via apt-get).
  - Pre-compiled `gemini-cli` binary.
- **User:** `node` (UID 1000) for unprivileged execution.

## 3. Image Contents & Pre-loading
- The `gemini-cli` nightly binary is pre-loaded into `/usr/local/bin/gemini`.
- Standard node dependencies (`npm`, `yarn`, `pnpm`) are pre-installed.
- `shpool` is used as the primary process manager to allow terminal detachment and re-attachment.

## 4. Entrypoint Strategy (`entrypoint.sh`)
When the container starts on GCE:
1.  **Secret Injection:** Reads the GitHub PAT from a memory-only mount (`/dev/shm/github_token`) and authenticates `gh`.
2.  **Settings Restore:** Syncs the user's `~/.gemini/` configuration (aliased from `/home/node/.gemini_volume`).
3.  **Persistence Layer:** Starts `shpool` daemon in the background.
4.  **Ready Signal:** Notifies the Workspace Hub that the environment is ready for connection.

## 5. Storage Strategy
-   **System:** The container image itself is ephemeral.
-   **User Home:** A persistent GCE Disk (PD) is mounted at `/home/node`. This ensures:
    -   `~/.gemini` settings persist.
    -   Cloned git repositories persist between workspace restarts.
    -   `npm install` artifacts (node_modules) persist.

## 6. Build & Release
-   The image is automatically built and pushed to the Hub's Artifact Registry on every `main` push or new `nightly` tag.
-   The Hub API defaults to using the `latest` or `nightly` tag unless specified otherwise.
