# Usage Guide: Gemini CLI + Claude Automation

Learn how to use Gemini CLI automation features across your repositories.

## Quick Reference

| Feature         | Trigger               | Example                               |
| --------------- | --------------------- | ------------------------------------- |
| Issue Triage    | Open/reopen issue     | Automatic                             |
| PR Review       | Open/update PR        | Automatic                             |
| On-Demand Help  | Comment `@gemini-cli` | `@gemini-cli explain this code`       |
| Custom Commands | Comment `/command`    | `@gemini-cli /code-review`            |
| Unified AI      | Comment `@both`       | `@both implement user authentication` |

## Automated Features

### 1. Automated Issue Triage

**When it triggers**: Automatically when you open or reopen an issue

**What it does**:

- Analyzes issue title and body
- Applies relevant labels (`area/*`, `kind/*`, `priority/*`)
- Detects missing information
- Requests additional details if needed

**Example**:

```markdown
# Issue Title: App crashes when clicking login button

## Description

When I click the login button, the app crashes immediately.

## Steps to Reproduce

1. Open the app
2. Navigate to login screen
3. Enter credentials
4. Click "Login"
5. App crashes

## Expected

User should be logged in

## Actual

App crashes with no error message
```

**Bot Response**:

- Applies labels: `kind/bug`, `area/authentication`, `priority/high`
- Comments: "Issue triaged as a high-priority authentication bug. The
  reproduction steps are clear. Please provide app version and device
  information."

### 2. Automated PR Review

**When it triggers**: Automatically when you open or update a pull request

**What it does**:

- Reviews all changed files
- Checks for security issues
- Validates code quality
- Suggests improvements
- Posts detailed feedback

**Example PR**:

```typescript
// user.ts - Adding password validation
export function validatePassword(password: string): boolean {
  return password.length >= 8;
}
```

**Bot Review**:

```markdown
## 🤖 Automated Code Review

### Summary

Added password validation function. Implementation is functional but can be
improved.

### 🔴 High Priority

- **security** in `user.ts:2`
  - Password validation is too weak
  - 💡 Consider requiring complexity (uppercase, lowercase, numbers, special
    chars)

### 🟡 Medium Priority

- **performance** in `user.ts:2`
  - Function could benefit from regex for complexity check
  - 💡 Use
    /^(?=._[a-z])(?=._[A-Z])(?=._\d)(?=._[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/

### ✨ Good Practices

- Clear function name
- TypeScript typing

### 💭 Additional Comments

Consider adding unit tests for edge cases (empty string, special characters,
Unicode).
```

### 3. Sync PR Labels with Issue

**When it triggers**: Every 15 minutes for all open PRs

**What it does**:

- Checks if PR is linked to an issue
- Syncs labels from issue to PR
- Adds `status/need-issue` if no issue is linked

**How to link PR to issue**:

```markdown
# PR Description

Fixes #123 Closes #456 Resolves #789
```

## On-Demand Assistance

### Basic Usage

Comment on any issue or PR with `@gemini-cli` followed by your request:

```
@gemini-cli <your request>
```

### Examples

#### Code Explanation

```
@gemini-cli explain how the authentication flow works
```

Response includes:

- Step-by-step explanation
- Code references with file paths
- Architecture diagram (if applicable)
- Related files to explore

#### Bug Investigation

```
@gemini-cli debug why tests are failing in CI
```

Response includes:

- Analysis of recent changes
- Identification of failing tests
- Root cause analysis
- Suggested fixes

#### Implementation Guidance

```
@gemini-cli how should I implement rate limiting?
```

Response includes:

- Recommended approach
- Code examples
- Files to modify
- Testing strategy

#### Code Review Request

```
@gemini-cli review the authentication changes
```

Response includes:

- Security analysis
- Code quality assessment
- Specific suggestions
- Approval status

### Custom Commands

Use custom slash commands for common tasks:

#### `/code-review`

