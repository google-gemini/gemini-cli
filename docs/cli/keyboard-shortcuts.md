# Gemini CLI keyboard shortcuts

Gemini CLI ships with a set of default keyboard shortcuts for editing input,
navigating history, and controlling the UI. Use this reference to learn the
available combinations.

<!-- KEYBINDINGS-AUTOGEN:START -->

#### Basic Controls

| Action                                                          | Keys                  |
| --------------------------------------------------------------- | --------------------- |
| Confirm the current selection or choice.                        | `Enter`               |
| Dismiss dialogs or cancel the current focus.                    | `Esc`<br />`Ctrl + [` |
| Cancel the current request or quit the CLI when input is empty. | `Ctrl + C`            |
| Exit the CLI when the input buffer is empty.                    | `Ctrl + D`            |

#### Cursor Movement

| Action                                      | Keys                                                         |
| ------------------------------------------- | ------------------------------------------------------------ |
| Move the cursor to the start of the line.   | `Ctrl + A`<br />`Home (no Shift, Ctrl)`                      |
| Move the cursor to the end of the line.     | `Ctrl + E`<br />`End (no Shift, Ctrl)`                       |
| Move the cursor up one line.                | `Up Arrow (no Shift, Alt, Ctrl, Cmd)`                        |
| Move the cursor down one line.              | `Down Arrow (no Shift, Alt, Ctrl, Cmd)`                      |
| Move the cursor one character to the left.  | `Left Arrow (no Shift, Alt, Ctrl, Cmd)`                      |
| Move the cursor one character to the right. | `Right Arrow (no Shift, Alt, Ctrl, Cmd)`<br />`Ctrl + F`     |
| Move the cursor one word to the left.       | `Ctrl + Left Arrow`<br />`Alt + Left Arrow`<br />`Alt + B`   |
| Move the cursor one word to the right.      | `Ctrl + Right Arrow`<br />`Alt + Right Arrow`<br />`Alt + F` |

#### Editing

| Action                                           | Keys                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| Delete from the cursor to the end of the line.   | `Ctrl + K`                                                       |
| Delete from the cursor to the start of the line. | `Ctrl + U`                                                       |
| Clear all text in the input field.               | `Ctrl + C`                                                       |
| Delete the previous word.                        | `Ctrl + Backspace`<br />`Alt + Backspace`<br />`Ctrl + W`        |
| Delete the next word.                            | `Ctrl + Delete`<br />`Alt + Delete`<br />`Alt + D`               |
| Delete the character to the left.                | `Backspace`<br />`Ctrl + H`                                      |
| Delete the character to the right.               | `Delete`<br />`Ctrl + D`                                         |
| Undo the most recent text edit.                  | `Cmd + Z (no Shift)`<br />`Alt + Z (no Shift)`                   |
| Redo the most recent undone text edit.           | `Shift + Ctrl + Z`<br />`Shift + Cmd + Z`<br />`Shift + Alt + Z` |

#### Scrolling

| Action                   | Keys                              |
| ------------------------ | --------------------------------- |
| Scroll content up.       | `Shift + Up Arrow`                |
| Scroll content down.     | `Shift + Down Arrow`              |
| Scroll to the top.       | `Ctrl + Home`<br />`Shift + Home` |
| Scroll to the bottom.    | `Ctrl + End`<br />`Shift + End`   |
| Scroll up by one page.   | `Page Up`                         |
| Scroll down by one page. | `Page Down`                       |

#### History & Search

| Action                                       | Keys                  |
| -------------------------------------------- | --------------------- |
| Show the previous entry in history.          | `Ctrl + P (no Shift)` |
| Show the next entry in history.              | `Ctrl + N (no Shift)` |
| Start reverse search through history.        | `Ctrl + R`            |
| Submit the selected reverse-search match.    | `Enter (no Ctrl)`     |
| Accept a suggestion while reverse searching. | `Tab (no Shift)`      |
| Browse and rewind previous interactions.     | `Double Esc`          |

#### Navigation

| Action                                             | Keys                                        |
| -------------------------------------------------- | ------------------------------------------- |
| Move selection up in lists.                        | `Up Arrow (no Shift)`                       |
| Move selection down in lists.                      | `Down Arrow (no Shift)`                     |
| Move up within dialog options.                     | `Up Arrow (no Shift)`<br />`K (no Shift)`   |
| Move down within dialog options.                   | `Down Arrow (no Shift)`<br />`J (no Shift)` |
| Move to the next item or question in a dialog.     | `Tab (no Shift)`                            |
| Move to the previous item or question in a dialog. | `Shift + Tab`                               |

#### Suggestions & Completions

