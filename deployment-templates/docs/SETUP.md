# Setup Guide: Unified Gemini CLI + Claude Automation

This guide walks you through setting up Gemini CLI + Claude automation across
all your GitHub repositories.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Configuration](#configuration)
4. [Deployment](#deployment)
5. [Verification](#verification)
6. [Customization](#customization)

## Prerequisites

### Required Tools

1. **GitHub CLI (`gh`)**

   ```bash
   # macOS
   brew install gh

   # Linux
   sudo apt install gh  # Ubuntu/Debian
   sudo dnf install gh  # Fedora

   # Windows
   winget install GitHub.cli
   ```

2. **Git**

   ```bash
   git --version  # Verify installation
   ```

3. **Bash** (Unix shell)
   - macOS/Linux: Pre-installed
   - Windows: Use Git Bash or WSL

### Required Credentials

1. **GitHub Personal Access Token**
   - Go to: https://github.com/settings/tokens/new
   - Select scopes:
     - ✅ `repo` (Full control of private repositories)
     - ✅ `workflow` (Update GitHub Action workflows)
     - ✅ `admin:org` (if deploying to organization repos)
   - Click "Generate token"
   - Save the token securely

2. **Gemini API Key**
   - Go to: https://aistudio.google.com/apikey
   - Click "Create API key"
   - Save the key securely

3. **Claude API Key** (Optional)
   - Go to: https://console.anthropic.com/
   - Create an API key
   - Save the key securely

## Initial Setup

### Step 1: Clone Gemini CLI Repository

```bash
git clone https://github.com/google-gemini/gemini-cli.git
cd gemini-cli/deployment-templates
```

### Step 2: Authenticate with GitHub

```bash
# Login to GitHub CLI
gh auth login

# Select:
# - GitHub.com
# - HTTPS
# - Yes (authenticate Git with your GitHub credentials)
# - Login with a web browser (or paste your token)
```

Verify authentication:

```bash
gh auth status
```

### Step 3: Set Environment Variables

Create a `.env` file or export variables:

```bash
# Required
export GITHUB_TOKEN="ghp_your_token_here"
export GEMINI_API_KEY="your_gemini_api_key_here"

# Optional
export CLAUDE_API_KEY="your_claude_api_key_here"

# Make these permanent by adding to ~/.bashrc or ~/.zshrc
echo 'export GITHUB_TOKEN="ghp_your_token_here"' >> ~/.bashrc
echo 'export GEMINI_API_KEY="your_gemini_api_key_here"' >> ~/.bashrc
source ~/.bashrc
```

## Configuration

### Customize GEMINI.md

Edit `config/GEMINI.md` to provide context for your projects:

```bash
cd deployment-templates/config
nano GEMINI.md  # or use your preferred editor
```

Update the following sections:

- Project Overview
- Architecture
- Code Standards
- Security Guidelines
- Common Patterns

### Customize Config.yaml

Edit `.gemini-config.yaml` for automation settings:

```bash
nano .gemini-config.yaml
```

Key settings to review:

```yaml
code_review:
  comment_severity_threshold: 'MEDIUM' # HIGH, MEDIUM, LOW
  max_review_comments: 25

issue_triage:
  enabled: true
  auto_label: true

ignore_patterns:
  - 'node_modules/**'
  - 'dist/**'
  # Add your patterns
```

### Customize Workflows

Choose which workflows to deploy:

- `gemini-issue-triage.yml` - Auto-triage issues
- `gemini-pr-review.yml` - Auto-review PRs
- `claude-gemini-unified.yml` - Unified AI assistance

To deploy specific workflows:

```bash
./scripts/deploy-to-all-repos.sh --workflows gemini-issue-triage,gemini-pr-review
```

## Deployment

### Option 1: Deploy to All Repositories

```bash
cd deployment-templates/scripts
./deploy-to-all-repos.sh
```

**Interactive prompts:**

1. Shows number of repositories found
2. Asks for confirmation
3. Displays progress for each repo
4. Shows summary of successes/failures

### Option 2: Deploy to Organization Repos

```bash
./deploy-to-all-repos.sh --org your-org-name
```

### Option 3: Deploy to Single Repository

```bash
./deploy-to-single-repo.sh owner/repo-name
```

### Option 4: Dry Run (Preview Changes)

```bash
./deploy-to-all-repos.sh --dry-run
```

This shows what would be deployed without making changes.

### Deployment Options

```bash
# Exclude specific repos
./deploy-to-all-repos.sh --exclude-repos "repo1,repo2,repo3"

# Deploy specific workflows only
./deploy-to-all-repos.sh --workflows "gemini-issue-triage,gemini-pr-review"

# Use custom config
./deploy-to-all-repos.sh --config /path/to/custom-config.yaml

# Update existing deployments
./deploy-to-all-repos.sh --update-only
```

## Verification

### Check Deployment Status

```bash
cd deployment-templates/scripts
./check-deployment-status.sh
```

Output example:

```
✓ owner/repo1 - Fully deployed
⚠ owner/repo2 - Partially deployed
✗ owner/repo3 - Not deployed

Summary:
Fully Deployed:     5
Partially Deployed: 2
Not Deployed:       1
```

### Detailed Status Check

```bash
./check-deployment-status.sh --detailed
```

Shows:

- ✓ GEMINI.md present
- ✓ config.yaml present
- ✓ 3 custom commands
- ✓ gemini-issue-triage.yml
- ✓ gemini-pr-review.yml
- ✓ GEMINI_API_KEY configured

### Manual Verification

For a specific repository:

1. **Check Files**

   ```bash
   gh repo view owner/repo --web
   # Navigate to:
   # - .gemini/GEMINI.md
   # - .gemini/config.yaml
   # - .gemini/commands/
   # - .github/workflows/
   ```

2. **Check Secrets**

   ```bash
   gh secret list -R owner/repo
   ```

   Should show:
   - `GEMINI_API_KEY`
   - `CLAUDE_API_KEY` (if configured)

3. **Check Workflows**

   ```bash
   gh workflow list -R owner/repo
   ```

   Should show Gemini workflows

4. **Test Automation**
   - Create a test issue
   - Check if it gets auto-triaged
   - Create a test PR
   - Check if it gets auto-reviewed

## Customization

### Add Custom Commands

Create new commands in your repository's `.gemini/commands/` directory:

```toml
# .gemini/commands/my-custom-command.toml
description = "My custom command"

prompt = """
Do something specific:
{{args}}
"""
```

Use it:

```
@gemini-cli /my-custom-command explain this code
```

### Modify Workflow Triggers

Edit `.github/workflows/gemini-*.yml`:

```yaml
on:
  issues:
    types: ['opened', 'reopened'] # Add or remove triggers
  pull_request:
    types: ['opened', 'synchronize']
```

### Adjust AI Behavior

Edit `.gemini/GEMINI.md` to add project-specific guidelines:

```markdown
## For Code Reviews

When reviewing code in this project, prioritize:

1. TypeScript type safety
2. React best practices
3. Performance optimizations
4. Test coverage
```

### Configure Notifications

Edit `.gemini/config.yaml`:

```yaml
notifications:
  welcome_new_contributors: true
  thank_on_merge: true
  stale_warning: true
  stale_days: 30
```

## Troubleshooting

### Permission Errors

**Error**: "Resource not accessible by integration"

**Solution**:

```bash
# Re-authenticate with correct permissions
gh auth login --scopes repo,workflow,admin:org
```

### Secrets Not Set

**Error**: "GEMINI_API_KEY not configured"

**Solution**:

```bash
# Set secret manually
echo "your-key" | gh secret set GEMINI_API_KEY -R owner/repo

# Or set for all repos
export GEMINI_API_KEY="your-key"
./deploy-to-all-repos.sh --update-only
```

### Workflow Not Running

**Check**:

1. Are workflows enabled in repository settings?

   ```bash
   gh repo view owner/repo --web
   # Go to Settings > Actions > General
   # Enable "Allow all actions and reusable workflows"
   ```

2. Are the workflow files valid?

   ```bash
   # Check workflow syntax
   gh workflow list -R owner/repo
   ```

3. Check workflow logs:
   ```bash
   gh run list -R owner/repo --workflow="gemini-issue-triage.yml"
   gh run view <run-id> --log
   ```

### Rate Limiting

Gemini API has rate limits:

- Free tier: 60 requests/min, 1,000 requests/day

**Solution**:

- Use Vertex AI for higher limits
- Stagger deployments across repos
- Use `--dry-run` to test first

## Next Steps

1. ✅ Verify deployment status
2. ✅ Test with a sample issue
3. ✅ Test with a sample PR
4. ✅ Customize GEMINI.md for each repo
5. ✅ Monitor workflow runs
6. ✅ Adjust settings based on feedback

## Support

- **Issues**:
  [GitHub Issues](https://github.com/google-gemini/gemini-cli/issues)
- **Docs**: [Gemini CLI Documentation](https://geminicli.com/docs/)
- **Troubleshooting**: [Troubleshooting Guide](./TROUBLESHOOTING.md)

## See Also

- [Usage Guide](./USAGE.md) - How to use Gemini CLI features
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues and solutions
