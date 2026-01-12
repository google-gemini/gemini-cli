# Vim Mode

The Gemini CLI supports a robust Vim mode that emulates many standard Vim
commands for navigation and editing. This mode allows you to efficiently edit
your prompt and navigate through text without leaving the keyboard home row.

## Enabling Vim Mode

You can toggle Vim mode on and off using the `/vim` slash command:

```bash
/vim
```

Or you can enable it via the settings menu (`/settings`).

## Supported Commands

### Modes

- **NORMAL**: The default mode for navigation and command execution. Press `Esc`
  to return to Normal mode.
- **INSERT**: For typing text. Press `i`, `a`, `o`, etc., to enter Insert mode.
- **VISUAL**: For selecting text characters. Press `v` to enter Visual mode.
- **VISUAL LINE**: For selecting text lines. Press `V` to enter Visual Line
  mode.

### Navigation

- `h`, `j`, `k`, `l`: Move cursor left, down, up, right.
- `w`: Move forward to the start of the next word.
- `W`: Move forward to the start of the next BIG word (space-delimited).
- `b`: Move backward to the start of the previous word.
- `B`: Move backward to the start of the previous BIG word.
- `e`: Move forward to the end of the current word.
- `E`: Move forward to the end of the current BIG word.
- `0`: Move to the beginning of the line.
- `$`: Move to the end of the line.
- `^`: Move to the first non-whitespace character of the line.
- `gg`: Move to the first line of the document.
- `G`: Move to the last line of the document.
- `[N]G`: Move to line number N.

### Insertion

- `i`: Insert before the cursor.
- `I`: Insert at the beginning of the line.
- `a`: Append after the cursor.
- `A`: Append at the end of the line.
- `o`: Open a new line below the current line.
- `O`: Open a new line above the current line.

### Editing

- `x`: Delete the character under the cursor.
- `dd`: Delete the current line.
- `dw`: Delete from cursor to the start of the next word.
- `dW`: Delete from cursor to the start of the next BIG word.
- `db`: Delete from cursor to the start of the previous word.
- `dB`: Delete from cursor to the start of the previous BIG word.
- `de`: Delete from cursor to the end of the current word.
- `dE`: Delete from cursor to the end of the current BIG word.
- `D`: Delete from cursor to the end of the line.
- `cc`: Change (replace) the current line.
- `cw`: Change from cursor to the start of the next word.
- `cW`: Change from cursor to the start of the next BIG word.
- `cb`: Change from cursor to the start of the previous word.
- `cB`: Change from cursor to the start of the previous BIG word.
- `ce`: Change from cursor to the end of the current word.
- `cE`: Change from cursor to the end of the current BIG word.
- `C`: Change from cursor to the end of the line.
- `u`: Undo the last change.
- `Ctrl+r`: Redo the last undone change.
- `y`: Yank (copy) selected text (in Visual mode). copying
- `p`: Paste after the cursor.
- `P`: Paste before the cursor.

### Visual Mode Operations

In Visual or Visual Line mode (`v` or `V`), you can move the cursor to select
text and then perform operations:

- `d` or `x`: Delete the selection.
- `c`: Change the selection (delete and enter Insert mode).
- `y`: Yank (copy) the selection.

### Search

- `/`: Start forward search. Type your query and press `Enter`.
- `n`: Jump to the next match.
- `N`: Jump to the previous match (reverses direction).

### Counts

Most commands support counts. For example:

- `3j`: Move down 3 lines.
- `2dw`: Delete 2 words.
- `5x`: Delete 5 characters.
