# Workspace maintainer skill

The `workspace` skill provides a high-performance, parallelized workflow for
workspaceing intensive developer tasks to a remote workstation. It leverages a
Node.js orchestrator to run complex validation playbooks concurrently in a
dedicated terminal window.

## Why use workspace?

As a maintainer, you eventually reach the limits of how much work you can manage
at once on a single local machine. Heavy builds, concurrent test suites, and
multiple PRs in flight can quickly overload local resources, leading to
performance degradation and developer friction.

While manual remote management is a common workaround, it is often cumbersome
and context-heavy. The `workspace` skill addresses these challenges by
providing:

- **Elastic compute**: Workspace resource-intensive build and lint suites to a
  beefy remote workstation, keeping your local machine responsive.
- **Context preservation**: The main Gemini session remains interactive and
  focused on high-level reasoning while automated tasks provide real-time
  feedback in a separate window.
- **Automated orchestration**: The skill handles worktree provisioning, script
  synchronization, and environment isolation automatically.
- **True parallelism**: Infrastructure validation, CI checks, and behavioral
  proofs run simultaneously, compressing a 15-minute process into 3 minutes.

## Agentic skills: Sync or Workspace

The `workspace` system is designed to work in synergy with specialized agentic
skills. These skills can be run **synchronously** in your current terminal for
quick tasks, or **workspaceed** to a remote session for complex, iterative
loops.

- **`review-pr`**: Conducts high-fidelity, behavioral code reviews. It assumes
  the infrastructure is already validated and focuses on physical proof of
  functionality.
- **`fix-pr`**: An autonomous "Fix-to-Green" loop. It iteratively addresses CI
  failures, merge conflicts, and review comments until the PR is mergeable.

When you run `workspace <PR> fix`, the orchestrator provisions the remote
environment and then launches a Gemini CLI session specifically powered by the
`fix-pr` skill.

## Architecture: The Hybrid Powerhouse

The workspace system uses a **Hybrid VM + Docker** architecture designed for
maximum performance and reliability:

1.  **The GCE VM (Raw Power)**: By running on high-performance Google Compute
    Engine instances, we workspace heavy CPU and RAM tasks (like full project
    builds and massive test suites) from your local machine, keeping your
    primary workstation responsive.
2.  **The Docker Container (Consistency & Resilience)**:
    - **Source of Truth**: The `.gcp/Dockerfile.maintainer` defines the exact
      environment. If a tool is added there, every maintainer gets it instantly.
    - **Zero Drift**: Containers are immutable. Every job starts in a fresh
      state, preventing the "OS rot" that typically affects persistent VMs.
    - **Local-to-Remote Parity**: The same image can be run locally on your Mac
      or remotely in GCP, ensuring that "it works on my machine" translates 100%
      to the remote worker.
    - **Safe Multi-tenancy**: Using Git Worktrees inside an isolated container
      environment allows multiple jobs to run in parallel without sharing state
      or polluting the host system.

## Playbooks

- **`review`** (default): Build, CI check, static analysis, and behavioral
  proofs.
- **`fix`**: Iterative fixing of CI failures and review comments.
- **`ready`**: Final full validation (clean install + preflight) before merge.
- **`open`**: Provision a worktree and drop directly into a remote tmux session.

## Scenario and workflows

### Getting Started (Onboarding)

For a complete guide on setting up your remote environment, see the
[Maintainer Onboarding Guide](../../../MAINTAINER_ONBOARDING.md).

### Persistence and Job Recovery

The workspace system is designed for high reliability and persistence. Jobs use
a nested execution model to ensure they continue running even if your local
terminal is closed or the connection is lost.

### How it Works

1.  **Host-Level Persistence**: The orchestrator launches each job in a named
    **`tmux`** session on the remote VM.
2.  **Container Isolation**: The actual work is performed inside the persistent
    `maintainer-worker` Docker container.

### Re-attaching to a Job

If you lose your connection, you can easily resume your session:

- **Automatic**: Simply run the exact same command you started with (e.g.,
  `workspace 123 review`). The system will automatically detect the existing
  session and re-attach you.
- **Manual**: Use `workspace:status` to find the session name, then use
  `ssh gcli-worker` to jump into the VM and `tmux attach -t <session>` to
  resume.

## Technical details

This skill uses a **Worker Provider** abstraction (`GceCosProvider`) to manage
the remote lifecycle. It uses an isolated Gemini profile on the remote host
(`~/.workspace/gemini-cli-config`) to ensure that verification tasks do not
interfere with your primary configuration.

### Directory structure

- `scripts/providers/`: Modular worker implementations (GCE, etc.).
- `scripts/orchestrator.ts`: Local orchestrator (syncs scripts and pops
  terminal).
- `scripts/worker.ts`: Remote engine (provisions worktree and runs playbooks).
- `scripts/check.ts`: Local status poller.
- `scripts/clean.ts`: Remote cleanup utility.
- `SKILL.md`: Instructional body used by the Gemini CLI agent.

## Contributing

If you want to improve this skill:

1. Modify the TypeScript scripts in `scripts/`.
2. Update `SKILL.md` if the agent's instructions need to change.
3. Test your changes locally using `workspace <PR>`.

## Testing

The orchestration logic for this skill is fully tested. To run the tests:

```bash
npx vitest .gemini/skills/workspace/tests/orchestration.test.ts
```

These tests mock the external environment (SSH, GitHub CLI, and the file system)
to ensure that the orchestration scripts generate the correct commands and
handle environment isolation accurately.