```
@gemini-cli /code-review src/auth/
```

Performs comprehensive code review of specified files or directories.

#### `/debug-issue`

```
@gemini-cli /debug-issue Login fails with 401 error
```

Systematically investigates and proposes solutions for issues.

#### `/summarize-pr`

```
@gemini-cli /summarize-pr
```

Generates PR summary with changelog entry.

### Advanced: Unified AI Collaboration

Use both Gemini and Claude together:

```
@both implement user authentication with OAuth
```

**How it works**:

1. **Gemini analyzes** the requirement
2. **Gemini creates** implementation plan
3. **Claude executes** the implementation
4. **Result** posted to issue/PR

**Use cases**:

- Complex implementations
- Multi-file changes
- Architecture decisions
- Comprehensive refactoring

## Workflow Examples

### Workflow 1: Bug Fix

1. **User opens issue**

   ```markdown
   Title: Login button not working Body: When I click login, nothing happens...
   ```

2. **Bot auto-triages**
   - Labels: `kind/bug`, `area/ui`, `priority/medium`
   - Comment: "Missing browser console errors. Please provide."

3. **User adds info**

   ```markdown
   Console shows: TypeError: Cannot read property 'submit' of null
   ```

4. **Developer investigates**

   ```
   @gemini-cli /debug-issue
   ```

5. **Bot analyzes**
   - Finds form submit handler issue
   - Suggests fix with code example
   - Points to relevant files

6. **Developer creates PR**

   ```markdown
   Fixes #123

   - Fixed form submit handler
   - Added null checks
   ```

7. **Bot reviews PR**
   - Approves changes
   - Suggests adding tests
   - Syncs labels from issue

8. **Developer merges**
   - Bot posts thank you message

### Workflow 2: Feature Implementation

1. **User requests feature**

   ```markdown
   Title: Add dark mode support Body: Would be nice to have dark mode...
   ```

2. **Bot triages**
   - Labels: `kind/feature`, `area/ui`, `priority/low`

3. **Maintainer wants design**

   ```
   @gemini-cli suggest implementation approach for dark mode
   ```

4. **Bot responds**
   - Suggests CSS variables approach
   - Lists files to modify
   - Provides code examples

5. **Developer implements**

   ```
   @gemini-cli /code-review
   ```

6. **Bot reviews**
   - Checks implementation
   - Suggests improvements
   - Verifies accessibility

### Workflow 3: Emergency Hotfix

1. **Critical bug reported**

   ```markdown
   Title: Payment processing fails Label: priority/critical
   ```

2. **Bot escalates**
   - Adds `status/urgent`
   - Notifies maintainers

3. **Developer investigates**

   ```
   @both debug this critical payment issue and propose immediate fix
   ```

4. **Unified AI responds**
   - Gemini identifies root cause
   - Claude prepares hotfix
   - Provides immediate workaround

5. **Quick PR**

   ```markdown
   HOTFIX: Payment processing

   Fixes #456
   ```

6. **Bot expedites review**
   - Fast security check
   - Approves if safe
   - Allows immediate merge

## Best Practices

### Writing Good Issue Descriptions

✅ **Good**:

```markdown
## Bug: Login fails with Google OAuth

### Environment

- App version: 1.2.3
- Browser: Chrome 120
- OS: Windows 11

### Steps to Reproduce

1. Click "Login with Google"
2. Authorize in Google popup
3. Return to app
4. Error: "Invalid state parameter"

### Expected

User should be logged in

### Actual

Error message shown, user not logged in

### Logs
```

Error: Invalid state parameter at validateOAuthCallback (auth.ts:45)

```

```

❌ **Bad**:

```markdown
login doesnt work help
```

### Writing Good PR Descriptions

✅ **Good**:

