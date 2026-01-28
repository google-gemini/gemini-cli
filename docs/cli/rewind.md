# Rewind

The `/rewind` command allows you to go back to a previous state in your
conversation and, optionally, revert any file changes made by the AI during
those interactions. This is a powerful tool for undoing mistakes, exploring
different approaches, or simply cleaning up your session history.

## Usage

To use the rewind feature, simply type `/rewind` into the input prompt and press
**Enter**.

Alternatively, you can use the keyboard shortcut: **Press `Esc` twice**.

## Interface

When you trigger a rewind, an interactive list of your previous interactions
appears.

1.  **Select Interaction:** Use the **Up/Down arrow keys** to navigate through
    the list. The most recent interactions are at the bottom.
2.  **Preview:** As you select an interaction, you'll see a preview of the user
    prompt and, if applicable, the number of files changed during that step.
3.  **Confirm Selection:** Press **Enter** on the interaction you want to rewind
    back to.
4.  **Action Selection:** After selecting an interaction, you'll be presented
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

## Key Considerations

- **Destructive Action:** Rewinding is a destructive action for your current
  session history and potentially your files. Use it with care.
- **Agent Awareness:** When you rewind the conversation, the AI model loses all
  memory of the interactions that were removed. If you only revert code changes,
  you may need to inform the model that the files have changed.
- **Manual Edits:** Rewinding only affects file changes made by the AI's edit
  tools. It does **not** undo manual edits you've made or changes triggered by
  the shell tool (`!`).
- **Compression:** Rewind works across chat compression points by reconstructing
  the history from stored session data.
