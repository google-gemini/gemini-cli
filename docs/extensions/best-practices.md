# Extensions on Gemini CLI: Best practices

This guide covers best practices for developing, securing, and maintaining
Gemini CLI extensions.

## Development

Developing extensions for Gemini CLI is intended to be a lightweight, iterative
process.

### Structure your extension

While simple extensions can just be a few files, we recommend a robust structure
for complex extensions:

```
my-extension/
├── package.json
├── tsconfig.json
├── gemini-extension.json
├── src/
│   ├── index.ts
│   └── tools/
└── dist/
```

- **Use TypeScript**: We strongly recommend using TypeScript for type safety and
  better tooling.
- **Separate source and build**: Keep your source code in `src` and build to
  `dist`.
- **Bundle dependencies**: If your extension has many dependencies, consider
  bundling them (e.g., with `esbuild` or `webpack`) to reduce install time and
  potential conflicts.

### Iterate with `link`

Use `gemini extensions link` to develop locally without constantly reinstalling:

```bash
cd my-extension
gemini extensions link .
```

Changes to your code (after rebuilding) will be immediately available in the CLI
on restart.

### Use `GEMINI.md` effectively

Your `GEMINI.md` file provides context to the model. Keep it focused:

- **Do:** Explain high-level goals and how to use the provided tools.
- **Don't:** Dump your entire documentation.
- **Do:** Use clear, concise language.

## Security

When building a Gemini CLI extension, follow general security best practices
(such as least privilege and input validation) to reduce risk.

### Minimal permissions

When defining tools in your MCP server, only request the permissions necessary.
Avoid giving the model broad access (like full shell access) if a more
restricted set of tools will suffice.

If you must use powerful tools like `run_shell_command`, consider restricting
them to specific commands in your `gemini-extension.json`:

```json
{
  "name": "my-safe-extension",
  "excludeTools": ["run_shell_command(rm -rf *)"]
}
```

This ensures that even if the model tries to execute a dangerous command, it
will be blocked at the CLI level.

### Validate inputs

Your MCP server is running on the user's machine. Always validate inputs to your
tools to prevent arbitrary code execution or filesystem access outside the
intended scope.

```typescript
// Good: Validating paths
if (!path.resolve(inputPath).startsWith(path.resolve(allowedDir) + path.sep)) {
  throw new Error('Access denied');
}
```

### Sensitive settings

If your extension requires API keys, use the `sensitive: true` option in
`gemini-extension.json`. This ensures keys are stored securely in the system
keychain and obfuscated in the UI.

```json
"settings": [
  {
    "name": "API Key",
    "envVar": "MY_API_KEY",
    "sensitive": true
  }
]
```

## Releasing

You can upload your extension directly to GitHub to list it in the gallery.
Gemini CLI extensions also offers support for more complicated
[releases](releasing.md).

### Semantic versioning

Follow [Semantic Versioning](https://semver.org/).

- **Major**: Breaking changes (renaming tools, changing arguments).
- **Minor**: New features (new tools, commands).
- **Patch**: Bug fixes.

### Release Channels

Use git branches to manage release channels (e.g., `main` for stable, `dev` for
bleeding edge). This allows users to choose their stability level:

```bash
# Stable
gemini extensions install github.com/user/repo

# Dev
gemini extensions install github.com/user/repo --ref dev
```

### Clean artifacts

If you are using GitHub Releases, ensure your release artifacts only contain the
necessary files (`dist/`, `gemini-extension.json`, `package.json`). Exclude
`node_modules` (users will install them) and `src/` to keep downloads small.