```markdown
## feat: Add password strength indicator

Fixes #789

### Changes

- Added password strength validator
- Created visual indicator component
- Added unit tests for strength calculation
- Updated documentation

### Testing

- [x] All existing tests pass
- [x] Added tests for new functionality
- [x] Manually tested on Chrome, Firefox, Safari

### Screenshots

[Screenshot of password strength UI]

### Breaking Changes

None
```

❌ **Bad**:

```markdown
fixed stuff
```

### Asking Effective Questions

✅ **Good**:

```
@gemini-cli I'm implementing user sessions. The current approach stores sessions in memory, which doesn't work across server restarts. What's the best way to implement persistent sessions with Redis, and which files would I need to modify?
```

❌ **Bad**:

```
@gemini-cli sessions
```

## Configuration Per Repository

### Customizing Triage Behavior

Edit `.gemini/config.yaml`:

```yaml
issue_triage:
  enabled: true
  auto_label: true
  priority_detection: true
  custom_labels:
    - name: 'needs-design'
      condition: 'mentions UI/UX'
    - name: 'needs-backend'
      condition: 'mentions API'
```

### Customizing Review Behavior

```yaml
code_review:
  comment_severity_threshold: 'MEDIUM'
  focus_areas:
    - security
    - performance
    - testing
  ignore_files:
    - '**/*.test.ts'
    - 'docs/**'
```

### Adding Repository Context

Edit `.gemini/GEMINI.md`:

```markdown
## Project-Specific Guidelines

### Architecture

This is a microservices architecture using:

- Node.js + Express for API
- React + TypeScript for frontend
- PostgreSQL for database

### Code Review Focus

1. Check for SQL injection vulnerabilities
2. Ensure all API endpoints have auth
3. Verify TypeScript types are not `any`
4. Confirm tests cover edge cases
```

## Limitations & Quotas

### Gemini API Limits

**Free Tier**:

- 60 requests/minute
- 1,000 requests/day

**Paid Tier**:

- Higher limits based on plan

**What counts as a request**:

- Each issue triage
- Each PR review
- Each on-demand query

### Best Practices for Limits

1. **Use auto-triage selectively**
   - Only for issues labeled `needs-triage`
   - Reduces unnecessary API calls

2. **Batch PR reviews**
   - Review only when PR is ready
   - Use draft PRs to avoid premature reviews

3. **Cache responses**
   - Bot remembers context within session
   - Reduces redundant analysis

## Troubleshooting Common Issues

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for detailed troubleshooting.

### Quick Fixes

**Bot not responding**:

```bash
# Check workflow is enabled
gh workflow list -R owner/repo

# Check workflow runs
gh run list -R owner/repo --workflow="gemini-issue-triage.yml"

# View logs
gh run view <run-id> --log
```

**Wrong labels applied**:

```
# Re-trigger triage
@gemini-cli /triage
```

**Review too strict/lenient**:

```yaml
# Adjust in .gemini/config.yaml
code_review:
  comment_severity_threshold: 'HIGH'  # Less comments
  # or
  comment_severity_threshold: 'LOW'   # More comments
```

## Advanced Features

### Checkpointing Long Conversations

For complex tasks:

```
@gemini-cli --checkpoint start
Let's implement a complete authentication system...
[Long conversation]
@gemini-cli --checkpoint save auth-implementation
```

Resume later:

```
@gemini-cli --checkpoint load auth-implementation
Continue from where we left off
```

### Multi-Repo Context

Link related issues across repos:

```
@gemini-cli this is related to owner/other-repo#456
Analyze both issues and suggest a unified fix
```

### Integration with CI/CD

Use in GitHub Actions:

```yaml
- name: Ask Gemini about test failures
  if: failure()
  run: |
    gh issue comment ${{ github.event.issue.number }} \
      --body "@gemini-cli analyze CI failure logs and suggest fixes"
```

## See Also

- [Setup Guide](./SETUP.md) - Initial setup instructions
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues
- [Gemini CLI Docs](https://geminicli.com/docs/) - Official documentation
