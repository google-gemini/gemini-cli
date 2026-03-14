# Offload Skill

This skill provides a high-performance, parallelized workflow for offloading intensive developer tasks (PR reviews, fixing CI, preparing merges) to a remote workstation. It leverages a Node.js orchestration engine to run complex validation playbooks concurrently in a dedicated terminal window.

## Playbooks

The `offload` skill supports the following specialized playbooks:

-   **`review`** (default): Clean build, CI status check, static analysis, and behavioral proofs.
-   **`fix`**: Build + Log analysis of CI failures + Iterative Gemini-led fixing and pushing.
-   **`ready`**: Final full validation (clean install, full preflight, and conflict checks).
-   **`open`**: Provision a worktree and drop the user directly into a remote shell/tmux session.
-   **`implement`**: Read an issue → Research → Implement → Verify → Create PR.

## Workflow

### 1. Initializing an Offload Task
When the user asks to offload a task (e.g., "Offload PR 123 fix" or "Make PR 123 ready"), use the `run_shell_command` tool to execute the orchestrator:
*   **Command**: `npm run offload <PR_NUMBER> [action]`
*   **Action**: This will sync scripts to the remote host, provision a worktree, and pop a new terminal window for the playbook dashboard.
*   **Response**: Inform the user which playbook has been launched.

### 2. Monitoring and Synthesis
The remote worker saves all results into `.gemini/logs/offload-<PR_NUMBER>/`. Once the playbook finishes, the agent should synthesize the results:
*   Read logs corresponding to the playbook tasks (e.g., `build.log`, `review.md`, `test-execution.log`, `diagnostics.log`).
*   Check the `.exit` files to confirm success of each parallel stage.

### 3. Final Recommendation
Provide a structured assessment based on the physical proof and logs:
*   **Status**: PASS / FAIL / NEEDS_WORK.
*   **Findings**: Categorized by Critical, Improvements, or Nitpicks.
*   **Conclusion**: A clear next step for the maintainer.

## Best Practices
*   **Isolation First**: Always respect the user's isolation choices (`~/.gemini-deep-review`).
*   **Be Behavioral**: Prioritize results from live execution (behavioral proofs) over static reading.
*   **Multi-tasking**: Remind the user they can continue chatting in the main window while the heavy offloaded task runs in the separate window.
