# Checkpointing

The Gemini CLI includes a Checkpointing feature that automatically saves a
snapshot of your project's state before any file modifications are made by
AI-powered tools. This allows you to safely experiment with and apply code
changes, knowing you can instantly revert back to the state before the tool was
run.

## How it works

When you approve a tool that modifies the file system (like `write_file` or
`replace`), the CLI automatically creates a "checkpoint." This checkpoint
includes:

1.  **A Git snapshot:** A commit is made in a special, shadow Git repository
    located in your home directory (`~/.gemini/history/<project_hash>`). This
    snapshot captures the complete state of your project files at that moment.
    It does **not** interfere with your own project's Git repository.
2.  **Conversation history:** The entire conversation you've had with the agent
    up to that point is saved.
3.  **The tool call:** The specific tool call that was about to be executed is
    also stored.

If you want to undo the change or simply go back, you can use the `/restore`
command. Restoring a checkpoint will:

- Revert all files in your project to the state captured in the snapshot.
- Restore the conversation history in the CLI.
- Re-propose the original tool call, allowing you to run it again, modify it, or
  simply ignore it.

All checkpoint data, including the Git snapshot and conversation history, is
stored locally on your machine. The Git snapshot is stored in the shadow
repository while the conversation history and tool calls are saved in a JSON
file in your project's temporary directory, typically located at
`~/.gemini/tmp/<project_hash>/checkpoints`.

## Enabling the feature

The Checkpointing feature is disabled by default. To enable it, you need to edit
your `settings.json` file.

> **Note:** The `--checkpointing` command-line flag was removed in version
> 0.11.0. Checkpointing can now only be enabled through the `settings.json`
> configuration file.

Add the following key to your `settings.json`:

```json
{
  "general": {
    "checkpointing": {
      "enabled": true
    }
  }
}
```

## Using the `/restore` command

Once enabled, checkpoints are created automatically. To manage them, you use the
`/restore` command.

### List available checkpoints

To see a list of all saved checkpoints for the current project, simply run:

```
/restore
```

The CLI will display a list of available checkpoint files. These file names are
typically composed of a timestamp, the name of the file being modified, and the
name of the tool that was about to be run (e.g.,
`2025-06-22T10-00-00_000Z-my-file.txt-write_file`).

### Restore a specific checkpoint

To restore your project to a specific checkpoint, use the checkpoint file from
the list:

```
/restore <checkpoint_file>
```

For example:

```
/restore 2025-06-22T10-00-00_000Z-my-file.txt-write_file
```

After running the command, your files and conversation will be immediately
restored to the state they were in when the checkpoint was created, and the
original tool prompt will reappear.
