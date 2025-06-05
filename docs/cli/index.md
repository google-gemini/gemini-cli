# Gemini CLI

Welcome to the documentation for the Gemini CLI. This section provides an overview of the CLI's features, how to interact with it, and how to customize your experience.

## What is the Gemini CLI?

The Gemini CLI (`packages/cli`) is the primary way users interact with the Gemini AI model and its associated tools directly from their terminal. It offers an interactive Read-Eval-Print Loop (REPL) environment where you can send prompts to Gemini, receive responses, and see the results of any tools Gemini uses to fulfill your requests.

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

This documentation will help you become proficient in using the Gemini CLI for a wide range of tasks.
