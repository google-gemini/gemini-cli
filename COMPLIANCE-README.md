# 🔐 Top-Top Compliance & Security Enforcement System

This repository implements a comprehensive, automated compliance and security enforcement system designed to meet enterprise-grade security standards for the Gemini CLI project.

## 🎯 System Overview

The compliance system provides:
- **Merge-blocking gates** that prevent non-compliant PRs from merging
- **Automated security scanning** for secrets, licenses, and attribution
- **Zone-based ownership** with required reviewer assignments
- **Live compliance dashboards** posted to every PR
- **Project board integration** for real-time status tracking
- **Daily reminders** and auto-cleanup of stale PRs

## 📊 Compliance Dashboard

Every PR automatically receives a live compliance dashboard showing:

| Check | Status | Details |
|-------|--------|---------|
| 🔗 Linked Issue | ✅ **PASS** / ❌ **FAIL** | Must link issue with acceptance criteria |
| 🔐 Secrets Scan | ✅ **PASS** / ❌ **FAIL** | Gitleaks scan for API keys, tokens |
| 📜 License & Attribution | ✅ **PASS** / ❌ **FAIL** | Copyright headers and attribution |
| 👥 Zone Reviewers | ✅ **PASS** / ❌ **FAIL** | Appropriate reviewers assigned |
| 🛡️ Security Review | 🔍 **PENDING** / ✅ **PASS** | Required for security changes |

### 📋 Action Items
- [ ] **CRITICAL**: Add linked issue (e.g., `Closes #123`)
- [ ] **CRITICAL**: Remove or rotate detected secrets
- [ ] Fix license/attribution issues
- [ ] Assign appropriate zone reviewers

### 🚫 Merge Status
**🟢 READY TO MERGE** - All gates passed / **🔴 MERGE BLOCKED** - Resolve failing checks above

## 🏗️ Setup Instructions

### 1. Repository Secrets
Add these repository secrets in GitHub Settings > Secrets and variables > Actions:

```bash
SECURITY_REVIEWERS=security-lead,security-reviewer-1,security-reviewer-2
PERF_REVIEWERS=perf-lead,perf-reviewer-1
CONFIG_REVIEWERS=config-lead,config-reviewer-1
LOGGING_REVIEWERS=logging-lead,logging-reviewer-1
DOCS_REVIEWERS=docs-lead,docs-reviewer-1
```

### 2. Repository Variables
Add repository variables in GitHub Settings > Secrets and variables > Actions:

```bash
PROJECT_NUMBER=1  # Your GitHub Project (beta) number
ORG_OR_USER=google-gemini  # Organization or username
REPO=gemini-cli  # Repository name
```

### 3. Branch Protections
Configure branch protection rules for `main` (or your default branch):

1. **Require status checks to pass**:
   - `PR Compliance & Security Enforcement`
   - Any other required CI checks

2. **Require branches to be up to date** before merging

3. **Require CODEOWNER reviews**:
   - Require review from Code Owners
   - Restrict push access to administrators

4. **Dismiss stale pull request approvals** when new commits are pushed

5. **Restrict who can dismiss pull request reviews** (administrators only)

### 4. GitHub Project Setup
1. Create a new GitHub Project (beta)
2. Add a single-select field named "Status" with these options:
   - Draft
   - Needs Compliance
   - Security Review
   - In Review
   - Ready to Merge
   - Done
   - Cancelled

### 5. CODEOWNERS Configuration
The system uses zone-based ownership defined in `CODEOWNERS`:

```bash
# Security Zone - Highest priority
/security/ @security-lead
/src/config/trustedFolders.ts @security-lead
**/env* @security-lead

# Performance Zone
**/perf*/ @perf-lead

# Config Zone
/src/config/ @config-lead

# Logging Zone
**/log*/ @logging-lead

# Docs Zone
**/*.md @docs-lead
```

## 🔄 Workflow Architecture

### Primary Workflow: `compliance-triage.yml`
- **Triggers**: PR opened/reopened/synchronized, daily schedule
- **Functions**:
  - Auto-labels PRs by content analysis
  - Enforces linked issue requirement
  - Runs Gitleaks secrets scan
  - Validates license/attribution compliance
  - Assigns zone-based reviewers
  - Posts live compliance dashboard
  - Blocks merges for non-compliant PRs
  - Sends daily reminders for failing PRs
  - Auto-closes stale non-compliant PRs

