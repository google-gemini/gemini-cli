# Gemini CLI

Within Gemini CLI, `packages/cli` is the frontend for users to send and receive prompts with the Gemini AI model and its associated tools. For a general overview of Gemini CLI, see the [main documentation page](../index.md).

## Navigating this section

- **[Authentication](./authentication.md):** A guide to setting up authentication with Google's AI services.
- **[Commands](./commands.md):** A reference for Gemini CLI commands (e.g., `/help`, `/tools`, `/theme`).
- **[Configuration](./configuration.md):** A guide to tailoring Gemini CLI behavior using configuration files.
- **[Token Caching](./token-caching.md):** Optimize API costs through token caching.
- **[Themes](./themes.md)**: A guide to customizing the CLI's appearance with different themes.
- **[Tutorials](tutorials.md)**: A tutorial showing how to use Gemini CLI to automate a development task.

## Interactive vs. Non-Interactive Modes

Gemini CLI supports two primary modes of operation to suit different workflows:

- **Interactive Mode:** This is the default REPL (Read-Eval-Print Loop) experience, where you engage in a continuous conversation with the AI, receiving responses and issuing follow-up prompts. This mode is ideal for exploratory coding, debugging, and iterative problem-solving.

- **Non-Interactive Mode:** This mode is designed for scripting, automation, and single-shot tasks. You provide input to the CLI (e.g., via piping or command-line flags), it executes the command, and then exits. This is useful for integrating Gemini CLI into automated scripts or CI/CD pipelines.

### Non-interactive mode

To run Gemini CLI in non-interactive mode, you can pipe input to the CLI or use the `--prompt` (or `-p`) flag. The CLI will execute the command and print the output to your terminal, then exit.

**Example: Piping a command to Gemini CLI**

```bash
echo "What is fine tuning?" | gemini
```

**Example: Using the `--prompt` flag**

```bash
gemini -p "What is fine tuning?"
```
