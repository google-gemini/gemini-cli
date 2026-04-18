# Rewind

The `/rewind` command lets you go back to a previous state in your conversation
and, optionally, revert any file changes made by the AI during those
interactions. This is a powerful tool for undoing mistakes, exploring different
approaches, or simply cleaning up your session history.

## Usage

To use the rewind feature, simply type `/rewind` into the input prompt and press
**Enter**.

Alternatively, you can use the keyboard shortcut: **Press `Esc` twice**.

### Non-interactive usage

You can also rewind directly to a specific user message by passing an index:

```
/rewind <index>
```

The index is **0-based** and supports **negative indexing** (Python-style):

| Command      | Effect                                      |
| ------------ | ------------------------------------------- |
| `/rewind 0`  | Rewind to before the first user message     |
| `/rewind 1`  | Rewind to before the second user message    |
| `/rewind -1` | Rewind to before the last user message      |
| `/rewind -2` | Rewind to before the second-to-last message |

This is useful for **stdin-driven orchestrators** and automated workflows where
navigating the interactive TUI is not practical. The rewound message's prompt
text is restored into the input buffer, matching the behavior of the interactive
TUI.

> **Note:** Non-interactive rewind only rewinds the conversation history. To
> revert file changes, use the interactive TUI (`/rewind` without arguments).

## Interface

When you trigger a rewind, an interactive list of your previous interactions
appears.

1.  **Select interaction:** Use the **Up/Down arrow keys** to navigate through
    the list. The most recent interactions are at the bottom.
2.  **Preview:** As you select an interaction, you'll see a preview of the user
    prompt and, if applicable, the number of files changed during that step.
3.  **Confirm selection:** Press **Enter** on the interaction you want to rewind
    back to.
4.  **Action selection:** After selecting an interaction, you'll be presented
    with a confirmation dialog with up to three options:
    - **Rewind conversation and revert code changes:** Reverts both the chat
      history and the file modifications to the state before the selected
      interaction.
    - **Rewind conversation:** Only reverts the chat history. File changes are
      kept.
    - **Revert code changes:** Only reverts the file modifications. The chat
      history is kept.
    - **Do nothing (esc):** Cancels the rewind operation.

If no code changes were made since the selected point, the options related to
reverting code changes will be hidden.

## Key considerations

- **Destructive action:** Rewinding is a destructive action for your current
  session history and potentially your files. Use it with care.
- **Agent awareness:** When you rewind the conversation, the AI model loses all
  memory of the interactions that were removed. If you only revert code changes,
  you may need to inform the model that the files have changed.
- **Manual edits:** Rewinding only affects file changes made by the AI's edit
  tools. It does **not** undo manual edits you've made or changes triggered by
  the shell tool (`!`).
- **Compression:** Rewind works across chat compression points by reconstructing
  the history from stored session data.
