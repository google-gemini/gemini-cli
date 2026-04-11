# Ask User Tool

The `ask_user` tool lets Gemini CLI ask you one or more questions to gather
preferences, clarify requirements, or make decisions. It supports multiple
question types including multiple-choice, free-form text, and Yes/No
confirmation.

## `ask_user` (Ask User)

- **Tool name:** `ask_user`
- **Display name:** Ask User
- **File:** `ask-user.ts`
- **Parameters:**
  - `questions` (array of objects, required): A list of 1 to 4 questions to ask.
    Each question object has the following properties:
    - `question` (string, required): The complete question text.
    - `header` (string, required): A short label (max 16 chars) displayed as a
      chip/tag (for example, "Auth", "Database").
    - `type` (string, optional): The type of question. Defaults to `'choice'`.
      - `'choice'`: Multiple-choice with options (supports multi-select).
      - `'text'`: Free-form text input.
      - `'yesno'`: Yes/No confirmation.
    - `options` (array of objects, optional): Required for `'choice'` type. 2-4
      selectable options.
      - `label` (string, required): Display text (1-5 words).
      - `description` (string, required): Brief explanation.
    - `multiSelect` (boolean, optional): For `'choice'` type, allows selecting
      multiple options. Automatically adds an "All the above" option if there
      are multiple standard options.
    - `placeholder` (string, optional): Hint text for input fields.

- **Behavior:**
  - Presents an interactive dialog to the user with the specified questions.
  - Pauses execution until the user provides answers or dismisses the dialog.
  - Returns the user's answers to the model.
  - In ACP mode, Gemini CLI keeps `ask_user` disabled unless the ACP client
    explicitly opts in to Gemini CLI host-input requests.

- **Output (`llmContent`):** A JSON string containing the user's answers,
  indexed by question position (for example,
  `{"answers":{"0": "Option A", "1": "Some text"}}`).

- **Confirmation:** Yes. The tool inherently involves user interaction.

## ACP mode

In ACP mode, Gemini CLI doesn't assume that the host client can handle
interactive user questions. To preserve existing ACP behavior, Gemini CLI
excludes `ask_user` unless the host explicitly advertises support.

To enable `ask_user` over ACP, the host client must do all of the following:

1. Set `clientCapabilities._meta.geminiCli.hostInput.requestUserInput` to
   `true`.
2. Include `ask_user` in
   `clientCapabilities._meta.geminiCli.hostInput.supportedKinds`, or omit
   `supportedKinds` entirely.
3. Handle the `gemini/requestUserInput` ACP extension request and return either
   submitted answers or cancellation.

If the host omits `ask_user` from `supportedKinds`, Gemini CLI keeps the tool
disabled in ACP mode. This lets a client support other host-input request kinds
without taking on `ask_user`.

When enabled, Gemini CLI sends the same question payload that the terminal UI
uses. The ACP extension request looks like this:

```json
{
  "sessionId": "session-123",
  "requestId": "ask_user-456",
  "kind": "ask_user",
  "title": "Ask User",
  "questions": [
    {
      "header": "Database",
      "question": "Which database would you like to use?",
      "type": "choice",
      "options": [
        {
          "label": "PostgreSQL",
          "description": "Powerful, open source object-relational database system."
        },
        {
          "label": "SQLite",
          "description": "C-library that implements a SQL database engine."
        }
      ]
    }
  ]
}
```

The ACP client responds with one of these payloads:

```json
{
  "outcome": "submitted",
  "answers": {
    "0": "PostgreSQL"
  }
}
```

```json
{
  "outcome": "cancelled"
}
```

## Usage Examples

### Multiple Choice Question

```json
{
  "questions": [
    {
      "header": "Database",
      "question": "Which database would you like to use?",
      "type": "choice",
      "options": [
        {
          "label": "PostgreSQL",
          "description": "Powerful, open source object-relational database system."
        },
        {
          "label": "SQLite",
          "description": "C-library that implements a SQL database engine."
        }
      ]
    }
  ]
}
```

### Text Input Question

```json
{
  "questions": [
    {
      "header": "Project Name",
      "question": "What is the name of your new project?",
      "type": "text",
      "placeholder": "for example, my-awesome-app"
    }
  ]
}
```

### Yes/No Question

```json
{
  "questions": [
    {
      "header": "Deploy",
      "question": "Do you want to deploy the application now?",
      "type": "yesno"
    }
  ]
}
```
