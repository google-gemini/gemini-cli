# Featured Extensions

## Ramparts — MCP Security Scanner

Ramparts scans Model Context Protocol (MCP) servers for capabilities (tools, resources, prompts) and flags security risks (SQL/command injection, secrets leakage, prompt injection/jailbreak, path traversal). It can also run as an MCP server.

### Install

**Option A (npm, when available):**
```bash
npm install -g @getjavelin/gemini-ramparts-extension
```

**Option B (manual):**
```bash
# Clone and copy extension
git clone https://github.com/getjavelin/ramparts.git
cp -r ramparts/gemini-extension ~/.gemini/extensions/ramparts/

# Install Ramparts CLI
cargo install ramparts
```

### Verify

```bash
gemini -l
# Should show: Installed extensions: ramparts
```

### Slash Commands

```bash
/ramparts --version
/ramparts scan <url> [--auth-headers "Authorization: Bearer <token>"] [--report]
/ramparts scan-config [--report]
```

### Run as MCP Server

Configure in your extension manifest or run directly:

```bash
ramparts mcp-stdio
```

In Gemini CLI:
```bash
/mcp desc
# Should show "ramparts-mcp" with tools: health, scan-config, scan
```

### Tips

- Use `--format json` or `--report` for readable artifacts
- If LLM checks return 401, set your API key: `ramparts init-config`
- Repository: https://github.com/getjavelin/ramparts
