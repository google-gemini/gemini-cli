# Maintainer Onboarding: High-Performance Offload System 🚀

Welcome to the Gemini CLI maintainer team! This guide will help you set up your
remote development environment, which offloads heavy tasks (reviews, fixes,
preflight) to a dedicated GCP worker.

## Prerequisites

1. **Google Cloud Access**: Ensure you have access to the
   `gemini-cli-team-quota` project.
2. **GCloud CLI**: Authenticated locally (`gcloud auth login`).
3. **GitHub CLI**: Authenticated locally (`gh auth login`).

- **iTerm2**: (Optional) For automated window popping on macOS.

## Architecture: Why this setup?

The offload system uses a **Hybrid VM + Docker** architecture to balance raw
power with environmental stability:

1.  **GCE VM (Raw Power)**: High-performance machines handle the "heavy lifting"
    (full project builds, exhaustive test suites), keeping your local primary
    workstation responsive and cool.
2.  **Docker (Consistency)**: All development tools (`node`, `gh`, `tsx`,
    `vitest`) are managed via `.gcp/Dockerfile.maintainer`. This ensures every
    maintainer works in an identical environment, eliminating "it works on my
    machine" issues.
3.  **Persistence + Isolation**: Tmux sessions on the host VM provide
    persistence (surviving disconnects), while Git Worktrees and isolated Docker
    runs ensure that multiple jobs don't interfere with each other.

## Setup Workflow

### 1. Fork & Clone

Start by forking the repository and cloning it to your local machine.

```bash
gh repo fork google-gemini/gemini-cli --clone
cd gemini-cli
```

### 2. Run the Offload Setup

This interactive script will handle all the complex orchestration setup:

- Configures your GCP project and compute zone.
- Sets up a **Fast-Path SSH Alias** (`gcli-worker`) in `~/.ssh/config`.
- Creates/Identifies your **Security Fork** for autonomous work.
- Performs a **One-Shot Authentication** for Gemini and GitHub.
- Pre-clones the repository to your remote worker.

```bash
npm run offload:setup
```

### 3. Provision Your Worker

Once setup is configured, spin up your dedicated, high-performance VM:

```bash
npm run offload:fleet provision
```

## Daily Workflow

### Offloading a PR Review

To perform a deep behavioral review of a PR on your remote worker:

```bash
npm run offload <PR_NUMBER> review
```

_A new iTerm2 window will pop up, instantly connected to your worker, running
the `review-pr` skill._

### Monitoring Your Jobs

View the real-time status of all your in-flight remote jobs:

```bash
npm run offload:status
```

### Stopping Your Worker

To save costs, shut down your worker when you're done for the day. The
orchestrator will automatically wake it up when you run a new task.

```bash
npm run offload:fleet stop
```

## Security Model

- **Isolation**: Each maintainer has their own dedicated VM
  (`gcli-offload-<user>`).
- **Permissions**: The agent uses a scoped token that is read-only to the main
  repo and read/write only to your personal fork.
- **OS Login**: Access is managed via your Google corporate identity.
