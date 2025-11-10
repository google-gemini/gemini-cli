# Troubleshooting Guide

Common issues and solutions for Gemini CLI + Claude automation.

## Table of Contents

- [Deployment Issues](#deployment-issues)
- [Workflow Issues](#workflow-issues)
- [Authentication Issues](#authentication-issues)
- [API Issues](#api-issues)
- [Performance Issues](#performance-issues)

## Deployment Issues

### Issue: "gh: command not found"

**Problem**: GitHub CLI is not installed

**Solution**:

```bash
# macOS
brew install gh

# Linux (Ubuntu/Debian)
sudo apt install gh

# Linux (Fedora)
sudo dnf install gh

# Windows
winget install GitHub.cli
```

### Issue: "Permission denied" when running deployment script

**Problem**: Script is not executable

**Solution**:

```bash
chmod +x deployment-templates/scripts/*.sh
```

### Issue: "Failed to clone repository"

**Problem**: No access to repository or wrong repository name

**Solutions**:

1. Check repository name format: `owner/repo-name`
2. Verify you have access:
   ```bash
   gh repo view owner/repo
   ```
3. Check authentication:
   ```bash
   gh auth status
   ```

### Issue: "Resource not accessible by integration"

**Problem**: Insufficient GitHub permissions

**Solution**:

```bash
# Re-authenticate with correct scopes
gh auth refresh -h github.com -s repo,workflow,admin:org
```

### Issue: Deployment succeeds but files not visible

**Problem**: Changes pushed to wrong branch

**Solution**:

```bash
# Check which branch deployment used
git log --oneline -1

# If needed, create PR to merge to main
gh pr create --base main --head deploy-gemini-cli
```

## Workflow Issues

### Issue: Workflows not running

**Possible Causes & Solutions**:

1. **Workflows disabled in repository**

   ```bash
   # Enable via web UI
   gh repo view owner/repo --web
   # Go to: Settings > Actions > General
   # Select: "Allow all actions and reusable workflows"
   ```

2. **Workflow file has syntax errors**

   ```bash
   # Validate workflow
   gh workflow list -R owner/repo

   # If no workflows shown, check syntax:
   cat .github/workflows/gemini-issue-triage.yml | yamllint -
   ```

3. **Trigger conditions not met**

   ```yaml
   # Check workflow triggers in .github/workflows/*.yml
   on:
     issues:
       types: ['opened', 'reopened'] # Only these events trigger
   ```

4. **Label missing for conditional workflows**
   ```bash
   # Some workflows only run with specific labels
   gh issue edit 123 --add-label "needs-triage"
   ```

### Issue: Workflow runs but does nothing

**Problem**: Conditional checks failing

**Solution**:

```bash
# Check workflow logs
gh run list -R owner/repo --workflow="gemini-issue-triage.yml"
gh run view <run-id> --log

# Look for:
# - "Skipped" status
# - Failed conditional checks
```

**Common conditionals**:

```yaml
if: |
  contains(github.event.issue.labels.*.name, 'needs-triage')
```

Make sure the label exists:

```bash
gh label create "needs-triage" -R owner/repo
```

### Issue: "Error: Could not parse JSON from Gemini output"

**Problem**: Gemini response format changed or malformed

**Solutions**:

1. Check Gemini API response in logs
2. Verify prompt asks for JSON format:
   ````
   Output in JSON format:
   ```json
   {
     "key": "value"
   }
   ````
   ```

   ```
3. Update workflow to handle different response formats

## Authentication Issues

### Issue: "GEMINI_API_KEY not found"

**Problem**: Secret not set in repository

**Solution**:

```bash
# Set secret
echo "your-key" | gh secret set GEMINI_API_KEY -R owner/repo

# Verify
gh secret list -R owner/repo
```

### Issue: "Invalid API key" from Gemini

**Problem**: API key is wrong or expired

**Solutions**:

1. Generate new key: https://aistudio.google.com/apikey
2. Update secret:
   ```bash
   echo "new-key" | gh secret set GEMINI_API_KEY -R owner/repo
   ```
3. Verify key works:
   ```bash
   curl -H "Content-Type: application/json" \
        -d '{"contents":[{"parts":[{"text":"Say hello"}]}]}' \
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=YOUR_KEY"
   ```

### Issue: "Authentication required" when accessing private repos

**Problem**: GitHub token lacks permissions

**Solution**:

```bash
# Check current authentication
gh auth status

# Refresh with correct scopes
gh auth login --scopes repo,workflow,admin:org
```

## API Issues

### Issue: "429 Too Many Requests" from Gemini API

**Problem**: Rate limit exceeded

**Solutions**:

1. **Reduce frequency**:

   ```yaml
   # In .github/workflows/gemini-scheduled-*.yml
   on:
     schedule:
       - cron: '0 */2 * * *' # Change from hourly to every 2 hours
   ```

2. **Use Vertex AI** (higher limits):

   ```yaml
   # In workflow
   with:
     use_vertex_ai: true
     gcp_project_id: ${{ vars.GOOGLE_CLOUD_PROJECT }}
   ```

3. **Upgrade Gemini API plan**:
   - Go to: https://aistudio.google.com/
   - Upgrade to paid tier

### Issue: Slow response from Gemini

**Problem**: Large codebase or complex query

**Solutions**:

1. **Reduce context**:

   ```yaml
   # In .gemini/config.yaml
   ignore_patterns:
     - 'node_modules/**'
     - 'dist/**'
     - '**/*.min.js'
   ```

2. **Use streaming** (faster perceived response):

   ```yaml
   settings: |
     {
       "outputFormat": "stream-json"
     }
   ```

3. **Break into smaller queries**:
   ```
   @gemini-cli review only src/auth/
   ```

### Issue: "Model overloaded" errors

**Problem**: Gemini service temporarily unavailable

**Solutions**:

1. **Add retry logic** (already in workflows):

   ```yaml
   - name: Retry on failure
     if: failure()
     uses: nick-invision/retry@v2
     with:
       timeout_minutes: 10
       max_attempts: 3
       command: # your command
   ```

2. **Use fallback model**:
   ```yaml
   with:
     model: 'gemini-2.5-flash' # Faster, more available
   ```

## Performance Issues

### Issue: Workflows taking too long

**Problem**: Analyzing too much code

**Solutions**:

1. **Limit files analyzed**:

   ```yaml
   review_file_types:
     - '*.ts'
     - '*.tsx'
     # Remove large file types
   ```

2. **Reduce max session turns**:

   ```yaml
   settings: |
     {
       "maxSessionTurns": 10  # Reduce from default 25
     }
   ```

3. **Use faster model**:
   ```yaml
   with:
     model: 'gemini-2.5-flash'
   ```

### Issue: Bot posting too many comments

**Problem**: Threshold too low

**Solution**:

```yaml
# In .gemini/config.yaml
code_review:
  comment_severity_threshold: 'HIGH' # Only critical issues
  max_review_comments: 10 # Limit total comments
```

### Issue: Bot missing important issues

**Problem**: Threshold too high

**Solution**:

```yaml
code_review:
  comment_severity_threshold: 'LOW' # Show all issues
  max_review_comments: 50 # Allow more comments
```

## Advanced Troubleshooting

### Enable Debug Logging

In workflow files:

```yaml
- name: Run Gemini with debug
  env:
    ACTIONS_STEP_DEBUG: true
  uses: google-github-actions/run-gemini-cli@v0
  with:
    # ... your config
```

View debug logs:

```bash
gh run view <run-id> --log
```

### Test Workflow Locally

Use `act` to test GitHub Actions locally:

```bash
# Install act
brew install act  # macOS
# or download from https://github.com/nektos/act

# Run workflow
act -j triage-issue -s GEMINI_API_KEY="your-key"
```

### Check Gemini CLI Version

```bash
# In workflow logs, look for version:
# Using @google/gemini-cli version: 0.12.0

# Update to latest:
gh workflow run .github/workflows/gemini-issue-triage.yml
```

### Rollback Deployment

If something goes wrong:

```bash
cd deployment-templates/scripts
./deploy-to-all-repos.sh --rollback
```

This removes all Gemini CLI files from repositories.

### Manual Cleanup

```bash
# Remove from single repo
gh api -X DELETE "repos/owner/repo/contents/.gemini/GEMINI.md" \
  -f message="Remove Gemini CLI" \
  -f sha="$(gh api repos/owner/repo/contents/.gemini/GEMINI.md -q .sha)"

# Remove workflows
gh api -X DELETE "repos/owner/repo/contents/.github/workflows/gemini-issue-triage.yml" \
  -f message="Remove workflow" \
  -f sha="$(gh api repos/owner/repo/contents/.github/workflows/gemini-issue-triage.yml -q .sha)"
```

## Getting Help

### Check Logs

1. **Workflow logs**:

   ```bash
   gh run list -R owner/repo --limit 5
   gh run view <run-id> --log
   ```

2. **API logs** (if using Vertex AI):
   - Go to Google Cloud Console
   - Navigate to Cloud Logging
   - Filter by "genai"

### Report Issues

Include this information:

```
**Environment**:
- OS: [e.g., macOS 14.0]
- GitHub CLI version: [gh --version]
- Repository: [owner/repo]

**What you did**:
[Steps to reproduce]

**What happened**:
[Actual behavior]

**What you expected**:
[Expected behavior]

**Logs**:
```

[Paste relevant logs]

````

**Configuration**:
```yaml
[Paste .gemini/config.yaml]
````

````

Submit to:
- [Gemini CLI Issues](https://github.com/google-gemini/gemini-cli/issues)
- [Deployment Scripts Issues](https://github.com/your-repo/issues)

### Community Support

- **Discussions**: [GitHub Discussions](https://github.com/google-gemini/gemini-cli/discussions)
- **Documentation**: [Gemini CLI Docs](https://geminicli.com/docs/)

## Prevention

### Regular Maintenance

1. **Update monthly**:
   ```bash
   cd deployment-templates
   git pull origin main
   ./scripts/deploy-to-all-repos.sh --update-only
````

2. **Monitor quotas**:
   - Check Gemini API usage
   - Monitor GitHub Actions minutes

3. **Review logs**:
   ```bash
   # Check for errors
   gh run list --status failure
   ```

### Best Practices

1. ✅ **Test in one repo first**
2. ✅ **Use --dry-run before mass deployment**
3. ✅ **Keep API keys secure**
4. ✅ **Monitor rate limits**
5. ✅ **Review bot comments for quality**
6. ✅ **Adjust thresholds based on feedback**
7. ✅ **Update workflows regularly**
8. ✅ **Back up configuration files**

## See Also

- [Setup Guide](./SETUP.md)
- [Usage Guide](./USAGE.md)
- [Gemini CLI Documentation](https://geminicli.com/docs/)
