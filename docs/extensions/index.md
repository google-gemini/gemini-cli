# Gemini CLI extensions

Gemini CLI extensions let you expand the capabilities of Gemini CLI by adding
custom tools, commands, and context. Whether you want to use existing
automations or build your own, extensions provide a powerful way to customize
your development environment.

To see what's possible, browse the
[Gemini CLI extension gallery](https://geminicli.com/extensions/browse/).

## Choose your path

Choose the guide that best fits your needs.

### I want to use extensions

Learn how to discover, install, and manage extensions to enhance your Gemini CLI
experience.

- **[Manage extensions](#manage-extensions):** List and verify your installed
  extensions.
- **[Install extensions](#installation):** Add new capabilities from GitHub or
  local paths.

### I want to build extensions

Learn how to create, test, and share your own extensions with the community.

- **[Build extensions](writing-extensions.md):** Create your first extension
  from a template.
- **[Best practices](best-practices.md):** Learn how to build secure and
  reliable extensions.
- **[Publish to the gallery](releasing.md):** Share your work with the world.

## Manage extensions

Use the interactive `/extensions` command to verify your installed extensions
and their status:

```bash
/extensions list
```

You can also manage extensions from your terminal using the `gemini extensions`
command group:

```bash
gemini extensions list
```

## Installation

Install an extension by providing its GitHub repository URL. For example:

```bash
gemini extensions install https://github.com/gemini-cli-extensions/workspace
```

For more advanced installation options, see the
[Extension reference](reference.md#install-an-extension).
