---
name: workspaces
description: Expertise in managing and utilizing Gemini Workspaces for high-performance remote development tasks.
---

# Gemini Workspaces Skill

This skill enables the agent to utilize **Gemini Workspaces**—a high-performance, persistent remote development platform. It allows the agent to move intensive tasks (PR reviews, complex repairs, full builds) from the local environment to a dedicated cloud worker.

## 🛠️ Key Capabilities
1. **Persistent Execution**: Jobs run in remote `tmux` sessions. Disconnecting or crashing the local terminal does not stop the remote work.
2. **Parallel Infrastructure**: The agent can launch a heavy task (like a full build or CI run) in a workspace while continuing to assist the user locally.
3. **Behavioral Fidelity**: Remote workers have full tool access (Git, Node, Docker, etc.) and high-performance compute, allowing the agent to provide behavioral proofs of its work.

## 📋 Instructions for the Agent

### When to use Workspaces
- **Intensive Tasks**: Full preflight runs, large-scale refactors, or deep PR reviews.
- **Persistent Logic**: When a task is expected to take longer than a few minutes and needs to survive local connection drops.
- **Environment Isolation**: When you need a clean, high-performance environment to verify a fix without polluting the user's local machine.

### How to use Workspaces
1. **Setup**: If the user hasn't initialized their environment, instruct them to run `npm run workspace:setup`.
2. **Launch**: Use the `workspace` command to start a playbook:
   ```bash
   npm run workspace <PR_NUMBER> [action]
   ```
   - Actions: `review` (default), `fix`, `ready`.
3. **Check Status**: Poll the progress using `npm run workspace:check <PR_NUMBER>` or see the global state with `npm run workspace:status`.
4. **Prune/Clean**: Cleanup old worktrees and dead sessions with `npm run workspace:clean` (all) or `npm run workspace:remove <PR_NUMBER>` (specific).

## ⚠️ Important Constraints
- **Absolute Paths**: Always use absolute paths (e.g., `/mnt/disks/data/...`) when orchestrating remote commands.
- **npx tsx**: When running scripts manually from the skill directory, always prefix with `npx tsx` to ensure dependencies are available.
- **Be Behavioral**: Prioritize results from live execution (behavioral proofs) over static reading.
- **Multi-tasking**: Remind the user they can continue chatting in the main window while the heavy workspace task runs in the separate terminal window.
