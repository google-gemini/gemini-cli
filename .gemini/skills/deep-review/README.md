# Deep review maintainer skill

The deep review skill provides a high-performance, parallelized workflow for
reviewing pull requests on a remote workstation. It leverages a Node.js
orchestrator to offload intensive builds and automated testing to parallel
background processes, showing progress in a dedicated terminal window.

This workflow follows a "Verify then Synthesize" pattern, allowing you to
monitor infrastructure validation and behavioral proofs in real-time before
conducting the final interactive review with Gemini CLI.

## Scenarios and workflows

The following scenarios outline how to use the deep review skill effectively.

### First-time setup

Before running your first deep review, you must configure your remote
workstation.

1.  Run the setup command:
    ```bash
    npm run review:setup
    ```
2.  Follow the interactive prompts to specify:
    - **Remote SSH Host**: The alias for your remote machine (default: `cli`).
    - **Remote Work Directory**: Where PR worktrees will be provisioned.
    - **Identity Synchronization**: Whether to mirror your local `.gemini`
      credentials to the remote host.
    - **Terminal Automation**: Your preferred terminal emulator (for example,
      `iterm2` or `terminal`).

The setup script automatically installs `tsx` and the nightly version of Gemini
CLI on the remote host in an isolated directory.

### Launching a review

To start a deep review for a specific pull request, use the `review` script.

1.  Execute the review command with the PR number:
    ```bash
    npm run review <PR_NUMBER>
    ```
2.  The orchestrator performs the following actions:
    - Fetches PR metadata and branch information.
    - Synchronizes the latest review scripts to your remote host.
    - Mirrors your local environment and credentials (if configured).
    - Opens a new terminal window and connects to a remote `tmux` session.

### Remote parallel execution

Once the remote session starts, the worker process automatically provisions a
blobless git clone for the PR and launches four tasks in parallel:

- **Fast Build**: Executes `npm ci && npm run build` to prepare the environment.
- **CI Checks**: Monitors the status of GitHub Actions for the PR.
- **Gemini Analysis**: Performs a static analysis using the `/review-frontend`
  command.
- **Behavioral Proof**: Exercises the new code in the terminal to verify
  functionality. This task waits for the **Fast Build** to complete.

You can monitor the live status and logs for all these tasks in the dedicated
terminal window.

### Monitoring and synthesis

While verification is running, your main Gemini CLI session remains interactive.

1.  To check progress from your local shell without switching windows:
    ```bash
    npm run review:check <PR_NUMBER>
    ```
2.  Once all tasks show as **SUCCESS**, the remote session automatically
    launches an interactive Gemini session.
3.  Gemini CLI reads the captured logs from `.gemini/logs/review-<PR_NUMBER>/`
    and presents a synthesized final assessment.

### Cleanup

To keep your remote workstation tidy, you can wipe old PR directories and kill
inactive sessions.

1.  Run the cleanup command:
    ```bash
    npm run review:clean
    ```
2.  You can choose to perform a standard cleanup (remove worktrees) or a full
    wipe of the remote work directory.

## Best practices

Adhere to these best practices when using the deep review skill.

- **Trust the worker**: Avoid running manual builds or linting in your main
  session. The parallel worker is more efficient and captures structured logs
  for the agent to read later.
- **Verify behavior**: Pay close attention to the `test-execution.log`. It
  provides the physical proof that the feature actually works in a live
  environment.
- **Use isolated profiles**: The skill uses `~/.gemini-deep-review` on the
  remote host to avoid interfering with your primary Gemini CLI configuration.

## Technical details

This skill uses an isolated Gemini profile on the remote host (`~/.gemini-deep-review`) to ensure that verification tasks do not interfere with your primary configuration.

### Directory structure
- `scripts/review.ts`: Local orchestrator (syncs scripts and pops terminal).
- `scripts/worker.ts`: Remote engine (provisions worktree and runs parallel tasks).
- `scripts/check.ts`: Local status poller.
- `scripts/clean.ts`: Remote cleanup utility.
- `SKILL.md`: Instructional body used by the Gemini CLI agent.

## Contributing

If you want to improve this skill:
1. Modify the TypeScript scripts in `scripts/`.
2. Update `SKILL.md` if the agent's instructions need to change.
3. Test your changes locally using `npm run review <PR>`.

