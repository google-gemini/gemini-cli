# Gemini CLI - Agent Instructions

## For AI Agents Working on This Project

This document provides specific instructions for AI agents (Claude, Codex,
Copilot, etc.) working on the TROZLAN Gemini CLI fork.

---

## CRITICAL: This is a STAGING Repository

```
Google Upstream          →  THIS REPO (Staging)  →  Phoenix CLI (Product)
google-gemini/gemini-cli    gemini-cli               phoenix_cli
```

### DO NOT:

- Add custom TROZLAN features here
- Add model selector, MCP integrations, or custom code
- Commit TROZLAN-specific functionality

### DO:

- Test Google's upstream features
- Prototype ideas before cherry-picking to Phoenix CLI
- Keep this repo clean for auto-sync with Google

### If you need to add custom features:

```bash
# Switch to Phoenix CLI instead
cd /Users/chrisozsvath/Projects/TROZLAN/TROZLANIO/phoenix_cli
# Work there, not here
```

### Related Repository

| Repo                          | Purpose                              | Command      |
| ----------------------------- | ------------------------------------ | ------------ |
| **This repo** (gemini-cli)    | Staging, upstream sync               | `gemini-dev` |
| **Phoenix CLI** (phoenix_cli) | TROZLAN product with custom features | `phoenix`    |

---

## Project Context

- **Type**: Fork of Google's official Gemini CLI (STAGING ONLY)
- **Purpose**: Sync with Google upstream, test features before cherry-picking
- **Language**: TypeScript (98%), JavaScript (1.9%)
- **Framework**: Node.js monorepo with npm workspaces

## Quick Commands

```bash
# Check version
gemini-dev --version

# Run with prompt (non-interactive)
gemini-dev -p "Your prompt here"

# Start interactive session
gemini-dev

# Run in tmux (recommended for long sessions)
tmux new-session -d -s gemini-dev "gemini-dev"
tmux attach -t gemini-dev
```

## Development Workflow

### Before Making Changes

1. **Sync with upstream**:

   ```bash
   git fetch upstream
   git merge upstream/main
   git push origin main
   ```

2. **Create feature branch**:
   ```bash
   git checkout -b feat/your-feature
   ```

### After Making Changes

1. **Build and test**:

   ```bash
   npm run preflight  # Full check: build, test, typecheck, lint
   ```

2. **Rebuild bundle**:

   ```bash
   npm run bundle
   ```

3. **Test locally**:
   ```bash
   gemini-dev -p "Test your changes"
   ```

## Key Directories

| Directory              | Purpose                      |
| ---------------------- | ---------------------------- |
| `packages/cli/`        | Main CLI application         |
| `packages/core/`       | Core library                 |
| `packages/a2a-server/` | Agent-to-agent communication |
| `bundle/`              | Built executable             |
| `docs/`                | Documentation                |

## Testing

```bash
# Run all tests
npm test

# Test specific package
npm test -w @google/gemini-cli-core

# Test specific file (path relative to package)
npm test -w @google/gemini-cli-core -- src/path/to/file.test.ts
```

## Configuration

### Environment Variables

| Variable                | Description                |
| ----------------------- | -------------------------- |
| `GEMINI_API_KEY`        | Google AI Studio API key   |
| `GOOGLE_CLOUD_PROJECT`  | GCP project for Vertex AI  |
| `GOOGLE_CLOUD_LOCATION` | Vertex AI region           |
| `GEMINI_DEV_TRACING`    | Enable dev traces (`true`) |

### Current Setup

```bash
# gemini-dev uses separate API key
GEMINI_API_KEY=AIzaSy...BwM  # Dev key (separate quota)

# Global gemini uses
GEMINI_API_KEY=AIzaSy...2StM  # Production key
```

## Common Tasks

### Adding a New Tool

1. Create tool in `packages/core/src/tools/`
2. Register in `packages/core/src/config/config.ts`
3. Add tests in same directory
4. Run `npm run preflight`

### Modifying CLI Behavior

1. Edit files in `packages/cli/src/`
2. Rebuild: `npm run bundle`
3. Test: `gemini-dev`

### Adding MCP Server Integration

1. Configure in `~/.gemini/settings.json`
2. Restart gemini-dev
3. Check connection with `/mcp` command

## Troubleshooting

### MCP Server Errors

If you see schema validation errors:

```
Error discovering tools from networks: tools[X].inputSchema
```

This is usually a server-side issue, not gemini-cli. The CLI will still
function.

### Rate Limits

If hitting rate limits:

- Wait 1 minute (limits reset per minute)
- Use separate API key for dev vs production
- Check usage at [aistudio.google.com/usage](https://aistudio.google.com/usage)

### Build Failures

```bash
# Clean and rebuild
rm -rf node_modules
npm install
npm run bundle
```

## Agent-Specific Notes

### For Claude Agents

- Use `gemini-dev` for testing, not global `gemini`
- Run long sessions in tmux
- Always run `npm run preflight` before commits
- Check `CLAUDE.md` for full project documentation

### For Codex/Copilot

- TypeScript strict mode enabled
- Follow existing patterns in codebase
- Tests use Vitest framework
- Co-locate tests with source files

## Resources

- [CLAUDE.md](./CLAUDE.md) - Full project documentation
- [GEMINI.md](./GEMINI.md) - Build and test instructions
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
- [docs/](./docs/) - User documentation
