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

| Action                                    | Keys                   |
| ----------------------------------------- | ---------------------- |
| Move the cursor to the start of the line. | `Ctrl + A`<br />`Home` |
| Move the cursor to the end of the line.   | `Ctrl + E`<br />`End`  |

#### Editing

| Action                                           | Keys                                      |
| ------------------------------------------------ | ----------------------------------------- |
| Delete from the cursor to the end of the line.   | `Ctrl + K`                                |
| Delete from the cursor to the start of the line. | `Ctrl + U`                                |
| Clear all text in the input field.               | `Ctrl + C`                                |
| Delete the previous word.                        | `Ctrl + Backspace`<br />`Cmd + Backspace` |

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
| Insert the selected reverse-search match.    | `Enter (no Ctrl)`     |
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

| Action                               | Keys                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| Submit the current prompt.           | `Enter (no Ctrl, no Shift, no Cmd, not Paste)`                                              |
| Insert a newline without submitting. | `Ctrl + Enter`<br />`Cmd + Enter`<br />`Paste + Enter`<br />`Shift + Enter`<br />`Ctrl + J` |

#### External Tools

| Action                                         | Keys                      |
| ---------------------------------------------- | ------------------------- |
| Open the current prompt in an external editor. | `Ctrl + X`                |
| Paste from the clipboard.                      | `Ctrl + V`<br />`Cmd + V` |

#### App Controls

| Action                                                            | Keys       |
| ----------------------------------------------------------------- | ---------- |
| Toggle detailed error information.                                | `F12`      |
| Toggle the full TODO list.                                        | `Ctrl + T` |
| Toggle IDE context details.                                       | `Ctrl + G` |
| Toggle Markdown rendering.                                        | `Cmd + M`  |
| Toggle copy mode when the terminal is using the alternate buffer. | `Ctrl + S` |
| Expand a height-constrained response to show additional lines.    | `Ctrl + S` |
| Toggle focus between the shell and Gemini input.                  | `Ctrl + F` |

#### Session Control

| Action                                       | Keys       |
| -------------------------------------------- | ---------- |
| Cancel the current request or quit the CLI.  | `Ctrl + C` |
| Exit the CLI when the input buffer is empty. | `Ctrl + D` |

<!-- KEYBINDINGS-AUTOGEN:END -->

## Additional context-specific shortcuts

- `Ctrl+Y`: Toggle YOLO (auto-approval) mode for tool calls.
- `Shift+Tab`: Toggle Auto Edit (auto-accept edits) mode.
- `Option+M` (macOS): Entering `µ` with Option+M also toggles Markdown
  rendering, matching `Cmd+M`.
- `!` on an empty prompt: Enter or exit shell mode.
- `\` (at end of a line) + `Enter`: Insert a newline without leaving single-line
  mode.
- `Ctrl+Delete` / `Meta+Delete`: Delete the word to the right of the cursor.
- `Ctrl+B` or `Left Arrow`: Move the cursor one character to the left while
  editing text.
- `Ctrl+F` or `Right Arrow`: Move the cursor one character to the right; with an
  embedded shell attached, `Ctrl+F` still toggles focus.
- `Ctrl+D` or `Delete`: Remove the character immediately to the right of the
  cursor.
- `Ctrl+H` or `Backspace`: Remove the character immediately to the left of the
  cursor.
- `Ctrl+Left Arrow` / `Meta+Left Arrow` / `Meta+B`: Move one word to the left.
- `Ctrl+Right Arrow` / `Meta+Right Arrow` / `Meta+F`: Move one word to the
  right.
- `Ctrl+W`: Delete the word to the left of the cursor (in addition to
  `Ctrl+Backspace` / `Cmd+Backspace`).
- `Ctrl+Z` / `Ctrl+Shift+Z`: Undo or redo the most recent text edit.
- `Meta+Enter`: Open the current input in an external editor (alias for
  `Ctrl+X`).
- `Esc` pressed twice quickly: Clear the current input buffer.
- `Up Arrow` / `Down Arrow`: When the cursor is at the top or bottom of a
  single-line input, navigate backward or forward through prompt history.
- `Number keys (1-9, multi-digit)` inside selection dialogs: Jump directly to
  the numbered radio option and confirm when the full number is entered.
