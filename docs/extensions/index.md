# Gemini CLI extensions

Gemini CLI extensions package prompts, MCP servers, custom commands, hooks,
sub-agents, and agent skills into a familiar and user-friendly format. With
extensions, you can expand the capabilities of Gemini CLI and share those
capabilities with others. They are designed to be easily installable and
shareable.

To see examples of extensions, you can browse a gallery of
[Gemini CLI extensions](https://geminicli.com/extensions/browse/).

## Managing extensions

You can verify your installed extensions and their status using the interactive
command:

```bash
/extensions list
```

or in noninteractive mode:

```bash
gemini extensions list
```

## Installation

To install a real extension, you can use the `extensions install` command with a
GitHub repository URL in noninteractive mode. For example:

```bash
gemini extensions install https://github.com/gemini-cli-extensions/workspace
```

## Next steps

- [Writing extensions](writing-extensions.md): Learn how to create your first
  extension.
- [Extensions reference](reference.md): Deeply understand the extension format,
  commands, and configuration.
- [Best practices](best-practices.md): Learn strategies for building great
  extensions.
- [Extensions releasing](releasing.md): Learn how to share your extensions with
  the world.
