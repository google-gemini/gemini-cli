# Gemini CLI Extensions

Gemini CLI supports extensions that can be used to configure and extend its functionality.

## How it works

On startup, Gemini CLI looks for extensions in two locations:

1.  `<workspace>/.gemini/extensions`
2.  `<home>/.gemini/extensions`

It will load all extensions from both locations, but if an extension with the same name exists in both, the one in the workspace directory will take precedence.

Each extension is a directory that contains a `gemini-extension.json` file. This file contains the configuration for the extension.

### `gemini-extension.json`

The `gemini-extension.json` file has the following structure:

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "mcpServers": {
    "my-server": {
      "command": "node my-server.js"
    }
  },
  "contextFileName": "GEMINI.md"
}
```

- `name`: The name of the extension. This is used to uniquely identify the extension.
- `version`: The version of the extension.
- `mcpServers`: A map of MCP servers to configure. The key is the name of the server, and the value is the server configuration. These servers will be loaded on startup just like mcpServers configured in settings.json. If an extension and settings.json configure a mcp server with the same name, settings.json will take precedence.
- `contextFileName`: The name of the file that contains the context for the extension. This will be used to load the context from the workspace. If this property is not used but a `Gemini.md` is present then that file will be loaded.

When Gemini CLI starts, it will load all the extensions and merge their configurations. If there are any conflicts, the workspace configuration will take precedence.
