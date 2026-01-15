# Session Management

Gemini CLI includes robust session management features that automatically save
your conversation history. This allows you to interrupt your work and resume
exactly where you left off, review past interactions, and manage your
conversation history effectively.

## Automatic Saving

Every time you interact with Gemini CLI, your session is automatically saved.
This happens in the background without any manual intervention.

- **What is saved:** The complete conversation history, including:
  - Your prompts and the model's responses.
  - All tool executions (inputs and outputs).
  - Token usage statistics (input/output/cached, etc.).
  - Assistant thoughts/reasoning summaries (when available).
- **Location:** Sessions are stored in `~/.gemini/tmp/<project_hash>/chats/`.
- **Scope:** Sessions are project-specific. Switching directories to a different
  project will switch to that project's session history.

## Resuming Sessions

You can resume a previous session to continue the conversation with all prior
context restored.

### From the Command Line

When starting the CLI, you can use the `--resume` (or `-r`) flag:

- **Resume latest:**

  ```bash
  gemini --resume
  ```

  This immediately loads the most recent session.

- **Resume by index:** First, list available sessions (see
  [Listing Sessions](#listing-sessions)), then use the index number:

  ```bash
  gemini --resume 1
  ```

- **Resume by ID:** You can also provide the full session UUID:
  ```bash
  gemini --resume a1b2c3d4-e5f6-7890-abcd-ef1234567890
  ```

### From the Interactive Interface

While the CLI is running, you can use the `/resume` slash command to open the
**Session Browser**:

```text
/resume
```

This opens an interactive interface where you can:

- **Browse:** Scroll through a list of your past sessions.
- **Preview:** See details like the session date, message count, and the first
  user prompt.
- **Search:** Press `/` to enter search mode, then type to filter sessions by ID
  or content.
- **Select:** Press `Enter` to resume the selected session.

## Managing Sessions

### Listing Sessions

To see a list of all available sessions for the current project from the command
line:

```bash
gemini --list-sessions
```

Output example:

```text
Available sessions for this project (3):

  1. Fix bug in auth (2 days ago) [a1b2c3d4]
  2. Refactor database schema (5 hours ago) [e5f67890]
  3. Update documentation (Just now) [abcd1234]
```

### Deleting Sessions

You can remove old or unwanted sessions to free up space or declutter your
history.

**From the Command Line:** Use the `--delete-session` flag with an index or ID:

```bash
gemini --delete-session 2
```

**From the Session Browser:**

1.  Open the browser with `/resume`.
2.  Navigate to the session you want to remove.
3.  Press `x`.

## Configuration

You can configure how Gemini CLI manages your session history in your
`settings.json` file.

### Session Retention

To prevent your history from growing indefinitely, you can enable automatic
cleanup policies.

```json
{
  "general": {
    "sessionRetention": {
      "enabled": true,
      "maxAge": "30d", // Keep sessions for 30 days
      "maxCount": 50 // Keep the 50 most recent sessions
    }
  }
}
```

- **`enabled`**: (boolean) Master switch for session cleanup. Default is
  `false`.
- **`maxAge`**: (string) Duration to keep sessions (e.g., "24h", "7d", "4w").
  Sessions older than this will be deleted.
- **`maxCount`**: (number) Maximum number of sessions to retain. The oldest
  sessions exceeding this count will be deleted.
- **`minRetention`**: (string) Minimum retention period (safety limit). Defaults
  to `"1d"`; sessions newer than this period are never deleted by automatic
  cleanup.

### Session Limits

You can also limit the length of individual sessions to prevent context windows
from becoming too large and expensive.

```json
{
  "model": {
    "maxSessionTurns": 100
  }
}
```

- **`maxSessionTurns`**: (number) The maximum number of turns (user + model
  exchanges) allowed in a single session. Set to `-1` for unlimited (default).

  **Behavior when limit is reached:**
  - **Interactive Mode:** The CLI shows an informational message and stops
    sending requests to the model. You must manually start a new session.
  - **Non-Interactive Mode:** The CLI exits with an error.

## Manager Mode

Manager Mode is an advanced feature that allows Gemini CLI to orchestrate
multiple concurrent worker sessions. In this mode, the main agent acts as a
"Manager" that delegates tasks to "Worker" sessions.

### Features

- **Parallel Execution:** Run multiple tasks simultaneously in separate isolated
  environments.
- **Git Worktree Isolation:** Each worker runs in its own git worktree and
  branch, preventing file conflicts in your current working directory.
- **Workflow Orchestration:** The Manager can plan dependencies between tasks
  (e.g., "Task B must wait for Task A").
- **Visual Dashboard:** Monitor the status of all active sessions and tasks in
  real-time.

### Starting Manager Mode

To start Gemini CLI in Manager Mode, use the `--manager` flag:

```bash
gemini --manager
```

You can also force all worker sessions to run in a sandbox for added security,
even if the manager itself is not sandboxed:

```bash
gemini --manager --sandbox-workers
```

### The Sessions Dashboard

When in Manager Mode (or even in normal mode if sessions are active), you can
toggle the **Sessions Dashboard** by pressing `Ctrl + O`.

This dashboard displays:

- **Pending/Blocked Tasks:** Tasks waiting for dependencies or a free worker.
- **In Progress:** Currently running sessions and their assigned tasks.
- **Done:** Completed or failed tasks.

### How it Works

1.  **Delegation:** You ask the Manager to do something complex (e.g., "Refactor
    these 3 files" or "Implement feature X and then feature Y").
2.  **Planning:** The Manager breaks this down into tasks.
3.  **Execution:** The Manager uses its `start_session` or `plan_workflow` tools
    to spawn worker processes.
4.  **Isolation:** Each worker spins up in `.gemini/worktrees/<session-id>/`.
    They act autonomously to complete their assigned task.
5.  **Completion:** Once a worker is done, the Manager is notified. It can then
    review the work (via git) and merge the worker's branch if approved.
