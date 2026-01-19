# Gemini CLI - TROZLAN Fork (Staging Repository)

## Overview

This is TROZLAN's fork of Google's official Gemini CLI, serving as the
**staging/development repository** that syncs with Google's upstream.

- **Original Repository**:
  [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli)
- **TROZLAN Fork**:
  [MegaPhoenix92/gemini-cli](https://github.com/MegaPhoenix92/gemini-cli)
- **Local Path**: `/Users/chrisozsvath/Projects/TROZLAN/TROZLANIO/gemini-cli`

---

## CRITICAL: Relationship with Phoenix CLI

```
Google Upstream                 This Repo (Staging)           Phoenix CLI (Product)
google-gemini/gemini-cli  →  gemini-cli  →  phoenix_cli
        │                         │                 │
   Auto-sync                  Test here          TROZLAN's
   (daily 6am UTC)           (gemini-dev)        branded product
```

### This Repository's Role

| Aspect              | This Repo (gemini-cli)          | Phoenix CLI               |
| ------------------- | ------------------------------- | ------------------------- |
| **Purpose**         | Sync with Google, test features | TROZLAN branded product   |
| **Custom Features** | **NONE - Keep clean!**          | All custom features here  |
| **Command**         | `gemini-dev`                    | `phoenix`                 |
| **GitHub**          | MegaPhoenix92/gemini-cli        | MegaPhoenix92/phoenix-cli |
| **Local Path**      | `TROZLANIO/gemini-cli`          | `TROZLANIO/phoenix_cli`   |

### IMPORTANT Rules

1. **DO NOT add custom features to this repo** - Keep it clean for upstream sync
2. **DO NOT add TROZLAN-specific code here** - That belongs in phoenix_cli
3. **This repo auto-syncs with Google** - Any custom code will cause merge
   conflicts
4. **Cherry-pick TO phoenix_cli** - Never merge phoenix_cli back here

### When to Use Each Repo

| Task                            | Use This Repo | Use Phoenix CLI |
| ------------------------------- | ------------- | --------------- |
| Test Google's latest features   | ✅            |                 |
| Develop custom TROZLAN features |               | ✅              |
| Add model selector              |               | ✅              |
| Add MCP integrations            |               | ✅              |
| Debug upstream issues           | ✅            |                 |
| Prototype before cherry-pick    | ✅            |                 |

---

## Quick Start

### Running Local Development Version

```bash
# Option 1: Use the alias (recommended)
gemini-dev

# Option 2: Direct execution
node /Users/chrisozsvath/Projects/TROZLAN/TROZLANIO/gemini-cli/bundle/gemini.js

# Option 3: Run in tmux for persistent session
tmux new-session -d -s gemini-dev "GEMINI_API_KEY=YOUR_DEV_KEY node bundle/gemini.js"
tmux attach -t gemini-dev
```

## Agent Coordination

If multiple code agents (Claude/Codex/Gemini/etc) are working in this repo at
the same time, AgentCoord prevents clobbering by coordinating via
`.agent-state/` (gitignored). If you're solo, skip it.

Quick start:

```bash
export AGENT_ID=claude
npm run agent:heartbeat
npm run agent:inbox
npm run agent:who
npm run agent:tasks
```

Docs: `docs/AGENT_COORDINATION.md`

## Current Configuration

### gemini-dev Status

| Property        | Value                                 |
| --------------- | ------------------------------------- |
| **Version**     | `0.26.0-nightly.20260115.6cb3ae4e0`   |
| **Model**       | `gemini-3-flash-preview` (Auto)       |
| **API Key**     | `...BwM` (separate quota from global) |
| **MCP Servers** | 1 connected                           |
| **Skills**      | 1 loaded                              |
| **Sandbox**     | Disabled                              |

### API Key Setup

Two separate API keys for isolated rate limits:

| Command              | Key       | Purpose             | Quota  |
| -------------------- | --------- | ------------------- | ------ |
| `gemini` (global)    | `...2StM` | Stable CLI usage    | Tier 1 |
| `gemini-dev` (local) | `...BwM`  | Development/testing | Tier 1 |

Both keys are from Google AI Studio, associated with `trozlanio-firebase`
project.

### Alias Configuration

Located in `~/.zshrc`:

```bash
# Gemini CLI local dev version
alias gemini-dev="GEMINI_API_KEY=AIzaSyAwp6Wm_MLfmzxonF2ZZI5SIuGrQ0B_BwM node /Users/chrisozsvath/Projects/TROZLAN/TROZLANIO/gemini-cli/bundle/gemini.js"
```

## Development Workflow

### Syncing with Upstream

```bash
cd /Users/chrisozsvath/Projects/TROZLAN/TROZLANIO/gemini-cli

# Fetch latest from Google's repo
git fetch upstream

# Merge changes
git merge upstream/main

# Push to fork
git push origin main

# Rebuild
npm run bundle
```

### Building After Changes

```bash
# Full rebuild
npm run bundle

# Or with all checks
npm run preflight
```

### Running Tests

```bash
# All tests
npm test

# Specific workspace
npm test -w @google/gemini-cli-core -- src/path/to/test.test.ts
```

## Project Structure

```
gemini-cli/
├── packages/
│   ├── cli/                 # Main CLI application
│   ├── core/                # Core library (@google/gemini-cli-core)
│   ├── a2a-server/          # Agent-to-agent server
│   ├── test-utils/          # Testing utilities
│   └── vscode-ide-companion/ # VS Code extension
├── docs/                    # Documentation
├── integration-tests/       # Integration test suite
├── bundle/                  # Built output
│   └── gemini.js           # Main executable
├── GEMINI.md               # Build & test instructions
└── CONTRIBUTING.md         # Contribution guidelines
```

## tmux Session Management

### Start Interactive Session

```bash
# Start gemini-dev in background
tmux new-session -d -s gemini-dev "gemini-dev"

# Attach to session
tmux attach -t gemini-dev
```

### tmux Controls

| Key                               | Action                 |
| --------------------------------- | ---------------------- |
| `Ctrl+B` then `D`                 | Detach (keeps running) |
| `Ctrl+C`                          | Exit gemini-dev        |
| `tmux ls`                         | List sessions          |
| `tmux kill-session -t gemini-dev` | Stop session           |

### Monitor Output

```bash
# Capture recent output
tmux capture-pane -t gemini-dev -p | tail -30

# Check if running
tmux ls
```

## Known Issues

### MCP Server Warnings

The `networks` MCP server may show schema validation errors:

```
Error discovering tools from networks: tools[57].inputSchema - Invalid input: expected object
```

This is a configuration issue with the networks server, not gemini-cli. The CLI
functions normally despite these warnings.

## Authentication Methods

### Option 1: Google AI Studio API Key (Current)

```bash
export GEMINI_API_KEY="your-api-key"
gemini-dev
```

### Option 2: Vertex AI

```bash
export GOOGLE_CLOUD_PROJECT="trozlanio-firebase"
export GOOGLE_CLOUD_LOCATION="us-central1"
gcloud auth application-default login
gemini-dev
# Select "Vertex AI" when prompted
```

### Option 3: Google Login

```bash
gemini-dev
# Select "Login with Google" - opens browser
```

## Resources

- [Authentication Docs](docs/get-started/authentication.md)
- [Local Development](docs/local-development.md)
- [Contributing Guide](CONTRIBUTING.md)
- [API Quickstart](https://ai.google.dev/gemini-api/docs/quickstart)
- [Google AI Studio](https://aistudio.google.com/apikey)

## Agent Instructions

When working on this project:

1. **Always use `gemini-dev`** for testing local changes
2. **Sync with upstream** before starting new features
3. **Run `npm run preflight`** before committing
4. **Use tmux** for long-running interactive sessions
5. **Check MCP server status** if tools aren't working

### For Claude Agents

```bash
# Verify gemini-dev is working
gemini-dev --version

# Test with a prompt
gemini-dev -p "Hello, confirm you are running"

# Start interactive session
tmux new-session -d -s gemini-dev "gemini-dev"
tmux attach -t gemini-dev
```

## 🔄 Mandatory PR Review Process with @codex and Copilot

### Every Commit Must Be Reviewed

**ALL code changes must go through review by @codex and GitHub Copilot before
merging.**

### Complete PR Workflow

#### Step 1: Create Feature Branch

```bash
# Create and switch to feature branch
git checkout -b feat/your-feature-name

# Make your changes...
```

#### Step 2: Run Tests and Verify

```bash
# Run all checks before committing
npm run preflight

# Or run tests individually
npm test
npm run typecheck
npm run lint
```

#### Step 3: Stage and Commit

```bash
# Stage changes
git add .

# Commit with conventional commit format and co-author
git commit -m "$(cat <<'EOF'
feat: your feature description

Detailed description of changes.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

#### Step 4: Push and Create PR

```bash
# Push branch with upstream tracking
git push -u origin feat/your-feature-name

# Create PR using gh CLI
gh pr create --title "feat: your feature" --body "$(cat <<'EOF'
## Summary
- Description of changes

## Test plan
- [x] All tests pass (`npm run preflight`)
- [x] Manual verification done

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

#### Step 5: Open PR in Chrome DevTools and Add Reviewers

```bash
# Get PR URL and open in browser
gh pr view --web

# Or get PR number for manual operations
PR_NUM=$(gh pr view --json number -q '.number')
echo "PR #$PR_NUM created"
```

**In Chrome DevTools (use MCP chrome-devtools tools):**

1. Navigate to the PR page using `mcp__chrome-devtools__navigate_page`
2. Take snapshot to find reviewer elements:
   `mcp__chrome-devtools__take_snapshot`
3. Click "Reviewers" gear icon to add reviewers
4. Add **@codex** and **GitHub Copilot** as reviewers

**Or via gh CLI:**

```bash
# Request @codex review via comment
gh pr comment $PR_NUM --body "@codex please review this PR for code quality, security, and best practices."

# Request Copilot review (if available via API)
gh api repos/MegaPhoenix92/gemini-cli/pulls/$PR_NUM/requested_reviewers \
  -f "reviewers[]=copilot" 2>/dev/null || echo "Add Copilot via GitHub UI"
```

#### Step 6: Monitor Review Status

```bash
# Check PR status and reviews
gh pr status
gh pr checks

# View review comments
gh pr view $PR_NUM --comments

# Or via API for detailed review info
gh api repos/MegaPhoenix92/gemini-cli/pulls/$PR_NUM/reviews \
  --jq '.[] | {user: .user.login, state: .state, body: .body}'
```

#### Step 7: Apply Fixes from Review Feedback

When @codex or Copilot finds issues:

```bash
# Option 1: Ask @codex to fix automatically
gh pr comment $PR_NUM --body "@codex please address that feedback"

# Option 2: Fix manually
# Make fixes based on review comments...
git add .
git commit -m "$(cat <<'EOF'
fix: address review feedback

- Fixed issue X noted by @codex
- Applied suggestion Y from Copilot

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
git push

# Request re-review after fixes
gh pr comment $PR_NUM --body "@codex please re-review"
```

#### Step 8: Merge After Approval

```bash
# Verify all checks pass
gh pr checks --watch

# Merge with squash (recommended)
gh pr merge --squash --delete-branch

# Or merge with merge commit
gh pr merge --merge --delete-branch
```

### @codex Review Response Guide

| Response                                   | Badge     | Meaning          | Action Required           |
| ------------------------------------------ | --------- | ---------------- | ------------------------- |
| "Didn't find any major issues. Nice work!" | ✅        | All good         | Proceed to merge          |
| P1 Badge                                   | 🔴 Red    | Critical issue   | **Must fix** before merge |
| P2 Badge                                   | 🟡 Yellow | Important issue  | Should fix before merge   |
| P3 Badge                                   | 🔵 Blue   | Minor suggestion | Nice to have              |

### Using Chrome DevTools MCP for PR Review

The Chrome DevTools MCP server enables interactive PR management:

```bash
# 1. Open PR in Chrome
gh pr view --web

# 2. Use MCP tools to interact with GitHub UI
# Take snapshot to see page elements
mcp__chrome-devtools__take_snapshot

# 3. Click on elements to add reviewers, approve, etc.
mcp__chrome-devtools__click --uid "reviewer-button-uid"

# 4. Fill in review comment
mcp__chrome-devtools__fill --uid "comment-textarea-uid" --value "LGTM!"
```

### Pre-PR Checklist

Before creating a PR, verify:

- [ ] All tests pass locally (`npm run preflight`)
- [ ] No TypeScript/ESLint errors
- [ ] Code follows project conventions (see CONTRIBUTING.md)
- [ ] No sensitive data (API keys, passwords) committed
- [ ] Commit messages follow
      [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] PR description includes summary and test plan
- [ ] Changes are rebased on latest main (if needed)

### Quick Reference Commands

```bash
# Full PR workflow in one go
git checkout -b feat/my-feature
# ... make changes ...
npm run preflight
git add . && git commit -m "feat: description

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
git push -u origin feat/my-feature
gh pr create --title "feat: description" --body "Summary and test plan"
gh pr view --web  # Opens in Chrome for reviewer assignment
```
