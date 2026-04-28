# Gemini CLI keyboard shortcuts

Gemini CLI ships with a set of default keyboard shortcuts for editing input,
navigating history, and controlling the UI. Use this reference to learn the
available combinations.

<!-- KEYBINDINGS-AUTOGEN:START -->

#### Basic Controls

| Command         | Action                                                          | Keys                |
| --------------- | --------------------------------------------------------------- | ------------------- |
| `basic.confirm` | Confirm the current selection or choice.                        | `Enter`             |
| `basic.cancel`  | Dismiss dialogs or cancel the current focus.                    | `Esc`<br />`Ctrl+[` |
| `basic.quit`    | Cancel the current request or quit the CLI when input is empty. | `Ctrl+C`            |
| `basic.exit`    | Exit the CLI when the input buffer is empty.                    | `Ctrl+D`            |

#### Cursor Movement

| Command            | Action                                      | Keys                                       |
| ------------------ | ------------------------------------------- | ------------------------------------------ |
| `cursor.home`      | Move the cursor to the start of the line.   | `Ctrl+A`<br />`Home`                       |
| `cursor.end`       | Move the cursor to the end of the line.     | `Ctrl+E`<br />`End`                        |
| `cursor.up`        | Move the cursor up one line.                | `Up`                                       |
| `cursor.down`      | Move the cursor down one line.              | `Down`                                     |
| `cursor.left`      | Move the cursor one character to the left.  | `Left`                                     |
| `cursor.right`     | Move the cursor one character to the right. | `Right`<br />`Ctrl+F`                      |
| `cursor.wordLeft`  | Move the cursor one word to the left.       | `Ctrl+Left`<br />`Alt+Left`<br />`Alt+B`   |
| `cursor.wordRight` | Move the cursor one word to the right.      | `Ctrl+Right`<br />`Alt+Right`<br />`Alt+F` |

#### Editing

| Command                | Action                                           | Keys                                                     |
| ---------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| `edit.deleteRightAll`  | Delete from the cursor to the end of the line.   | `Ctrl+K`                                                 |
| `edit.deleteLeftAll`   | Delete from the cursor to the start of the line. | `Ctrl+U`                                                 |
| `edit.clear`           | Clear all text in the input field.               | `Ctrl+C`                                                 |
| `edit.deleteWordLeft`  | Delete the previous word.                        | `Ctrl+Backspace`<br />`Alt+Backspace`<br />`Ctrl+W`      |
| `edit.deleteWordRight` | Delete the next word.                            | `Ctrl+Delete`<br />`Alt+Delete`<br />`Alt+D`             |
| `edit.deleteLeft`      | Delete the character to the left.                | `Backspace`<br />`Ctrl+H`                                |
| `edit.deleteRight`     | Delete the character to the right.               | `Delete`<br />`Ctrl+D`                                   |
| `edit.undo`            | Undo the most recent text edit.                  | `Cmd/Win+Z`<br />`Alt+Z`                                 |
| `edit.redo`            | Redo the most recent undone text edit.           | `Ctrl+Shift+Z`<br />`Shift+Cmd/Win+Z`<br />`Alt+Shift+Z` |

#### Scrolling

| Command           | Action                   | Keys                          |
| ----------------- | ------------------------ | ----------------------------- |
| `scroll.up`       | Scroll content up.       | `Shift+Up`                    |
| `scroll.down`     | Scroll content down.     | `Shift+Down`                  |
| `scroll.home`     | Scroll to the top.       | `Ctrl+Home`<br />`Shift+Home` |
| `scroll.end`      | Scroll to the bottom.    | `Ctrl+End`<br />`Shift+End`   |
| `scroll.pageUp`   | Scroll up by one page.   | `Page Up`                     |
| `scroll.pageDown` | Scroll down by one page. | `Page Down`                   |

#### History & Search

| Command                 | Action                                       | Keys     |
| ----------------------- | -------------------------------------------- | -------- |
| `history.previous`      | Show the previous entry in history.          | `Ctrl+P` |
| `history.next`          | Show the next entry in history.              | `Ctrl+N` |
| `history.search.start`  | Start reverse search through history.        | `Ctrl+R` |
| `history.search.submit` | Submit the selected reverse-search match.    | `Enter`  |
| `history.search.accept` | Accept a suggestion while reverse searching. | `Tab`    |

