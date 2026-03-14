# Offload maintainer skill

The `offload` skill provides a high-performance, parallelized workflow for
offloading intensive developer tasks to a remote workstation. It leverages a 
Node.js orchestrator to run complex validation playbooks concurrently in a 
dedicated terminal window.

## Why use offload?

As a maintainer, you eventually reach the limits of how much work you can manage
at once on a single local machine. Heavy builds, concurrent test suites, and
multiple PRs in flight can quickly overload local resources, leading to 
performance degradation and developer friction.

While manual remote management is a common workaround, it is often cumbersome
and context-heavy. The `offload` skill addresses these challenges by providing:

-   **Elastic compute**: Offload resource-intensive build and lint suites to a
    beefy remote workstation, keeping your local machine responsive.
-   **Context preservation**: The main Gemini session remains interactive and
    focused on high-level reasoning while automated tasks provide real-time
    feedback in a separate window.
-   **Automated orchestration**: The skill handles worktree provisioning, 
    script synchronization, and environment isolation automatically.
-   **True parallelism**: Infrastructure validation, CI checks, and behavioral 
    proofs run simultaneously, compressing a 15-minute process into 3 minutes.

## Agentic skills: Sync or Offload

The `offload` system is designed to work in synergy with specialized agentic 
skills. These skills can be run **synchronously** in your current terminal for
quick tasks, or **offloaded** to a remote session for complex, iterative loops.

-   **`review-pr`**: Conducts high-fidelity, behavioral code reviews. It assumes 
    the infrastructure is already validated and focuses on physical proof of 
    functionality.
-   **`fix-pr`**: An autonomous "Fix-to-Green" loop. It iteratively addresses 
    CI failures, merge conflicts, and review comments until the PR is mergeable.

When you run `npm run offload <PR> fix`, the orchestrator provisions the remote 
environment and then launches a Gemini CLI session specifically powered by the
`fix-pr` skill.

## Playbooks

-   **`review`** (default): Build, CI check, static analysis, and behavioral proofs.
-   **`fix`**: Iterative fixing of CI failures and review comments.
-   **`ready`**: Final full validation (clean install + preflight) before merge.
-   **`open`**: Provision a worktree and drop directly into a remote tmux session.

## Scenarios and workflows

### First-time setup
Run the setup command once to configure your remote environment:
```bash
npm run offload:setup
```

### Offloading a task
To start an offload task for a pull request:
```bash
npm run offload <PR_NUMBER> [action]
```

### Monitoring progress
Check status from your local shell without switching windows:
```bash
npm run offload:check <PR_NUMBER>
```

### Cleanup
Wipe old PR worktrees and kill inactive sessions:
```bash
npm run offload:clean
```

## Technical details

This skill uses an isolated Gemini profile on the remote host (`~/.offload/gemini-cli-config`) to ensure that verification tasks do not interfere with your primary configuration.

### Directory structure
- `scripts/orchestrator.ts`: Local orchestrator (syncs scripts and pops terminal).
- `scripts/worker.ts`: Remote engine (provisions worktree and runs playbooks).
- `scripts/check.ts`: Local status poller.
- `scripts/clean.ts`: Remote cleanup utility.
- `SKILL.md`: Instructional body used by the Gemini CLI agent.

## Contributing

If you want to improve this skill:
1. Modify the TypeScript scripts in `scripts/`.
2. Update `SKILL.md` if the agent's instructions need to change.
3. Test your changes locally using `npm run offload <PR>`.

## Testing

The orchestration logic for this skill is fully tested. To run the tests:
```bash
npx vitest .gemini/skills/offload/tests/orchestration.test.ts
```
These tests mock the external environment (SSH, GitHub CLI, and the file system) to ensure that the orchestration scripts generate the correct commands and handle environment isolation accurately.

