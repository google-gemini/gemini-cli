# Gemini CLI

The Gemini CLI (`packages/cli`) is the primary way users interact with the Gemini AI model and its associated tools directly from their terminal. For a general overview of the Gemini CLI, see the [main documentation page](../index.md).

## Core Features

- **Interactive Prompt:** A familiar command-line prompt for entering your queries and commands.
- **Rich Output Display:**
  - Formatted Markdown rendering for clear and readable text responses.
  - Syntax highlighting for code blocks in various languages.
  - Clear display of tool calls, inputs, and outputs.
- **Command History:** Easily access and re-run previous commands and prompts.
- **Theming:** Customize the look and feel of the CLI to your preference. See [Themes section](./themes.md).
- **Configuration:** Tailor the CLI's behavior through configuration files. See [CLI Configuration](./configuration.md).
- **Special Commands:** Utilize built-in commands for tasks like managing history, memory, or display. See [Commands](./commands.md).
- **Enhanced Input:** Support for multiline input editing and readline-like keybindings for a more comfortable and efficient command entry experience.

## Basic Interaction

1.  **Start the CLI:** Run `npm start` from the project root (or execute the installed CLI command directly). Refer to the main [README.md](../../README.md) for setup and running instructions.
2.  **Enter a Prompt:** Type your question or instruction at the `>` prompt and press Enter.
    ```
    > Explain how to build a web app.
    ```
3.  **View Response:** Gemini's response will be displayed in the terminal. If Gemini needs to use a tool (e.g., to read a file you mentioned), you will see messages indicating the tool usage.
4.  **Continue Conversation:** You can continue the conversation by asking follow-up questions or giving new instructions.

## Navigating this Section

- **[Commands](./commands.md):** A detailed reference for all built-in CLI commands (e.g., `/help`, `/history`, `/theme`).
- **[Configuration](./configuration.md):** Understand how to configure various aspects of the CLI.
- **[Themes](./themes.md)**: A guide to customizing the CLI's appearance with different themes.
- **[Tutorials](tutorials.md)**: A guide for mastering use of the CLI to automate your development tasks.

## Non-Interactive Mode

The Gemini CLI can be run in a non-interactive mode, which is useful for scripting and automation. In this mode, you can pipe input to the CLI and it will execute the command and exit.

To use the non-interactive mode, you can pipe a command to the CLI. For example:

```bash
echo "What is fine tuning?" | gemini
```

You can achieve the same result with the `--prompt` or `p` argument. For example:

```bash
gemini -p "What is fine tuning?"
```

In both cases this will execute the command and print the output to the console.