#### Navigation

| Command               | Action                                             | Keys            |
| --------------------- | -------------------------------------------------- | --------------- |
| `nav.up`              | Move selection up in lists.                        | `Up`            |
| `nav.down`            | Move selection down in lists.                      | `Down`          |
| `nav.dialog.up`       | Move up within dialog options.                     | `Up`<br />`K`   |
| `nav.dialog.down`     | Move down within dialog options.                   | `Down`<br />`J` |
| `nav.dialog.next`     | Move to the next item or question in a dialog.     | `Tab`           |
| `nav.dialog.previous` | Move to the previous item or question in a dialog. | `Shift+Tab`     |

#### Suggestions & Completions

| Command                 | Action                                  | Keys                 |
| ----------------------- | --------------------------------------- | -------------------- |
| `suggest.accept`        | Accept the inline suggestion.           | `Tab`<br />`Enter`   |
| `suggest.focusPrevious` | Move to the previous completion option. | `Up`<br />`Ctrl+P`   |
| `suggest.focusNext`     | Move to the next completion option.     | `Down`<br />`Ctrl+N` |
| `suggest.expand`        | Expand an inline suggestion.            | `Right`              |
| `suggest.collapse`      | Collapse an inline suggestion.          | `Left`               |

#### Text Input

| Command                              | Action                                                                    | Keys                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `input.submit`                       | Submit the current prompt.                                                | `Enter`                                                                             |
| `input.queueMessage`                 | Queue the current prompt to be processed after the current task finishes. | `Tab`                                                                               |
| `input.newline`                      | Insert a newline without submitting.                                      | `Ctrl+Enter`<br />`Cmd/Win+Enter`<br />`Alt+Enter`<br />`Shift+Enter`<br />`Ctrl+J` |
| `input.openExternalEditor`           | Open the current prompt or the plan in an external editor.                | `Ctrl+G`<br />`Ctrl+Shift+G`                                                        |
| `input.deprecatedOpenExternalEditor` | Deprecated command to open external editor.                               | `Ctrl+X`                                                                            |
| `input.paste`                        | Paste from the clipboard.                                                 | `Ctrl+V`<br />`Cmd/Win+V`<br />`Alt+V`                                              |

#### App Controls

| Command                       | Action                                                                                                                                             | Keys               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `app.showErrorDetails`        | Toggle the debug console for detailed error information.                                                                                           | `F12`              |
| `app.showFullTodos`           | Toggle the full TODO list.                                                                                                                         | `Ctrl+T`           |
| `app.showIdeContextDetail`    | Show IDE context details.                                                                                                                          | `F4`               |
| `app.toggleMarkdown`          | Toggle Markdown rendering.                                                                                                                         | `Alt+M`            |
| `app.toggleCopyMode`          | Toggle copy mode when in alternate buffer mode.                                                                                                    | `F9`               |
| `app.toggleMouseMode`         | Toggle mouse mode (scrolling and clicking).                                                                                                        | `Ctrl+S`           |
| `app.toggleYolo`              | Toggle YOLO (auto-approval) mode for tool calls.                                                                                                   | `Ctrl+Y`           |
| `app.cycleApprovalMode`       | Cycle through approval modes: default (prompt), auto_edit (auto-approve edits), and plan (read-only). Plan mode is skipped when the agent is busy. | `Shift+Tab`        |
| `app.showMoreLines`           | Expand and collapse blocks of content when not in alternate buffer mode.                                                                           | `Ctrl+O`           |
| `app.expandPaste`             | Expand or collapse a paste placeholder when cursor is over placeholder.                                                                            | `Ctrl+O`           |
| `app.focusShellInput`         | Move focus from Gemini to the active shell.                                                                                                        | `Tab`              |
| `app.unfocusShellInput`       | Move focus from the shell back to Gemini.                                                                                                          | `Shift+Tab`        |
| `app.clearScreen`             | Clear the terminal screen and redraw the UI.                                                                                                       | `Ctrl+L`           |
| `app.restart`                 | Restart the application.                                                                                                                           | `R`<br />`Shift+R` |
| `app.suspend`                 | Suspend the CLI and move it to the background.                                                                                                     | `Ctrl+Z`           |
| `app.showShellUnfocusWarning` | Show warning when trying to move focus away from shell input.                                                                                      | `Tab`              |
| `app.voiceModePTT`            | Hold to speak in Voice Mode.                                                                                                                       | `Space`            |

