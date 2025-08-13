# GitHub Issue Resolution Workflow

## Overview
This document outlines a general process for finding and resolving GitHub issues in any repository using GitHub CLI and AI code agents. This workflow can be adapted to different tech stacks and project types.

## Step 1: Find the Original Repository

The user will give you the URL or ask them for the repository URL.

## Step 2: Fetch Issues from Original Repository

```bash
# Fetch all open issues with comments and labels
gh issue list --repo ORIGINAL_OWNER/ORIGINAL_REPO --state open --limit 100 --json number,title,labels,assignees,createdAt

# Get detailed issue information including comments
gh issue view ISSUE_NUMBER --repo ORIGINAL_OWNER/ORIGINAL_REPO --comments
```

## Step 3: Issue Selection Criteria

Select issues that meet ALL of the following criteria:

### Suitable Issues
- **Code-only fixes**: Issues requiring file modifications, bug fixes, feature additions
- **Self-contained**: No external tool dependencies (browsers, databases, APIs, etc.)
- **Clear requirements**: Well-defined problem statement and expected outcome
- **Reproducible**: Steps to reproduce are provided or issue is clearly documented
- **Small scope**: Issues that can be fixed with minimal, focused changes
- **Language/framework familiarity**: Issues in languages/frameworks you can work with

### Unsuitable Issues
- Requires external tools, services, or specialized environments
- Documentation-only changes without code impact
- Infrastructure/deployment/CI/CD related
- Involves third-party integrations or external APIs
- Needs testing with specific hardware/environment
- Issues already assigned to maintainers
- Issues with existing open PRs
- Platform-specific issues you can't test
- Complex architectural changes

### High-Priority Issue Types (generally applicable)
- Bug fixes with clear reproduction steps
- Dependency conflicts or version compatibility issues
- Exception handling improvements
- Type/validation errors
- Configuration or state management issues
- Performance optimizations with measurable impact
- Security vulnerabilities (handle responsibly)

## Step 4: Verify Issue Status

Before proceeding, verify the issue meets all criteria and is still valid:

**Issue Suitability Check:**
- Issue is suitable for AI code agent
- Solution addresses a root problem requiring code changes
- Changes can be minimal and focused
- No conflicting dependencies 
- You have the necessary knowledge of the language/framework

**Issue Status Verification:**

```bash
# Check if issue is already resolved by existing PR
gh pr list --repo ORIGINAL_OWNER/ORIGINAL_REPO --search "ISSUE_NUMBER"

# Verify issue is still open and not stale
gh issue view ISSUE_NUMBER --repo ORIGINAL_OWNER/ORIGINAL_REPO

# Check for related issues or discussions
gh issue list --repo ORIGINAL_OWNER/ORIGINAL_REPO --search "keyword from issue"
```

**Pre-Implementation Research:**
- Read the issue description and all comments thoroughly
- Understand the root cause and expected behavior
- Check if similar issues have been fixed before
- Look for maintainer feedback or preferred solutions
- Verify the issue affects the current codebase version
- Research the project's tech stack and conventions

## Step 5: Understand Project Structure



**Key Files to Check:**
- README.md (setup instructions, tech stack)
- CONTRIBUTING.md (contribution guidelines)
- Package manager files (dependencies, scripts)
- CI/CD configuration (.github/workflows/)
- Linting/formatting configuration
- License file

## Step 6: Fetch Complete Issue Information

```bash
# Get comprehensive issue data
gh issue view ISSUE_NUMBER --repo ORIGINAL_OWNER/ORIGINAL_REPO --comments --json title,body,comments,labels,assignees
```

## Step 7: Create Resolution Plan

Document your approach systematically:

1. **Problem Analysis**: 
   - Understand the root cause from error messages/stack traces
   - Identify affected files and code sections
   - Analyze the current implementation that's causing issues

2. **Solution Design**: 
   - Define the fix approach (replacement, addition, modification)
   - Consider alternative solutions and trade-offs
   - Ensure the fix aligns with project architecture and patterns

3. **File Changes**: 
   - List specific files that need modification
   - Document what changes will be made to each file
   - Identify any new dependencies needed

4. **Testing Strategy**: 
   - Plan how to verify the fix works
   - Consider existing test cases that might be affected
   - Check if new tests need to be written
   - Understand how to run tests in this project

5. **Edge Cases**: 
   - Consider potential side effects of the changes
   - Think about backward compatibility
   - Plan for error handling scenarios

## Step 8: Implementation Workflow

### Create New Branch
```bash
# Create and switch to new branch
git checkout -b fix/issue-ISSUE_NUMBER-short-description

# Examples:
# git checkout -b fix/issue-123-memory-leak
# git checkout -b fix/issue-456-validation-error
```

### Implementation Best Practices

**Code Quality:**
- Follow the project's coding style and conventions
- Use appropriate language/framework patterns
- Add proper error handling and validation
- Include descriptive variable names and comments when necessary
- Respect existing patterns and architecture

**Dependency Management:**
- Check package manager files for existing dependencies
- Prefer dependencies with compatible licenses
- Test the fix with minimal dependency changes when possible
- Follow project's dependency versioning strategy

**File Organization:**
- Respect existing project structure and organization
- Use proper imports and maintain module boundaries
- Follow the existing patterns for error handling and logging

