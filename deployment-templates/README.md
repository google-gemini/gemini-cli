# Unified Gemini CLI + Claude Deployment for All Repositories

This directory contains templates and scripts for deploying Gemini CLI
automation (integrated with Claude Code) across all your GitHub repositories.

## 🎯 What This Does

Automatically sets up on **every repository**:

- 🤖 **Automated Issue Triage** - Gemini CLI analyzes and labels new issues
- 📝 **Automated PR Review** - Gemini CLI reviews pull requests with intelligent
  feedback
- 🔄 **On-Demand Assistance** - Mention `@gemini-cli` in issues/PRs for help
- 🚀 **Claude Code Integration** - Seamless collaboration between Gemini and
  Claude
- 📊 **Code Quality Checks** - Automated security, performance, and best
  practice reviews

## 📁 Directory Structure

```
deployment-templates/
├── README.md                          # This file
├── workflows/                         # GitHub Actions workflows
│   ├── gemini-issue-triage.yml       # Auto-triage issues
│   ├── gemini-pr-review.yml          # Auto-review PRs
│   ├── gemini-on-demand.yml          # @gemini-cli mentions
│   └── claude-gemini-unified.yml     # Combined Gemini+Claude workflow
├── config/                            # Configuration files
│   ├── GEMINI.md                     # Universal context file
│   ├── .gemini-config.yaml           # Gemini settings
│   └── commands/                     # Custom slash commands
│       ├── code-review.toml
│       ├── debug-issue.toml
│       └── summarize-pr.toml
├── scripts/                           # Deployment scripts
│   ├── deploy-to-all-repos.sh        # Main deployment script
│   ├── deploy-to-single-repo.sh      # Deploy to one repo
│   └── check-deployment-status.sh    # Verify deployments
└── docs/                              # Documentation
    ├── SETUP.md                      # Setup instructions
    ├── USAGE.md                      # Usage guide
    └── TROUBLESHOOTING.md            # Common issues

```

## 🚀 Quick Start

### Prerequisites

1. **GitHub Personal Access Token** with permissions:
   - `repo` (full control)
   - `workflow` (update workflows)
   - `admin:org` (if deploying to org repos)

2. **Gemini API Key** from
   [Google AI Studio](https://aistudio.google.com/apikey)

3. **GitHub CLI** installed: `brew install gh` or `apt install gh`

### Step 1: Configure Your Credentials

```bash
# Set GitHub token
export GITHUB_TOKEN="your_github_token_here"

# Set Gemini API key (will be added as secret to all repos)
export GEMINI_API_KEY="your_gemini_api_key_here"

# Optional: Claude Code integration
export CLAUDE_API_KEY="your_claude_api_key_here"
```

### Step 2: Deploy to All Repositories

```bash
# Deploy to ALL your repositories
cd deployment-templates/scripts
chmod +x deploy-to-all-repos.sh
./deploy-to-all-repos.sh

# Or deploy to specific organization
./deploy-to-all-repos.sh --org your-org-name

# Or deploy to a single repo
./deploy-to-single-repo.sh owner/repo-name
```

### Step 3: Verify Deployment

```bash
# Check deployment status
./check-deployment-status.sh

# This will show:
# ✅ Workflows deployed
# ✅ Secrets configured
# ✅ GEMINI.md present
# ❌ Missing configuration (if any)
```

## 🔧 Configuration Options

### Customize Per Repository

Each repository can customize Gemini CLI behavior by editing
`.gemini/config.yaml`:

```yaml
# Auto-triage settings
issue_triage:
  enabled: true
  auto_label: true
  priority_detection: true

# PR review settings
pr_review:
  enabled: true
  comment_severity_threshold: 'MEDIUM' # HIGH, MEDIUM, LOW
  auto_approve_minor: false
  require_tests: true

# Claude integration
claude_integration:
  enabled: true
  collaborative_mode: true
  model: 'claude-sonnet-4-5'

# Custom behavior
custom_instructions: |
  For this repository:
  - Focus on TypeScript best practices
  - Check for React anti-patterns
  - Enforce functional programming style
```

## 🎨 Customization

### Add Custom Slash Commands

Place `.toml` files in `.gemini/commands/`:

```toml
# .gemini/commands/my-command.toml
description = "Custom command for my workflow"

prompt = """
Do something specific to my repository:
{{args}}
"""
```

### Modify GEMINI.md Context

Edit `.gemini/GEMINI.md` to provide repository-specific context:

```markdown
# My Project Context

## Architecture

- Backend: Node.js + Express
- Frontend: React + TypeScript
- Database: PostgreSQL

## Code Standards

- Use functional components
- Prefer composition over inheritance
- Write unit tests for all features

## Common Tasks

- Run tests: `npm test`
- Build: `npm run build`
- Deploy: `npm run deploy`
```

## 🔐 Security

All sensitive credentials are stored as GitHub Secrets:

- `GEMINI_API_KEY` - Gemini API key
- `CLAUDE_API_KEY` - Claude API key (optional)
- `APP_ID` & `PRIVATE_KEY` - GitHub App credentials (optional, for advanced
  features)

Secrets are automatically added during deployment and never exposed in logs.

## 📊 Features

### Automated Issue Triage

- Analyzes issue title and body
- Applies labels: `area/*`, `kind/*`, `priority/*`
- Detects missing information
- Suggests related issues

### Automated PR Review

- Reviews code changes
- Checks for security issues
- Validates test coverage
- Suggests improvements
- Syncs labels with linked issue

### On-Demand Assistance

Comment `@gemini-cli <your-question>` in any issue or PR:

- `@gemini-cli explain this code`
- `@gemini-cli suggest a fix`
- `@gemini-cli review the changes`

### Claude Integration

When Claude Code is enabled:

- Gemini handles analysis and planning
- Claude executes code changes
- Collaborative problem-solving
- Best of both AI systems

## 🛠️ Advanced Usage

### Deploy with Custom Settings

```bash
# Deploy with custom config
./deploy-to-all-repos.sh \
  --config custom-config.yaml \
  --workflows issue-triage,pr-review \
  --exclude-repos repo1,repo2
```

### Rollback Deployment

```bash
# Remove Gemini CLI from all repos
./deploy-to-all-repos.sh --rollback
```

### Update Existing Deployments

```bash
# Update workflows without changing config
./deploy-to-all-repos.sh --update-only
```

## 📚 Learn More

- [Setup Guide](docs/SETUP.md) - Detailed setup instructions
- [Usage Guide](docs/USAGE.md) - How to use Gemini CLI in your repos
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Common issues and solutions
- [Gemini CLI Docs](https://geminicli.com/docs/) - Official documentation

## 🤝 Support

Issues with deployment?
[Open an issue](https://github.com/google-gemini/gemini-cli/issues) or check our
[troubleshooting guide](docs/TROUBLESHOOTING.md).

## 📝 License

Apache 2.0 - Same as Gemini CLI
