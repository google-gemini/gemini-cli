# Example: MCP Security Scanning with Ramparts

This example demonstrates how to use Ramparts to scan MCP servers for security vulnerabilities.

## Install

```bash
# Option A: npm (when available)
npm i -g @getjavelin/gemini-ramparts-extension

# Option B: manual
git clone https://github.com/getjavelin/ramparts.git
cp -r ramparts/gemini-extension ~/.gemini/extensions/ramparts/
cargo install ramparts
```

## Verify Extension

```bash
gemini -l
# Output: Installed extensions: ramparts
```

## Slash Commands

From within Gemini CLI:

```bash
# Check version
/ramparts --version

# Scan all IDE-configured MCP servers
/ramparts scan-config --report

# Scan specific server with authentication
/ramparts scan https://api.example.com/mcp/ --format json --auth-headers "Authorization: Bearer $TOKEN"
```

## Using MCP Tools

Start Ramparts as an MCP server:

```bash
ramparts mcp-stdio
```

In Gemini CLI:

```bash
# View available MCP servers and tools
/mcp desc
# Should show: ramparts-mcp is Ready

# Call tools directly
scan-config

# Call with JSON arguments
scan {"url":"https://api.githubcopilot.com/mcp/","format":"json","auth_headers":{"Authorization":"Bearer TOKEN"}}
```

## Troubleshooting

- **Slash commands dont
