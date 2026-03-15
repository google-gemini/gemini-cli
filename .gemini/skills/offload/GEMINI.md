# Architectural Mandate: High-Performance Offload System

## Infrastructure Strategy
- **Base OS**: Always use **Container-Optimized OS (COS)** (`cos-stable` family). It is security-hardened and has Docker pre-installed.
- **Provisioning**: Use the **Cloud-Init (`user-data`)** pattern. 
    - *Note*: Avoid `gcloud compute instances create-with-container` on standard Linux images as it uses a deprecated startup agent. On COS, use native `user-data` for cleanest execution.
- **Performance**: Provision with a minimum of **200GB PD-Balanced** disk to ensure high I/O throughput for Node.js builds and to satisfy GCP disk performance requirements.

## Container Isolation
- **Image**: `us-docker.pkg.dev/gemini-code-dev/gemini-cli/maintainer:latest`.
- **Identity**: The container must be named **`maintainer-worker`**.
- **Mounts**: Standardize on these host-to-container mappings:
    - `~/dev` -> `/home/node/dev` (Persistence for worktrees)
    - `~/.gemini` -> `/home/node/.gemini` (Shared credentials)
    - `~/.offload` -> `/home/node/.offload` (Shared scripts/logs)
- **Runtime**: The container runs as a persistent service (`--restart always`) acting as a "Remote Workstation" rather than an ephemeral task.

## Orchestration Logic
- **Fast-Path SSH**: Land on the VM Host via standard SSH (using an alias like `gcli-worker`).
- **Context Execution**: Use `docker exec -it maintainer-worker ...` for interactive tasks and `tmux` sessions. This provides persistence against connection drops while keeping the host OS "invisible."
- **Path Resolution**: Both Host and Container must share identical tilde (`~`) paths to avoid mapping confusion in automation scripts.

## Maintenance
- **Rebuilds**: If the environment drifts or the image updates, delete the VM and re-run the `provision` action.
- **Status**: The Mission Control dashboard derives state by scanning host `tmux` sessions and container filesystem logs.