#### Background Shell Controls

| Command                     | Action                                                             | Keys        |
| --------------------------- | ------------------------------------------------------------------ | ----------- |
| `background.escape`         | Dismiss background shell list.                                     | `Esc`       |
| `background.select`         | Confirm selection in background shell list.                        | `Enter`     |
| `background.toggle`         | Toggle current background shell visibility.                        | `Ctrl+B`    |
| `background.toggleList`     | Toggle background shell list.                                      | `Ctrl+L`    |
| `background.kill`           | Kill the active background shell.                                  | `Ctrl+K`    |
| `background.unfocus`        | Move focus from background shell to Gemini.                        | `Shift+Tab` |
| `background.unfocusList`    | Move focus from background shell list to Gemini.                   | `Tab`       |
| `background.unfocusWarning` | Show warning when trying to move focus away from background shell. | `Tab`       |
| `app.dumpFrame`             | Dump the current frame as a snapshot.                              | `F8`        |
| `app.startRecording`        | Start recording the session.                                       | `F6`        |
| `app.stopRecording`         | Stop recording the session.                                        | `F7`        |

#### Extension Controls

| Command            | Action                                      | Keys |
| ------------------ | ------------------------------------------- | ---- |
| `extension.update` | Update the current extension if available.  | `I`  |
| `extension.link`   | Link the current extension to a local path. | `L`  |

<!-- KEYBINDINGS-AUTOGEN:END -->

## Customizing Keybindings

You can add alternative keybindings or remove default keybindings by creating a
`keybindings.json` file in your home gemini directory (typically
`~/.gemini/keybindings.json`).

### Configuration Format

The configuration uses a JSON array of objects, similar to VS Code's keybinding
schema. Each object must specify a `command` from the reference tables above and
a `key` combination.

```json
[
  {
    "command": "edit.clear",
    "key": "cmd+l"
  },
  {
    // prefix "-" to unbind a key
    "command": "-app.toggleYolo",
    "key": "ctrl+y"
  },
  {
    "command": "input.submit",
    "key": "ctrl+y"
  },
  {
    // multiple modifiers
    "command": "cursor.right",
    "key": "shift+alt+a"
  },
  {
    // Some mac keyboards send "Å" instead of "shift+option+a"
    "command": "cursor.right",
    "key": "Å"
  },
  {
    // some base keys have special multi-char names
    "command": "cursor.right",
    "key": "shift+pageup"
  }
]
```

- **Unbinding** To remove an existing or default keybinding, prefix a minus sign
  (`-`) to the `command` name.
- **No Auto-unbinding** The same key can be bound to multiple commands in
  different contexts at the same time. Therefore, creating a binding does not
  automatically unbind the key from other commands.
- **Explicit Modifiers**: Key matching is explicit. For example, a binding for
  `ctrl+f` will only trigger on exactly `ctrl+f`, not `ctrl+shift+f` or
  `alt+ctrl+f`.
- **Literal Characters**: Terminals often translate complex key combinations
  (especially on macOS with the `Option` key) into special characters, losing
  modifier and keystroke information along the way. For example,`shift+5` might
  be sent as `%`. In these cases, you must bind to the literal character `%` as
  bindings to `shift+5` will never fire. To see precisely what is being sent,
  enable `Debug Keystroke Logging` and hit f12 to open the debug log console.
- **Key Modifiers**: The supported key modifiers are:
  - `ctrl`
  - `shift`,
  - `alt` (synonyms: `opt`, `option`)
  - `cmd` (synonym: `meta`)
