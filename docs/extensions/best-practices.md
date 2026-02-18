# Gemini CLI extension best practices

This guide covers best practices for developing, securing, and maintaining
Gemini CLI extensions.

## Development

Developing extensions for Gemini CLI is a lightweight, iterative process. Use
these strategies to build robust and efficient extensions.

### Structure your extension

While simple extensions may contain only a few files, we recommend a organized
structure for complex projects.

```text
my-extension/
├── package.json
├── tsconfig.json
├── gemini-extension.json
├── src/
│   ├── index.ts
│   └── tools/
└── dist/
```

- **Use TypeScript:** We strongly recommend using TypeScript for type safety and
  improved developer experience.
- **Separate source and build:** Keep your source code in `src/` and output
  build artifacts to `dist/`.
- **Bundle dependencies:** If your extension has many dependencies, bundle them
  using a tool like `esbuild` to reduce installation time and avoid conflicts.

### Iterate with `link`

Use the `gemini extensions link` command to develop locally without reinstalling
your extension after every change.

```bash
cd my-extension
gemini extensions link .
```

Changes to your code are immediately available in the CLI after you rebuild the
project and restart the session.

### Use `GEMINI.md` effectively

Your `GEMINI.md` file provides essential context to the model.

- **Focus on goals:** Explain the high-level purpose of the extension and how to
  interact with its tools.
- **Be concise:** Avoid dumping exhaustive documentation into the file. Use
  clear, direct language.
- **Provide examples:** Include brief examples of how the model should use
  specific tools or commands.

## Security

Follow the principle of least privilege and rigorous input validation when
building extensions.

### Minimal permissions

Only request the permissions your MCP server needs to function. Avoid giving the
model broad access (such as full shell access) if restricted tools are
sufficient.

If your extension uses powerful tools like `run_shell_command`, restrict them in
your `gemini-extension.json` file:

```json
{
  "name": "my-safe-extension",
  "excludeTools": ["run_shell_command(rm -rf *)"]
}
```

This ensures the CLI blocks dangerous commands even if the model attempts to
execute them.

### Validate inputs

Your MCP server runs on the user's machine. Always validate tool inputs to
prevent arbitrary code execution or unauthorized filesystem access.

```typescript
// Example: Validating paths
if (!path.resolve(inputPath).startsWith(path.resolve(allowedDir) + path.sep)) {
  throw new Error('Access denied');
}
```

### Secure sensitive settings

If your extension requires API keys or other secrets, use the `sensitive: true`
option in your manifest. This ensures keys are stored in the system keychain and
obfuscated in the CLI output.

```json
"settings": [
  {
    "name": "API Key",
    "envVar": "MY_API_KEY",
    "sensitive": true
  }
]
```

## Release

Follow standard versioning and release practices to ensure a smooth experience
for your users.

### Semantic versioning

Follow [Semantic Versioning (SemVer)](https://semver.org/) to communicate
changes clearly.

- **Major:** Breaking changes (e.g., renaming tools or changing arguments).
- **Minor:** New features (e.g., adding new tools or commands).
- **Patch:** Bug fixes and performance improvements.

### Release channels

Use Git branches to manage release channels. This lets users choose between
stability and the latest features.

```bash
# Install the stable version (default branch)
gemini extensions install github.com/user/repo

# Install the development version
gemini extensions install github.com/user/repo --ref dev
```

### Clean artifacts

When using GitHub Releases, ensure your archives only contain necessary files
(such as `dist/`, `gemini-extension.json`, and `package.json`). Exclude
`node_modules/` and `src/` to minimize download size.

## Test and verify

Test your extension thoroughly before releasing it to users.

- **Manual verification:** Use `gemini extensions link` to test your extension
  in a live CLI session. Verify that tools appear in the debug console (F12) and
  that custom commands resolve correctly.
- **Automated testing:** If your extension includes an MCP server, write unit
  tests for your tool logic using a framework like Vitest or Jest. You can test
  MCP tools in isolation by mocking the transport layer.

## Troubleshooting

Use these tips to diagnose and fix common extension issues.

### Extension not loading

If your extension doesn't appear in `/extensions list`:

- **Check the manifest:** Ensure `gemini-extension.json` is in the root
  directory and contains valid JSON.
- **Verify the name:** The `name` field in the manifest must match the extension
  directory name exactly.
- **Restart the CLI:** Extensions are loaded at the start of a session. Restart
  Gemini CLI after making changes to the manifest or linking a new extension.

### MCP server failures

If your tools aren't working as expected:

- **Check the logs:** View the CLI logs to see if the MCP server failed to
  start.
- **Test the command:** Run the server's `command` and `args` directly in your
  terminal to ensure it starts correctly outside of Gemini CLI.
- **Debug console:** In interactive mode, press **F12** to open the debug
  console and inspect tool calls and responses.

### Command conflicts

If a custom command isn't responding:

- **Check precedence:** Remember that user and project commands take precedence
  over extension commands. Use the prefixed name (e.g., `/extension.command`) to
  verify the extension's version.
- **Help command:** Run `/help` to see a list of all available commands and
  their sources.