### Testing Your Changes

With lint etc

**Universal Testing Steps:**
1. Identify the project's testing framework from README/docs
2. Run existing tests to ensure they pass before your changes
3. Make your changes
4. Run tests again to ensure no regressions
5. Add new tests if required by the fix
6. Run any linting/formatting tools the project uses

### Handle Common Issues

**Pre-commit Hooks and Formatting:**
- Many projects use pre-commit hooks or CI checks
- Always run the project's linting and formatting tools before committing
- Common tools: prettier, eslint, black, flake8, clippy, gofmt
- Check `.pre-commit-config.yaml` or `.github/workflows/` for required checks

**Dependency Conflicts:**
- Test that all existing functionality works after changes
- Document why specific versions are needed
- Check for licensing compatibility
- Update lockfiles (package-lock.json, poetry.lock, Cargo.lock) if needed

### Commit and Push

```bash
# Stage changes
git add .

# Commit with descriptive message
git commit -m "fix: resolve issue #ISSUE_NUMBER - brief description

- Specific change 1
- Specific change 2  
- Any important notes about the fix"

# Examples:
# git commit -m "fix: handle null pointer in user validation (#123)"
# git commit -m "fix: update dependency to resolve security vulnerability (#456)"

# Push to your fork
git push origin fix/issue-ISSUE_NUMBER-short-description
```

**Commit Message Best Practices:**
- Use conventional commit format: `fix:`, `feat:`, `refactor:`, etc.
- Reference the issue number in parentheses
- Keep the first line under 72 characters
- Add bullet points for multiple changes
- Be specific about what was changed

## Step 9: Create Pull Request

### Pre-PR Checklist
```bash
# Final verification before creating PR (adjust commands based on project)
npm test / pytest / cargo test      # Ensure tests pass
npm run lint / flake8 / cargo clippy # Ensure linting passes  
git status                          # Verify all changes are committed
```

### Check for PR Template
```bash
# Look for PR template in common locations
ls .github/pull_request_template.md
ls .github/PULL_REQUEST_TEMPLATE.md
ls .github/PULL_REQUEST_TEMPLATE/
```

### Create PR
Use this if their is not pull request template
```bash
# Create PR to original repository
gh pr create --repo ORIGINAL_OWNER/ORIGINAL_REPO \
  --title "fix: resolve issue #ISSUE_NUMBER - brief description" \
  --body "$(cat <<'EOF'
## Summary
Fixes #ISSUE_NUMBER

Brief description of what this PR accomplishes and why it's needed.

## Changes Made
- Specific change 1 with file reference
- Specific change 2 with reasoning
- Any dependency changes with justification

## Testing
- [ ] Tested locally with manual verification
- [ ] All existing tests pass
- [ ] Linting/formatting checks pass
- [ ] New tests added (if applicable)

## Additional Notes
Any important implementation details, trade-offs made, or follow-up work needed.
EOF
)" \
  --head YOUR_USERNAME:fix/issue-ISSUE_NUMBER-short-description
```

### PR Quality Standards

**Title Format:**
- Use conventional commits: `fix:`, `feat:`, `refactor:`
- Keep under 72 characters
- Be specific about the change
- Reference issue number

**Description Requirements:**
- Always include "Fixes #ISSUE_NUMBER" for automatic linking
- Explain the problem and solution clearly
- List all files changed and why
- Document testing performed
- Include any breaking changes or migration notes

### Responding to Feedback

**Common Feedback Scenarios:**
1. **Formatting Issues**: Run the project's formatting tools
2. **Separate Concerns**: If mixing multiple fixes, create separate PRs
3. **Code Style**: Follow project conventions strictly
4. **Testing**: Add tests if specifically requested
5. **Documentation**: Update docs if the change affects user-facing APIs

**Response Strategy:**
- Acknowledge feedback promptly and professionally
- Make requested changes in new commits, don't force-push
- Explain your reasoning if you disagree (but be open to maintainer preferences)
- Test thoroughly after making changes
- Update the PR description if needed

## Step 10: Post-PR Management

### Monitor PR Status
```bash
# Check PR status and comments
gh pr view PR_NUMBER --repo ORIGINAL_OWNER/ORIGINAL_REPO --comments

# View CI/CD status
gh pr checks PR_NUMBER --repo ORIGINAL_OWNER/ORIGINAL_REPO
```

### Handle CI Failures
```bash
# If CI fails, check the logs and fix issues
# Common CI failure types:
# 1. Test failures
# 2. Linting/formatting issues
# 3. Build failures
# 4. Security scans
# 5. Code coverage requirements

# Fix and push updates
git add .
git commit -m "fix: address CI feedback"
git push origin fix/issue-ISSUE_NUMBER-short-description
```

## Verification Checklist

Before submitting any PR:

**Code Quality:**
- [ ] All tests pass locally
- [ ] Linting/formatting checks pass
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] No unrelated changes included

**Documentation:**
- [ ] PR description is clear and complete
- [ ] Issue is properly referenced with "Fixes #ISSUE_NUMBER"
- [ ] Changes are documented if they affect user-facing APIs
- [ ] README or docs updated if needed

**Project Standards:**
- [ ] Branch name follows convention
- [ ] Commit messages are descriptive and properly formatted
- [ ] Dependencies are properly justified and compatible





