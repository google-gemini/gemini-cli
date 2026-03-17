# Morph MCP Extension Example

Use this scaffold to add a compact Morph-powered MCP extension to the Gemini CLI.

## Description

This example exposes three tools through the `morph` MCP server:

- `morph_edit`
- `warpgrep_codebase_search`
- `warpgrep_github_search`

## Files

- `morph-server.js`: Stdio MCP server implementation.
- `gemini-extension.json`: Extension manifest consumed by Gemini CLI.
- `package.json`: Extension package metadata and dependencies.
- `GEMINI.md`: Routing guidance for Gemini.

## How to use

1. Create an extension from this template:

   ```bash
   gemini extensions new ./my-morph-extension morph
   ```

2. Open the extension folder and install dependencies:

   ```bash
   cd ./my-morph-extension
   npm install
   ```

3. Link and test the extension:

   ```bash
   gemini extensions link ./my-morph-extension
   ```

4. Start Gemini and verify that the extension tools are discoverable.

## Notes

The server requires `MORPH_API_KEY` in the environment where Gemini launches the
extension.
