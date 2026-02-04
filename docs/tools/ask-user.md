# Ask user tool (`ask_user`)

The `ask_user` tool allows the Gemini agent to request clarification or missing
information from you during complex tasks.

## Description

The agent uses this tool when it identifies that it cannot proceed without user
input. It presents questions or options via an interactive dialog in the CLI.

## How to use

This tool is used exclusively by the Gemini agent. It cannot be invoked
manually.

### Arguments

- `questions` (array of objects, required): A list of questions to ask. Each
  object includes:
  - `question` (string, required): The question text.
  - `header` (string, required): A short label (max 12 chars).
  - `type` (enum, optional): `choice`, `text`, or `yesno`.
  - `options` (array, optional): Selectable options for `choice` type.
  - `placeholder` (string, optional): Hint text for `text` type.
  - `multiSelect` (boolean, optional): Whether to allow multiple selections.

## Technical behavior

- **Interface:** Triggers a modal-style dialog above the input prompt.
- **Execution:** Pauses agent logic until the user submits a response.
- **Response:** Returns the user's answers to the model as a tool result.

## Use cases

- Clarifying ambiguous user requests.
- Selecting between multiple possible implementation paths.
- Requesting missing configuration values or credentials.

## Next steps

- Learn about [Memory management](../tutorials/memory-management.md) to reduce
  the need for clarification.