### Secondary Workflow: `project-sync.yml`
- **Triggers**: PR events and compliance workflow completion
- **Functions**:
  - Automatically adds PRs to GitHub Project board
  - Updates PR status based on compliance state
  - Moves items between columns automatically

## 🏷️ Label System

### Automatic Labels
- `zone:security` - Security-focused changes
- `zone:performance` - Performance optimizations
- `zone:config` - Configuration changes
- `zone:logging` - Logging/telemetry changes
- `zone:docs` - Documentation updates
- `security:needs-review` - Requires security team review
- `license:needs-attribution` - License/attribution issues found

### Status Labels
- `compliance:passed` - All checks passed, ready to merge
- `compliance:failed` - Compliance checks failing, merge blocked

## 🔍 Security Scanning

### Secrets Detection
- **Tool**: Gitleaks with custom configuration
- **Coverage**: API keys, tokens, passwords, private keys, JWTs
- **Exclusions**: Test files, documentation, common false positives
- **Entropy Analysis**: High-entropy strings flagged

### License Compliance
- **Script**: `scripts/license-check.sh`
- **Checks**:
  - Apache 2.0/SPDX license headers on all source files
  - No prohibited licenses (GPL/LGPL)
  - Proper attribution for third-party code
- **Graceful Fallback**: Basic header check if script unavailable

## 📋 Compliance Checklist by PR Type

### Security-Critical PRs (#6901, #7357, #7353, #7355)
- [ ] Linked issue with vulnerability ID and remediation notes
- [ ] OSS attribution preserved for any upstream patches
- [ ] Security validation with regression testing
- [ ] Audit trail documented in security changelog

### Performance PRs (#7920, #7919)
- [ ] Linked issue with performance benchmark baseline
- [ ] Before/after metrics documented
- [ ] No breaking changes without migration plan

### Config/Logging PRs (#3700, #3699, #3681)
- [ ] RBAC/ACL validation for privilege boundaries
- [ ] PII scrubbing verification for logging
- [ ] Linked issue with configuration governance

### Documentation PRs (#3679)
- [ ] Security review for placeholder credentials
- [ ] Linked to documentation maintenance issue

## 🚨 Emergency Bypass

In rare cases where immediate deployment is required:

1. **Document the emergency** in the PR description
2. **Get explicit approval** from repository administrators
3. **Temporarily disable** the compliance workflow
4. **Immediate post-merge audit** required
5. **Re-enable compliance** after deployment

## 📊 Monitoring & Reporting

### Dashboard Views
- **Needs Compliance**: PRs failing compliance checks
- **Security Review**: Security-critical PRs pending review
- **Ready to Merge**: Fully compliant PRs awaiting merge
- **Draft**: Work-in-progress PRs

### Metrics to Track
- Compliance pass rate by zone
- Average time to compliance resolution
- Most common compliance failures
- Security review completion rate

## 🛠️ Customization

### Adding New Zones
1. Add label in workflow: `zone:new-zone`
2. Add reviewer secret: `NEW_ZONE_REVIEWERS`
3. Update CODEOWNERS file
4. Add zone logic to workflows

### Modifying Compliance Checks
1. Edit `scripts/license-check.sh` for license rules
2. Update `.gitleaks.toml` for secrets patterns
3. Modify workflow logic for new requirements

### Adjusting Timelines
- **Daily reminders**: Edit cron schedule in workflow
- **Stale closure**: Modify days in `stale-close` job
- **Grace periods**: Adjust timing in workflow variables

## 🔧 Troubleshooting

### Common Issues
- **Workflow not triggering**: Check branch protection rules
- **Labels not applying**: Verify workflow permissions
- **Project sync failing**: Check project number and field names
- **Secrets scan false positives**: Update `.gitleaks.toml` allowlist

### Debug Mode
Set repository variable `DEBUG_COMPLIANCE=true` to enable verbose logging in workflows.

## 📞 Support

For issues with the compliance system:
1. Check workflow run logs for detailed error messages
2. Review the compliance dashboard in the affected PR
3. Contact repository administrators for bypass requests
4. File issues in the repository for system improvements

---

**This compliance system ensures every change meets enterprise security and governance standards before merging to main.** 🎯
