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
      chip/tag (e.g., "Auth", "Database").
    - `type` (string, optional): The type of question. Defaults to `'choice'`.
      - `'choice'`: Multiple-choice with options (supports multi-select).
      - `'text'`: Free-form text input.
      - `'yesno'`: Yes/No confirmation.
    - `options` (array of objects, optional): Required for `'choice'` type. 2-4
      selectable options.
      - `label` (string, required): Display text (1-5 words).
      - `description` (string, required): Brief explanation.
    - `multiSelect` (boolean, optional): For `'choice'` type, allows selecting
      multiple options.
    - `placeholder` (string, optional): Hint text for input fields.

- **Behavior:**
  - Presents an interactive dialog to the user with the specified questions.
  - Pauses execution until the user provides answers or dismisses the dialog.
  - Returns the user's answers to the model.

- **Output (`llmContent`):** A JSON string containing the user's answers,
  indexed by question position (e.g.,
  `{"answers":{"0": "Option A", "1": "Some text"}}`).

- **Confirmation:** Yes. The tool inherently involves user interaction.

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
      "placeholder": "e.g., my-awesome-app"
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
