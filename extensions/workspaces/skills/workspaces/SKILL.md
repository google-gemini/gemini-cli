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
1. **Setup**: If the user hasn't initialized their environment, you MUST run the setup script using npx tsx and the absolute path. Do NOT use npm scripts.
   ```bash
   npx tsx ${extensionPath}/extensions/workspaces/scripts/setup.ts
   ```
2. **Launch**: Start a playbook for a specific PR/issue:
   ```bash
   npx tsx ${extensionPath}/extensions/workspaces/scripts/orchestrator.ts <PR_NUMBER> [action]
   ```
   - Actions: `review` (default), `fix`, `ready`.
3. **Check Status**: See global state and active sessions:
   ```bash
   npx tsx ${extensionPath}/extensions/workspaces/scripts/status.ts
   ```
   Or deep-dive into specific PR logs:
   ```bash
   npx tsx ${extensionPath}/extensions/workspaces/scripts/check.ts <PR_NUMBER>
   ```
4. **Cleanup**: 
   - **Bulk**: Clear all sessions/worktrees:
     ```bash
     npx tsx ${extensionPath}/extensions/workspaces/scripts/clean.ts --all
     ```
   - **Surgical**: Kill a specific PR task:
     ```bash
     npx tsx ${extensionPath}/extensions/workspaces/scripts/clean.ts <PR_NUMBER> <action>
     ```
5. **Fleet**: Manage VM lifecycle:
   ```bash
   npx tsx ${extensionPath}/extensions/workspaces/scripts/fleet.ts [stop|provision|list]
   ```
6. **Attach/Logs**: 
   ```bash
   npx tsx ${extensionPath}/extensions/workspaces/scripts/attach.ts <PR_NUMBER>
   npx tsx ${extensionPath}/extensions/workspaces/scripts/logs.ts <PR_NUMBER>
   ```

## ⚠️ Important Constraints
- **NO NPM**: Do NOT attempt to use `npm run` or `npm workspace`. Those commands are deprecated in favor of running the extension scripts directly.
- **npx tsx**: Always use `npx tsx` followed by the absolute path provided in `${extensionPath}`.
- **Absolute Paths**: Always use absolute paths (e.g., `/mnt/disks/data/...`) when orchestrating remote commands.