- **Base Key**: The base key can be any single unicode code point or any of the
  following special keys:
  - **Navigation**: `up`, `down`, `left`, `right`, `home`, `end`, `pageup`,
    `pagedown`
  - **Actions**: `enter`, `escape`, `tab`, `space`, `backspace`, `delete`,
    `clear`, `insert`, `printscreen`
  - **Toggles**: `capslock`, `numlock`, `scrolllock`, `pausebreak`
  - **Function Keys**: `f1` through `f35`
  - **Numpad**: `numpad0` through `numpad9`, `numpad_add`, `numpad_subtract`,
    `numpad_multiply`, `numpad_divide`, `numpad_decimal`, `numpad_separator`

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
- `Ctrl + X` (while a plan is presented): Open the plan in an external editor to
  [collaboratively edit or comment](../cli/plan-mode.md#collaborative-plan-editing)
  on the implementation strategy.
- `Double-click` on a paste placeholder (alternate buffer mode only): Expand to
  view full content inline. Double-click again to collapse.

## Vi mode shortcuts

When vim mode is enabled with `/vim` or `general.vimMode: true`, Gemini CLI
supports NORMAL and INSERT modes.

### Mode switching

| Action                                       | Keys      |
| -------------------------------------------- | --------- |
| Enter NORMAL mode from INSERT mode           | `Esc`     |
| Enter INSERT mode at the cursor              | `i`       |
| Enter INSERT mode after the cursor           | `a`       |
| Enter INSERT mode at the start of the line   | `I`       |
| Enter INSERT mode at the end of the line     | `A`       |
| Insert a new line below and switch to INSERT | `o`       |
| Insert a new line above and switch to INSERT | `O`       |
| Clear input in NORMAL mode                   | `Esc Esc` |

### Navigation in NORMAL mode

| Action                            | Keys            |
| --------------------------------- | --------------- |
| Move left                         | `h`             |
| Move down                         | `j`             |
| Move up                           | `k`             |
| Move right                        | `l`             |
| Move to start of line             | `0`             |
| Move to first non-whitespace char | `^`             |
| Move to end of line               | `$`             |
| Move forward by word              | `w`             |
| Move backward by word             | `b`             |
| Move to end of word               | `e`             |
| Move forward by WORD              | `W`             |
| Move backward by WORD             | `B`             |
| Move to end of WORD               | `E`             |
| Go to first line                  | `gg`            |
| Go to last line                   | `G`             |
| Go to line N                      | `N G` or `N gg` |

Counts are supported for navigation commands. For example, `5j` moves down five
lines and `3w` moves forward three words.

### Editing in NORMAL mode

| Action                         | Keys  |
| ------------------------------ | ----- |
| Delete character under cursor  | `x`   |
| Delete to end of line          | `D`   |
| Delete line                    | `dd`  |
| Change to end of line          | `C`   |
| Change line                    | `cc`  |
| Delete forward word            | `dw`  |
| Delete backward word           | `db`  |
| Delete to end of word          | `de`  |
| Delete forward WORD            | `dW`  |
| Delete backward WORD           | `dB`  |
| Delete to end of WORD          | `dE`  |
| Change forward word            | `cw`  |
| Change backward word           | `cb`  |
| Change to end of word          | `ce`  |
| Change forward WORD            | `cW`  |
| Change backward WORD           | `cB`  |
| Change to end of WORD          | `cE`  |
| Delete to start of line        | `d0`  |
| Delete to first non-whitespace | `d^`  |
| Change to start of line        | `c0`  |
| Change to first non-whitespace | `c^`  |
| Delete from first line to here | `dgg` |
| Delete from here to last line  | `dG`  |
| Change from first line to here | `cgg` |
| Change from here to last line  | `cG`  |
| Undo last change               | `u`   |
| Repeat last command            | `.`   |

Counts are also supported for editing commands. For example, `3dd` deletes three
lines and `2cw` changes two words.

## Limitations

- On [Windows Terminal](https://en.wikipedia.org/wiki/Windows_Terminal):
  - `shift+enter` is only supported in version 1.25 and higher.
  - `shift+tab`
    [is not supported](https://github.com/google-gemini/gemini-cli/issues/20314)
    on Node 20 and earlier versions of Node 22.
- On macOS's [Terminal](<https://en.wikipedia.org/wiki/Terminal_(macOS)>):
  - `shift+enter` is not supported.
