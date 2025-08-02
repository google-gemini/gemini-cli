# Gemini CLI Keyboard Shortcuts

This document lists the available keyboard shortcuts in the Gemini CLI.

## General

| Shortcut | Description                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| `Esc`    | Close dialogs and suggestions.                                                                                        |
| `Ctrl+C` | Exit the application. Press twice to confirm.                                                                         |
| `Ctrl+D` | Exit the application if the input is empty. Press twice to confirm.                                                   |
| `Ctrl+L` | Clear the screen.                                                                                                     |
| `Ctrl+O` | Toggle the display of the debug console.                                                                              |
| `Ctrl+S` | Allows long responses to print fully, disabling truncation. Use your terminal's scrollback to view the entire output. |
| `Ctrl+T` | Toggle the display of tool descriptions.                                                                              |
| `Ctrl+Y` | Toggle auto-approval (YOLO mode) for all tool calls.                                                                  |

## Input Prompt

| Shortcut                                           | Description                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                | Toggle shell mode when the input is empty.                                                                                          |
| `\` (at end of line) + `Enter`                     | Insert a newline.                                                                                                                   |
| `Down Arrow`                                       | Navigate down through the input history.                                                                                            |
| `Enter`                                            | Submit the current prompt.                                                                                                          |
| `Meta+Delete` / `Ctrl+Delete`                      | Delete the word to the right of the cursor.                                                                                         |
| `Tab`                                              | Autocomplete the current suggestion if one exists.                                                                                  |
| `Up Arrow`                                         | Navigate up through the input history.                                                                                              |
| `Ctrl+A` / `Home`                                  | Move the cursor to the beginning of the line.                                                                                       |
| `Ctrl+B` / `Left Arrow`                            | Move the cursor one character to the left.                                                                                          |
| `Ctrl+C`                                           | Clear the input prompt                                                                                                              |
| `Ctrl+D` / `Delete`                                | Delete the character to the right of the cursor.                                                                                    |
| `Ctrl+E` / `End`                                   | Move the cursor to the end of the line.                                                                                             |
| `Ctrl+F` / `Right Arrow`                           | Move the cursor one character to the right.                                                                                         |
| `Ctrl+H` / `Backspace`                             | Delete the character to the left of the cursor.                                                                                     |
| `Ctrl+K`                                           | Delete from the cursor to the end of the line.                                                                                      |
| `Ctrl+Left Arrow` / `Meta+Left Arrow` / `Meta+B`   | Move the cursor one word to the left.                                                                                               |
| `Ctrl+N`                                           | Navigate down through the input history.                                                                                            |
| `Ctrl+P`                                           | Navigate up through the input history.                                                                                              |
| `Ctrl+Right Arrow` / `Meta+Right Arrow` / `Meta+F` | Move the cursor one word to the right.                                                                                              |
| `Ctrl+U`                                           | Delete from the cursor to the beginning of the line.                                                                                |
| `Ctrl+V`                                           | Paste clipboard content. If the clipboard contains an image, it will be saved and a reference to it will be inserted in the prompt. |
| `Ctrl+W` / `Meta+Backspace` / `Ctrl+Backspace`     | Delete the word to the left of the cursor.                                                                                          |
| `Ctrl+X` / `Meta+Enter`                            | Open the current input in an external editor.                                                                                       |

## Suggestions

| Shortcut        | Description                            |
| --------------- | -------------------------------------- |
| `Down Arrow`    | Navigate down through the suggestions. |
| `Tab` / `Enter` | Accept the selected suggestion.        |
| `Up Arrow`      | Navigate up through the suggestions.   |

## Radio Button Select

| Shortcut           | Description                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `Down Arrow` / `j` | Move selection down.                                                                                          |
| `Enter`            | Confirm selection.                                                                                            |
| `Up Arrow` / `k`   | Move selection up.                                                                                            |
| `1-9`              | Select an item by its number.                                                                                 |
| (multi-digit)      | For items with numbers greater than 9, press the digits in quick succession to select the corresponding item. |
