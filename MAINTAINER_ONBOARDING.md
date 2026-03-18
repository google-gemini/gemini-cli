# Gemini Workspaces: High-Performance Remote Development 🚀

Welcome to the Gemini Workspaces platform! This guide will help you set up your
remote development environment, which allows you to offload heavy tasks (reviews, fixes,
preflight) to a dedicated, high-performance GCP worker.

## Prerequisites

1.  **Google Cloud Access**: You will need a Google Cloud Project with billing enabled. You can use a shared team project or, **ideally, your own personal GCP project** for maximum isolation.
2.  **GCloud CLI**: Authenticated locally (`gcloud auth login`).
3.  **GitHub CLI**: Authenticated locally (`gh auth login`).
4.  **Corporate Identity**: Run `gcert` (or your internal equivalent) recently to ensure SSH certificates are valid.

## Architecture: Persistent Cloud Workstations 🏗️

The system uses a **Workspace Provider** architecture to abstract the underlying infrastructure:

1.  **GCE VM (Host)**: A high-performance machine running **Container-Optimized OS (COS)**.
2.  **maintainer-worker (Container)**: A persistent Docker container acting as your remote workstation.
3.  **Resilient Connectivity**: A verified corporate routing path using `nic0` and `.internal.gcpnode.com` for direct, high-speed access.

---

## Setup Workflow

### 1. The Turn-Key Setup

The entire environment can be initialized with a single command:

```bash
npm run workspace:setup
```

This interactive script will:
- **Phase 1: Configuration**: Auto-detect your repository origins, ask for your GCP project, and guide you through creating a secure GitHub token.
- **Phase 2: Infrastructure**: Automatically provision the "Magic" corporate network (VPC, Subnets, Firewalls) and the high-performance VM.
- **Phase 3: Initialization**: Synchronize your credentials and clone your repository into a persistent remote volume.

---

## Daily Workflow

### Running a Workspace Job

To perform a deep behavioral review or an agentic fix on your remote worker:

```bash
# For a review
npm run workspace <PR_NUMBER> review

# For an automated fix
npm run workspace <PR_NUMBER> fix
```

*   **Isolation**: Each job runs in a dedicated **Git Worktree**.
*   **Persistence**: Jobs run inside a `tmux` session. You can disconnect and reconnect without losing progress.

### Monitoring "Mission Control"

View the real-time state of your worker and all in-flight jobs:

```bash
npm run workspace:status
```

### Stopping Your Worker

To save costs, shut down your worker when finished. The orchestrator will automatically wake it up when you start a new task.

```bash
npm run workspace:fleet stop
```

---

## Resilience & Troubleshooting

### "SSH Connection Failed"
1.  **Check Identity**: Run `gcert` to refresh your SSH credentials.
2.  **Direct Path**: Ensure you are on the corporate network or VPN if required for `nic0` routing.

### "Worker Not Found"
The `setup` script will automatically offer to provision a worker if it can't find one. Simply follow the prompts.
