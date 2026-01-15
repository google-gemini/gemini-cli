# Gemini CLI keyboard shortcuts

Gemini CLI ships with a set of default keyboard shortcuts for editing input,
navigating history, and controlling the UI. Use this reference to learn the
available combinations.

<!-- KEYBINDINGS-AUTOGEN:START -->

#### Basic Controls

| Action                                       | Keys    |
| -------------------------------------------- | ------- |
| Confirm the current selection or choice.     | `Enter` |
| Dismiss dialogs or cancel the current focus. | `Esc`   |

#### Cursor Movement

| Action                                      | Keys                                                         |
| ------------------------------------------- | ------------------------------------------------------------ |
| Move the cursor to the start of the line.   | `Ctrl + A`<br />`Home`                                       |
| Move the cursor to the end of the line.     | `Ctrl + E`<br />`End`                                        |
| Move the cursor up one line.                | `Up Arrow (no Ctrl, no Cmd)`                                 |
| Move the cursor down one line.              | `Down Arrow (no Ctrl, no Cmd)`                               |
| Move the cursor one character to the left.  | `Left Arrow (no Ctrl, no Cmd)`<br />`Ctrl + B`               |
| Move the cursor one character to the right. | `Right Arrow (no Ctrl, no Cmd)`<br />`Ctrl + F`              |
| Move the cursor one word to the left.       | `Ctrl + Left Arrow`<br />`Cmd + Left Arrow`<br />`Cmd + B`   |
| Move the cursor one word to the right.      | `Ctrl + Right Arrow`<br />`Cmd + Right Arrow`<br />`Cmd + F` |

#### Editing

| Action                                           | Keys                                                      |
| ------------------------------------------------ | --------------------------------------------------------- |
| Delete from the cursor to the end of the line.   | `Ctrl + K`                                                |
| Delete from the cursor to the start of the line. | `Ctrl + U`                                                |
| Clear all text in the input field.               | `Ctrl + C`                                                |
| Delete the previous word.                        | `Ctrl + Backspace`<br />`Cmd + Backspace`<br />`Ctrl + W` |
| Delete the next word.                            | `Ctrl + Delete`<br />`Cmd + Delete`                       |
| Delete the character to the left.                | `Backspace`<br />`Ctrl + H`                               |
| Delete the character to the right.               | `Delete`<br />`Ctrl + D`                                  |
| Undo the most recent text edit.                  | `Ctrl + Z (no Shift)`                                     |
| Redo the most recent undone text edit.           | `Ctrl + Shift + Z`                                        |

#### Screen Control

| Action                                       | Keys       |
| -------------------------------------------- | ---------- |
| Clear the terminal screen and redraw the UI. | `Ctrl + L` |

#### Scrolling

| Action                   | Keys                 |
| ------------------------ | -------------------- |
| Scroll content up.       | `Shift + Up Arrow`   |
| Scroll content down.     | `Shift + Down Arrow` |
| Scroll to the top.       | `Home`               |
| Scroll to the bottom.    | `End`                |
| Scroll up by one page.   | `Page Up`            |
| Scroll down by one page. | `Page Down`          |

#### History & Search

| Action                                       | Keys                  |
| -------------------------------------------- | --------------------- |
| Show the previous entry in history.          | `Ctrl + P (no Shift)` |
| Show the next entry in history.              | `Ctrl + N (no Shift)` |
| Start reverse search through history.        | `Ctrl + R`            |
| Submit the selected reverse-search match.    | `Enter (no Ctrl)`     |
| Accept a suggestion while reverse searching. | `Tab`                 |

#### Navigation

| Action                           | Keys                                        |
| -------------------------------- | ------------------------------------------- |
| Move selection up in lists.      | `Up Arrow (no Shift)`                       |
| Move selection down in lists.    | `Down Arrow (no Shift)`                     |
| Move up within dialog options.   | `Up Arrow (no Shift)`<br />`K (no Shift)`   |
| Move down within dialog options. | `Down Arrow (no Shift)`<br />`J (no Shift)` |

#### Suggestions & Completions

| Action                                  | Keys                                               |
| --------------------------------------- | -------------------------------------------------- |
| Accept the inline suggestion.           | `Tab`<br />`Enter (no Ctrl)`                       |
| Move to the previous completion option. | `Up Arrow (no Shift)`<br />`Ctrl + P (no Shift)`   |
| Move to the next completion option.     | `Down Arrow (no Shift)`<br />`Ctrl + N (no Shift)` |
| Expand an inline suggestion.            | `Right Arrow`                                      |
| Collapse an inline suggestion.          | `Left Arrow`                                       |

#### Text Input

| Action                               | Keys                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------- |
| Submit the current prompt.           | `Enter (no Ctrl, no Shift, no Cmd)`                                    |
| Insert a newline without submitting. | `Ctrl + Enter`<br />`Cmd + Enter`<br />`Shift + Enter`<br />`Ctrl + J` |

#### External Tools

| Action                                         | Keys                      |
| ---------------------------------------------- | ------------------------- |
| Open the current prompt in an external editor. | `Ctrl + X`                |
| Paste from the clipboard.                      | `Ctrl + V`<br />`Cmd + V` |

#### App Controls

| Action                                                            | Keys             |
| ----------------------------------------------------------------- | ---------------- |
| Toggle detailed error information.                                | `F12`            |
| Toggle the full TODO list.                                        | `Ctrl + T`       |
| Show IDE context details.                                         | `Ctrl + G`       |
| Toggle Markdown rendering.                                        | `Cmd + M`        |
| Toggle copy mode when the terminal is using the alternate buffer. | `Ctrl + S`       |
| Toggle YOLO (auto-approval) mode for tool calls.                  | `Ctrl + Y`       |
| Toggle Auto Edit (auto-accept edits) mode.                        | `Shift + Tab`    |
| Expand a height-constrained response to show additional lines.    | `Ctrl + S`       |
| Focus the shell input from the gemini input.                      | `Tab (no Shift)` |
| Focus the Gemini input from the shell input.                      | `Tab`            |

#### Session Control

| Action                                       | Keys       |
| -------------------------------------------- | ---------- |
| Cancel the current request or quit the CLI.  | `Ctrl + C` |
| Exit the CLI when the input buffer is empty. | `Ctrl + D` |

<!-- KEYBINDINGS-AUTOGEN:END -->

## Additional context-specific shortcuts

- `Option+B/F/M` (macOS only): Are interpreted as `Cmd+B/F/M` even if your
  terminal isn't configured to send Meta with Option.
- `!` on an empty prompt: Enter or exit shell mode.
- `\` (at end of a line) + `Enter`: Insert a newline without leaving single-line
  mode.
- `Esc` pressed twice quickly: Browse and rewind previous interactions.
- `Up Arrow` / `Down Arrow`: When the cursor is at the top or bottom of a
  single-line input, navigate backward or forward through prompt history.
- `Number keys (1-9, multi-digit)` inside selection dialogs: Jump directly to
  the numbered radio option and confirm when the full number is entered.
