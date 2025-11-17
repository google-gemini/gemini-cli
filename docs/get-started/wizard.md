# Quick Start Wizard

The Quick Start Wizard helps you set up Gemini CLI quickly and easily. It guides you through authentication, workspace configuration, and personalization in just a few minutes.

## Overview

The wizard provides an interactive setup experience for first-time users, covering:

- **Authentication** - Choose and configure your preferred auth method
- **Workspace Setup** - Select your working directory
- **Permissions** - Configure file access and trust levels
- **Personalization** - Customize your experience
- **First Task** - Try a simple example to verify setup

## When Does the Wizard Run?

The wizard automatically launches when:
- You first install Gemini CLI
- No existing configuration is found

You can also manually start the wizard anytime with `/wizard start`.

## Wizard Steps

### 1. Welcome

A brief introduction to Gemini CLI and what to expect from the wizard.

**Duration:** < 1 minute

### 2. Authentication Method

Choose how you want to authenticate with Gemini:

- **OAuth** - Authenticate with your Google account (recommended)
- **API Key** - Use a Gemini API key from AI Studio
- **Vertex AI** - Use Vertex AI credentials for enterprise
- **Skip** - Configure authentication later

**Duration:** 1-2 minutes

### 3. Authentication Setup

Configure your selected authentication method:

#### OAuth Setup
1. Browser opens automatically
2. Sign in with your Google account
3. Grant permissions
4. Return to CLI

