# Gemini CLI

Within Gemini CLI, `packages/cli` is the frontend for users to send and receive
prompts with the Gemini AI model and its associated tools. For a general
overview of Gemini CLI, see the [main documentation page](../index.md).

## Basic features

- **[Commands](./commands.md):** A reference for all built-in slash commands
- **[Custom commands](./custom-commands.md):** Create your own commands and
  shortcuts for frequently used prompts.
- **[Headless mode](./headless.md):** Use Gemini CLI programmatically for
  scripting and automation.
- **[Model selection](./model.md):** Configure the Gemini AI model used by the
  CLI.
- **[Settings](./settings.md):** Configure various aspects of the CLI's behavior
  and appearance.
- **[Themes](./themes.md):** Customizing the CLI's appearance with different
  themes.
- **[Keyboard shortcuts](./keyboard-shortcuts.md):** A reference for all
  keyboard shortcuts to improve your workflow.
- **[Tutorials](./tutorials.md):** Step-by-step guides for common tasks.

## Advanced features

- **[Checkpointing](./checkpointing.md):** Automatically save and restore
  snapshots of your session and files.
- **[Enterprise configuration](./enterprise.md):** Deploy and manage Gemini CLI
  in an enterprise environment.
- **[Sandboxing](./sandbox.md):** Isolate tool execution in a secure,
  containerized environment.
- **[Telemetry](./telemetry.md):** Configure observability to monitor usage and
  performance.
- **[Token caching](./token-caching.md):** Optimize API costs by caching tokens.
- **[Trusted folders](./trusted-folders.md):** A security feature to control
  which projects can use the full capabilities of the CLI.
- **[Ignoring files (.geminiignore)](./gemini-ignore.md):** Exclude specific
  files and directories from being accessed by tools.
- **[Context files (GEMINI.md)](./gemini-md.md):** Provide persistent,
  hierarchical context to the model.
- **[System prompt override](./system-prompt.md):** Replace the built‑in system
  instructions using `GEMINI_SYSTEM_MD`.

## Non-interactive mode

Gemini CLI can be run in a non-interactive mode, which is useful for scripting
and automation. In this mode, you pipe input to the CLI, it executes the
command, and then it exits.

The following example pipes a command to Gemini CLI from your terminal:

```bash
echo "What is fine tuning?" | gemini
```

You can also use the `--prompt` or `-p` flag:

```bash
gemini -p "What is fine tuning?"
```

For comprehensive documentation on headless usage, scripting, automation, and
advanced examples, see the **[Headless mode](./headless.md)** guide.
