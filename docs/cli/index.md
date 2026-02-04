# Using Gemini CLI

Gemini CLI is a terminal-first interface that brings the power of Gemini AI
models directly into your development workflow. It lets you interact with AI
using your local files, shell environment, and project context, creating a
bridge between generative AI and your system tools.

## When to use Gemini CLI

Use Gemini CLI when you need an AI assistant that understands your local
environment and can actively help you manage your codebase.

- **Interactive development:** Chat with the model to brainstorm architecture,
  debug complex errors, or generate new features while the model has access to
  your source code.
- **System automation:** Execute shell commands and file operations through the
  model to automate repetitive tasks like setting up test environments or
  refactoring large sets of files.
- **Scripting and piping:** Integrate AI into your terminal pipelines by using
  headless mode to process data between different command-line tools.
- **Context-aware instructions:** Define persistent project rules and coding
  standards using `GEMINI.md` files so the model always follows your preferred
  patterns.

## Basic features

The following features provide the core functionality for interacting with
Gemini CLI and configuring your daily workflow.

- **[Commands](./commands.md):** Use built-in slash commands to manage your
  session and interface.
- **[Custom commands](./custom-commands.md):** Create your own shortcuts for
  frequently used prompts and patterns.
- **[Headless mode](./headless.md):** Run the CLI programmatically for scripting
  and heavy automation.
- **[Keyboard shortcuts](./keyboard-shortcuts.md):** Improve your terminal
  efficiency with built-in shortcuts.
- **[Model selection](./model.md):** Choose between Gemini Pro, Flash, or the
  recommended Auto setting.
- **[Rewind](./rewind.md):** Undo recent interactions and revert file changes
  with precision.
- **[Session management](./session-management.md):** Resume previous
  conversations and browse your session history.
- **[Settings](./settings.md):** Customize the CLI's behavior, privacy, and
  display options.
- **[Themes](./themes.md):** Personalize the CLI's visual appearance.
- **[Tutorials](./tutorials.md):** Follow guided walkthroughs for common
  development tasks.

## Advanced features

These advanced capabilities let you extend the CLI's power, enhance security,
and optimize your development environment.

- **[Advanced model configuration](./generation-settings.md):** Fine-tune
  generation parameters like temperature and thinking budget.
- **[Agent Skills](./skills.md):** Grant the model specialized expertise through
  procedural workflows.
- **[Checkpointing](./checkpointing.md):** Protect your work with automatic
  snapshots of your session and files.
- **[Context files (GEMINI.md)](./gemini-md.md):** Provide hierarchical,
  persistent instructions to the model.
- **[Enterprise configuration](./enterprise.md):** Manage deployments and
  controls in professional environments.
- **[Ignoring files (.geminiignore)](./gemini-ignore.md):** Exclude sensitive
  data or large build artifacts from the model's view.
- **[Model routing](./model-routing.md):** Enable automatic fallback models to
  ensure your sessions are never interrupted by server issues.
- **[Sandboxing](./sandbox.md):** Run tool executions in secure, containerized
  environments.
- **[System prompt override](./system-prompt.md):** Completely replace the
  built‑in system instructions for highly specialized tasks.
- **[Telemetry](./telemetry.md):** Monitor usage and performance metrics.
- **[Token caching](./token-caching.md):** Reduce costs and improve speed by
  caching frequently used context.
- **[Trusted folders](./trusted-folders.md):** Control which projects can access
  privileged system tools.

## Non-interactive mode

Gemini CLI supports a non-interactive mode that is ideal for scripting and shell
integration. In this mode, the CLI executes your request and exits immediately.

If you are running the CLI in a non-TTY environment (for example, in a script or
a CI pipeline), positional arguments automatically trigger non-interactive mode:

```bash
gemini "What is fine tuning?"
```

You can also pipe input directly to the CLI:

```bash
echo "What is fine tuning?" | gemini
```

For more details on automation and scripting, see the
**[Headless mode](./headless.md)** guide.

## Next steps

- Explore the [Command reference](./commands.md) to learn about all available
  slash commands.
- Read about [Project context](./gemini-md.md) to understand how to provide
  persistent instructions to the model.
- Check out the [Tutorials](./tutorials.md) for guided walkthroughs of common
  workflows.