| Action                                  | Keys                                               |
| --------------------------------------- | -------------------------------------------------- |
| Accept the inline suggestion.           | `Tab (no Shift)`<br />`Enter (no Ctrl)`            |
| Move to the previous completion option. | `Up Arrow (no Shift)`<br />`Ctrl + P (no Shift)`   |
| Move to the next completion option.     | `Down Arrow (no Shift)`<br />`Ctrl + N (no Shift)` |
| Expand an inline suggestion.            | `Right Arrow`                                      |
| Collapse an inline suggestion.          | `Left Arrow`                                       |

#### Text Input

| Action                                         | Keys                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Submit the current prompt.                     | `Enter (no Shift, Alt, Ctrl, Cmd)`                                                        |
| Insert a newline without submitting.           | `Ctrl + Enter`<br />`Cmd + Enter`<br />`Alt + Enter`<br />`Shift + Enter`<br />`Ctrl + J` |
| Open the current prompt in an external editor. | `Ctrl + X`                                                                                |
| Paste from the clipboard.                      | `Ctrl + V`<br />`Cmd + V`<br />`Alt + V`                                                  |

#### App Controls

| Action                                                                                                                                             | Keys             |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Toggle detailed error information.                                                                                                                 | `F12`            |
| Toggle the full TODO list.                                                                                                                         | `Ctrl + T`       |
| Show IDE context details.                                                                                                                          | `Ctrl + G`       |
| Toggle Markdown rendering.                                                                                                                         | `Alt + M`        |
| Toggle copy mode when in alternate buffer mode.                                                                                                    | `Ctrl + S`       |
| Toggle YOLO (auto-approval) mode for tool calls.                                                                                                   | `Ctrl + Y`       |
| Cycle through approval modes: default (prompt), auto_edit (auto-approve edits), and plan (read-only). Plan mode is skipped when the agent is busy. | `Shift + Tab`    |
| Expand and collapse blocks of content when not in alternate buffer mode.                                                                           | `Ctrl + O`       |
| Expand or collapse a paste placeholder when cursor is over placeholder.                                                                            | `Ctrl + O`       |
| Toggle current background shell visibility.                                                                                                        | `Ctrl + B`       |
| Toggle background shell list.                                                                                                                      | `Ctrl + L`       |
| Kill the active background shell.                                                                                                                  | `Ctrl + K`       |
| Confirm selection in background shell list.                                                                                                        | `Enter`          |
| Dismiss background shell list.                                                                                                                     | `Esc`            |
| Move focus from background shell to Gemini.                                                                                                        | `Shift + Tab`    |
| Move focus from background shell list to Gemini.                                                                                                   | `Tab (no Shift)` |
| Show warning when trying to move focus away from background shell.                                                                                 | `Tab (no Shift)` |
| Show warning when trying to move focus away from shell input.                                                                                      | `Tab (no Shift)` |
| Move focus from Gemini to the active shell.                                                                                                        | `Tab (no Shift)` |
| Move focus from the shell back to Gemini.                                                                                                          | `Shift + Tab`    |
| Clear the terminal screen and redraw the UI.                                                                                                       | `Ctrl + L`       |
| Restart the application.                                                                                                                           | `R`              |
| Suspend the CLI and move it to the background.                                                                                                     | `Ctrl + Z`       |

<!-- KEYBINDINGS-AUTOGEN:END -->

## Additional context-specific shortcuts

- `Option+B/F/M` (macOS only): Are interpreted as `Cmd+B/F/M` even if your
  terminal isn't configured to send Meta with Option.
- `!` on an empty prompt: Enter or exit shell mode.
- `?` on an empty prompt: Toggle the shortcuts panel above the input. Press
  `Esc`, `Backspace`, any printable key, or a registered app hotkey to close it.
  The panel also auto-hides while the agent is running/streaming or when
  action-required dialogs are shown. Press `?` again to close the panel and
  insert a `?` into the prompt.
- `Tab` + `Tab` (while typing in the prompt): Toggle between minimal and full UI
  details when no completion/search interaction is active. The selected mode is
  remembered for future sessions. Full UI remains the default on first run, and
  single `Tab` keeps its existing completion/focus behavior.
- `Shift + Tab` (while typing in the prompt): Cycle approval modes: default,
  auto-edit, and plan (skipped when agent is busy).
- `\` (at end of a line) + `Enter`: Insert a newline without leaving single-line
  mode.
- `Esc` pressed twice quickly: Clear the input prompt if it is not empty,
  otherwise browse and rewind previous interactions.
- `Up Arrow` / `Down Arrow`: When the cursor is at the top or bottom of a
  single-line input, navigate backward or forward through prompt history.
- `Number keys (1-9, multi-digit)` inside selection dialogs: Jump directly to
  the numbered radio option and confirm when the full number is entered.
- `Ctrl + O`: Expand or collapse paste placeholders (`[Pasted Text: X lines]`)
  inline when the cursor is over the placeholder.
- `Double-click` on a paste placeholder (alternate buffer mode only): Expand to
  view full content inline. Double-click again to collapse.
