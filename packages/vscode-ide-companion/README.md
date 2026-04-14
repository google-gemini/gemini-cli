# Gemini CLI Companion

The Gemini CLI Companion extension pairs with
[Gemini CLI](https://github.com/google-gemini/gemini-cli). This extension is
compatible with both VS Code and VS Code forks.

## Features

- Open Editor File Context: Gemini CLI gains awareness of the files you have
  open in your editor, providing it with a richer understanding of your
  project's structure and content.

- Selection Context: Gemini CLI can easily access your cursor's position and
  selected text within the editor, giving it valuable context directly from your
  current work.

- Native Diffing: Seamlessly view, modify, and accept code changes suggested by
  Gemini CLI directly within the editor.

- Launch Gemini CLI: Quickly start a new Gemini CLI session from the Command
  Palette (Cmd+Shift+P or Ctrl+Shift+P) by running the "Gemini CLI: Run"
  command.

- Newgate Sidebar: A dedicated sidebar view exposes Start With Context, Send
  Context, Focus Session, Start, Doctor, and Init actions for Newgate, plus the
  current session status, workspace, active file, and selection context.

- Newgate Context Handoff: Start With Context launches Newgate, attaches the
  current file, serializes the current selection into a temporary note, and
  opens the session focused on that editor scope.

- Newgate Session Reuse: Send Context reuses the running Newgate terminal for
  the current workspace and pushes the latest file and selection context into
  that session without creating a new one.

- Newgate Session Visibility: Focus Session jumps back to the tracked Newgate
  terminal for the current workspace, and the sidebar shows whether that session
  is currently running.

## Requirements

To use this extension, you'll need:

- VS Code version 1.99.0 or newer
- Gemini CLI (installed separately) running within the integrated terminal

## Terms of Service and Privacy Notice

By installing this extension, you agree to the
[Terms of Service](https://geminicli.com/docs/resources/tos-privacy/).
