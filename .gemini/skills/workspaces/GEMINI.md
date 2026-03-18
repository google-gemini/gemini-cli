# Architectural Mandate: High-Performance Workspace System

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
    - `~/.workspace` -> `/home/node/.workspace` (Shared scripts/logs)
- **Runtime**: The container runs as a persistent service (`--restart always`) acting as a "Remote Workstation" rather than an ephemeral task.

## Orchestration Logic
- **Worker Provider Abstraction**: Infrastructure is managed via a `WorkerProvider` interface (e.g., `GceCosProvider`). This decouples the orchestration logic from the underlying platform.
- **Robust Connectivity**: The system uses a dual-path connectivity strategy:
    1. **Fast-Path SSH**: Primary connection via a standard SSH alias (`gcli-worker`) for high-performance synchronization and interaction.
    2. **IAP Fallback**: Automatic fallback to `gcloud compute ssh --tunnel-through-iap` for users off-VPC or when direct DNS resolution fails.
- **Context Execution**: Use `docker exec -it maintainer-worker ...` for interactive tasks and `tmux` sessions. This provides persistence against connection drops while keeping the host OS "invisible."
- **Path Resolution**: Both Host and Container must share identical tilde (`~`) paths to avoid mapping confusion in automation scripts.

## Maintenance
- **Rebuilds**: If the environment drifts or the image updates, delete the VM and re-run the `provision` action.
- **Status**: The Mission Control dashboard derives state by scanning host `tmux` sessions and container filesystem logs.