#### API Key Setup
1. Visit [AI Studio](https://aistudio.google.com/app/apikey)
2. Create or copy your API key
3. Paste into the CLI prompt

#### Vertex AI Setup
1. Enter your GCP project ID
2. Configure service account credentials
3. Verify access

**Duration:** 2-5 minutes

### 4. Workspace Setup

Select your working directory where Gemini CLI will operate:

- Current directory (default)
- Home directory
- Custom path

**Skippable:** Yes

**Duration:** 1 minute

### 5. Permissions

Configure file access and trust levels:

- **Low** - Restricted access, prompts for each operation
- **Medium** - Balanced security and convenience (recommended)
- **High** - Full access within workspace

**Skippable:** Yes

**Duration:** 1 minute

### 6. Personalization

Tell us how you plan to use Gemini CLI:

- Software development
- Data analysis
- Content creation
- Learning/Education
- Other

This helps customize recommendations and defaults.

**Skippable:** Yes

**Duration:** 1 minute

### 7. First Task

Try a simple example to verify everything works:

```
What is the capital of France?
```

Or choose from example prompts:
- Explain a code file
- Summarize a document
- Generate code

**Skippable:** Yes

**Duration:** 1-2 minutes

### 8. Completion

Setup complete! You're ready to use Gemini CLI.

Next steps:
- Try `/examples` to see what you can do
- Run `/onboarding` to continue learning
- Type `/help` for available commands

## CLI Commands

### `/wizard start`

Launch or restart the Quick Start Wizard.

```bash
/wizard start
```

**When to use:**
- First-time setup
- Reconfigure authentication
- Reset configuration

### `/wizard status`

View current wizard progress and next step.

```bash
/wizard status
```

**Output:**
```
Quick Start Wizard Progress: 60%

Current Step: Workspace Setup (4/10)
Select your working directory

Commands:
  /wizard start - Continue wizard
  /wizard reset - Start over
```

### `/wizard reset`

Reset the wizard to start from the beginning.

```bash
/wizard reset
```

**Warning:** This clears wizard progress but preserves your existing configuration.

### `/wizard skip`

Skip the current step (only if skippable).

```bash
/wizard skip
```

Some steps cannot be skipped:
- Welcome
- Authentication Method
- Authentication Setup
- Completion

## Navigation

During the wizard:

- **Next Step** - Complete current step to advance
- **Previous Step** - Use `/wizard back` (if available)
- **Skip** - Use `/wizard skip` for optional steps
- **Quit** - Type `exit` or press Ctrl+C (progress saved)

## Tips

### For First-Time Users

1. **Choose OAuth** - Easiest authentication method
2. **Use Medium Trust** - Good balance of security and convenience
3. **Try the First Task** - Verifies everything works
4. **Check Onboarding** - Run `/onboarding` after wizard completes

### For Advanced Users

1. **API Key** - Better for automation and scripts
2. **High Trust Level** - Fewer prompts if you trust your workspace
3. **Skip Optional Steps** - Speed through wizard if experienced
4. **Custom Configuration** - Edit `~/.gemini-cli/config.json` directly

### For Enterprise Users

1. **Choose Vertex AI** - Enterprise features and security
2. **Configure Project ID** - Use your organization's GCP project
3. **Service Account** - Use service account for automation
4. **Review Policies** - Check with IT before setting permissions

## Troubleshooting

### Wizard Won't Start

**Problem:** `/wizard start` does nothing

**Solutions:**
1. Check if wizard is already running
2. Verify installation: `gemini --version`
3. Try `/wizard reset`

### Authentication Fails

**Problem:** OAuth or API key doesn't work

**Solutions:**
1. **OAuth:** Check browser opened correctly
2. **API Key:** Verify key is valid at [AI Studio](https://aistudio.google.com/app/apikey)
3. **Vertex AI:** Verify project ID and credentials
4. See [Authentication Guide](./authentication.md) for detailed help

### Browser Doesn't Open (OAuth)

**Problem:** OAuth flow doesn't launch browser

**Solutions:**
1. Copy the URL manually and paste in browser
2. Check firewall/security settings
3. Try API key authentication instead

### Wizard Stuck

**Problem:** Can't advance to next step

**Solutions:**
1. Complete required fields
2. Check for error messages
3. Try `/wizard reset` to restart
4. Skip optional steps with `/wizard skip`

## Configuration Files

The wizard creates/modifies these files:

### `~/.gemini-cli/config.json`
Main configuration file with your preferences.

### `~/.gemini-cli/wizard-state.json`
Wizard progress and state (internal).

### `~/.gemini-cli/auth.json` or `~/.gemini-cli/.gemini-auth`
Authentication credentials (never shared).

## Privacy and Security

### What the Wizard Collects

- Authentication method choice
- Workspace directory path
- Permission level
- Use case (optional)

### What the Wizard Does NOT Collect

- Your actual credentials (stored locally only)
- File contents
- Conversation history
- Personal information

### Security Best Practices

1. **Never Share Credentials** - API keys and tokens are private
2. **Use OAuth** - Most secure authentication method
3. **Review Permissions** - Understand what you're granting
4. **Backup Config** - Save `~/.gemini-cli/` directory

## After the Wizard

### Immediate Next Steps

1. **Run `/onboarding`** - Continue learning with guided tasks
2. **Try `/examples`** - Explore what Gemini CLI can do
3. **Read `/help`** - Learn available commands

### Recommended Learning Path

1. Complete the onboarding checklist (20 tasks)
2. Try the example library
3. Explore file references with `@` syntax
4. Save custom commands
5. Set up advanced features

### Customization

After wizard completes, customize further:

- **Settings:** Run `/settings` or edit config file
- **Theme:** Run `/theme` to change colors
- **Editor:** Run `/editor` to configure default editor
- **Model:** Run `/model` to select AI model

## Getting Help

### Resources

- **Documentation:** [docs.gemini-cli.dev](https://docs.gemini-cli.dev)
- **Examples:** `/examples` command
- **Help:** `/help` command
- **FAQ:** [FAQ](../faq.md)

### Support

- **Community:** [GitHub Discussions](https://github.com/google/gemini-cli/discussions)
- **Issues:** [Report Bugs](https://github.com/google/gemini-cli/issues)
- **Questions:** Type your question in the CLI!

## Examples

### Complete Setup in 5 Minutes

```bash
# Launch wizard
/wizard start

# Follow prompts:
# 1. Welcome - Press Enter
# 2. Auth Method - Choose "OAuth"
# 3. OAuth Setup - Sign in via browser
# 4. Workspace - Use current directory
# 5. Permissions - Select "Medium"
# 6. Personalization - Skip with /wizard skip
# 7. First Task - Try example prompt
# 8. Completion - Done!
```

### Quick Setup with API Key

```bash
# Launch wizard
/wizard start

# Follow prompts:
# 1. Welcome - Press Enter
# 2. Auth Method - Choose "API Key"
# 3. API Key Setup - Paste your key
# 4. Skip remaining steps
/wizard skip
/wizard skip
/wizard skip
/wizard skip
```

### Check Progress Later

```bash
# Start wizard
/wizard start

# Exit wizard (Ctrl+C)
# ... do something else ...

# Check status
/wizard status

# Continue where you left off
/wizard start
```

## Related

- [Authentication Guide](./authentication.md) - Detailed auth setup
- [Configuration Guide](./configuration.md) - Advanced configuration
- [Onboarding Dashboard](../features/onboarding.md) - Continue learning
- [Example Library](./examples.md) - Explore examples
