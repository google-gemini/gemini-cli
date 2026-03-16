# Maintainer Onboarding: High-Performance Offload System 🚀

Welcome to the Gemini CLI maintainer team! This guide will help you set up your
remote development environment, which offloads heavy tasks (reviews, fixes,
preflight) to a dedicated GCP worker.

## Prerequisites

1.  **Google Cloud Access**: You will need a Google Cloud Project with billing enabled. You can use a shared team project or, **ideally, your own personal GCP project** for maximum isolation.
2.  **GCloud CLI**: Authenticated locally (`gcloud auth login`).
3.  **GitHub CLI**: Authenticated locally (`gh auth login`).
4.  **IAP Permissions**: Ensure you have the `IAP-secured Tunnel User` role on your chosen project.
5.  **Corporate Identity**: Run `gcert` (or your internal equivalent) recently to ensure SSH certificates are valid.

## Architecture: Hybrid VM + Container 🏗️

The offload system uses a **Worker Provider** architecture to abstract the underlying infrastructure:

1.  **GCE VM (Host)**: A high-performance machine running **Container-Optimized OS (COS)**.
2.  **maintainer-worker (Container)**: A persistent Docker container acting as your remote workstation.
3.  **Resilient Connectivity**: A dual-path strategy that uses **Fast-Path SSH** by default and automatically falls back to **IAP Tunneling** if direct access is blocked.

---

## Setup Workflow

### 1. Initial Configuration (Discovery)

This interactive script configures your local environment to recognize the remote worker.

```bash
npm run offload:setup
```

*   **What it does**: Generates `.gemini/offload_ssh_config`, verifies project access, and establishes the initial identity handshake.
*   **Connectivity**: If direct internal SSH fails, it will attempt to verify access via an IAP tunnel.

### 2. Provisioning Your Worker (Infrastructure)

Spin up your dedicated, high-performance VM. If it already exists, this command will verify its health.

```bash
npm run offload:fleet provision
```

*   **Specs**: n2-standard-8, 200GB PD-Balanced disk.
*   **Self-Healing**: It uses a COS startup script to ensure the `maintainer-worker` container is always running.

### 3. Remote Initialization

Once provisioned, return to the setup script to finalize the remote environment.

```bash
npm run offload:setup
```

*   **Auth Sync**: Pushes your `google_accounts.json` to the worker.
*   **Scoped Token**: Generates a magic link for a GitHub PAT and stores it securely on the worker.
*   **Repo Clone**: Performs a filtered (shallow) clone of the repository onto the remote disk.

---

## Daily Workflow

### Running an Offloaded Job

To perform a deep behavioral review or an agentic fix on your remote worker:

```bash
# For a review
npm run offload <PR_NUMBER> review

# For an automated fix
npm run offload <PR_NUMBER> implement
```

*   **Isolation**: Each job runs in a dedicated **Git Worktree** (`~/dev/worktrees/offload-<id>`).
*   **Persistence**: Jobs run inside a `tmux` session on the remote host. You can disconnect and reconnect without losing progress.

### Monitoring "Mission Control"

View the real-time state of your worker and all in-flight jobs:

```bash
npm run offload:status
```

### Stopping Your Worker

To save costs, shut down your worker when finished. The orchestrator will automatically wake it up when you start a new task.

```bash
npm run offload:fleet stop
```

---

## Resilience & Troubleshooting

### "SSH Connection Failed"
If the setup or orchestrator reports a connection failure:
1.  **Check Identity**: Run `gcert` to refresh your SSH credentials.
2.  **IAP Fallback**: The system should automatically attempt IAP tunneling. If it still fails, verify your GCP project permissions.
3.  **Waking Up**: If the worker was stopped, the first command may take ~30 seconds to wake the VM.

### "Worker Not Found"
If `offload:setup` can't find your worker, ensure you have run `npm run offload:fleet provision` at least once in the current project.
