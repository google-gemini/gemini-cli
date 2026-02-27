# Gemini Cowork — Production Deployment Guide

> **Audience**: Platform engineers, DevSecOps leads, and team leads deploying
> Gemini Cowork in a professional engineering organisation.
>
> **Version**: v0.5.0 (Phase 5 — Self-Optimization, Collaboration, Security)

---

## Table of Contents

1. [System Requirements](#1-system-requirements)
2. [Installation Methods](#2-installation-methods)
3. [Configuration Reference](#3-configuration-reference)
4. [Security Hardening](#4-security-hardening)
5. [Team Setup & Access Control](#5-team-setup--access-control)
6. [CI/CD Integration](#6-cicd-integration)
7. [Observability & Monitoring](#7-observability--monitoring)
8. [SOC2 Compliance Checklist](#8-soc2-compliance-checklist)
9. [Performance Tuning](#9-performance-tuning)
10. [Incident Response](#10-incident-response)

---

## 1. System Requirements

### Minimum (single developer)
| Resource | Minimum | Recommended |
|---|---|---|
| Node.js | 20 LTS | 22 LTS |
| RAM | 512 MB | 2 GB |
| Disk | 200 MB | 1 GB |
| OS | Linux / macOS / WSL2 | Ubuntu 22.04 LTS |

### Team deployment (shared runner)
| Resource | Minimum | Recommended |
|---|---|---|
| Node.js | 20 LTS | 22 LTS |
| RAM | 4 GB | 8 GB |
| Disk | 10 GB | 50 GB |
| CPU | 2 cores | 4+ cores |

### API Quota Planning

| Model | Input pricing | Output pricing | Recommended use |
|---|---|---|---|
| `gemini-2.0-flash` | $0.10/1M tokens | $0.40/1M tokens | Day-to-day coding tasks |
| `gemini-2.0-pro` | $1.25/1M tokens | $5.00/1M tokens | Architecture reviews |
| `text-embedding-004` | $0.001/1M tokens | N/A | Memory / vector search |

**Tip**: Model Tiering (Phase 5) automatically routes simple tasks to Flash,
saving ~70% on typical coding workflows.

---

## 2. Installation Methods

### A. NPM (recommended for teams)

```bash
# Install globally
npm install -g @google/gemini-cowork

# Or as a project devDependency
npm install -D @google/gemini-cowork
npx cowork run "your goal"
```

### B. Standalone binary (air-gapped environments)

```bash
# Build binaries (requires the source repository)
cd packages/cowork
npm run build:binaries

# Distribute the appropriate binary:
bin/cowork-linux   # Linux x64
bin/cowork-macos   # macOS x64/arm64
bin/cowork-win.exe # Windows x64
```

### C. Docker (isolated / sandboxed execution)

```dockerfile
FROM node:22-alpine
RUN npm install -g @google/gemini-cowork
WORKDIR /project
ENV GEMINI_API_KEY=""
ENTRYPOINT ["cowork"]
CMD ["run", "--help"]
```

```bash
docker run --rm -it \
  -e GEMINI_API_KEY="$GEMINI_API_KEY" \
  -v "$(pwd):/project" \
  gemini-cowork run "Audit the project dependencies"
```

---

## 3. Configuration Reference

### `.coworkrc` (project-level)

```json
{
  "model": "gemini-2.0-flash",
  "visionModel": "gemini-2.0-flash",
  "embeddingModel": "text-embedding-004",
  "maxIterations": 15,
  "trace": true,
  "memory": true,
  "dryRun": false,
  "projectRules": "Always use ESM imports. Prefer async/await over callbacks. Write JSDoc for public APIs.",
  "safety": {
    "allowedDirs": ["/project/src", "/project/tests", "/project/docs"],
    "deniedCommandPatterns": [
      "rm\\s+-rf\\s+/",
      "curl.*\\|.*sh",
      "wget.*\\|.*sh"
    ],
    "maxWriteBytes": 524288,
    "enforceProjectRoot": true
  },
  "coworkDir": ".cowork"
}
```

### Environment Variables

| Variable | Description | Required |
|---|---|---|
| `GEMINI_API_KEY` | Gemini API key | Yes |
| `COWORK_MODEL` | Override default model | No |
| `COWORK_DRY_RUN` | Set to `1` for global dry-run | No |
| `COWORK_AUDIT_PATH` | Custom audit log path | No |
| `COWORK_NO_COLOR` | Disable ANSI colours | No |

### Interactive Setup

```bash
cowork init            # guided wizard
cowork init --print    # show resolved config (no prompts)
```

---

## 4. Security Hardening

### 4.1 API Key Management

**Never** store API keys in `.coworkrc` on shared systems.  Use one of:

```bash
# Option A: environment variable (recommended)
export GEMINI_API_KEY="$(vault kv get -field=key secret/gemini)"
cowork run "..."

# Option B: `.env` file (gitignored)
echo "GEMINI_API_KEY=AIza..." >> .env
source .env && cowork run "..."

# Option C: macOS Keychain
security add-generic-password -s gemini-cowork -a gemini -w "AIza..."
export GEMINI_API_KEY="$(security find-generic-password -s gemini-cowork -w)"
```

### 4.2 Safety Policy Configuration

Restrict the agent to only the directories it needs:

```json
{
  "safety": {
    "allowedDirs": ["./src", "./tests"],
    "enforceProjectRoot": true,
    "maxWriteBytes": 102400,
    "deniedCommandPatterns": [
      "rm\\s+-rf",
      "chmod\\s+777",
      "sudo",
      "curl.*\\|.*sh",
      "git\\s+push.*--force"
    ]
  }
}
```

### 4.3 Secret Scanning

The `Redactor` (Phase 5) automatically scrubs secrets from all text sent
to the LLM.  To verify it's working:

```ts
import { Redactor } from '@google/gemini-cowork';

const redactor = new Redactor();
const { text, summary } = redactor.redact(
  'API_KEY=AIzaSyAbc123... email: dev@company.com'
);
// text → 'API_KEY=[REDACTED:API_KEY:1] email: [REDACTED:PII_EMAIL:1]'
console.log(summary); // { API_KEY: 1, PII_EMAIL: 1 }
```

Add custom patterns for your organisation's secret formats:

```ts
redactor.addPattern({
  category: 'API_KEY',
  name: 'Internal auth token',
  pattern: /\b(INTERNAL-[A-Z0-9]{32})\b/g,
});
```

### 4.4 Audit Log Verification

The `AuditLog` creates a SHA-256 hash chain.  Verify integrity at any time:

```bash
# Via CLI (coming in v0.5.1):
cowork audit verify

# Programmatically:
const log = new AuditLog('.cowork/audit.ndjson', 'verification');
const result = await log.verify();
if (!result.valid) {
  console.error('AUDIT LOG TAMPERED:', result.brokenLinks);
}
```

### 4.5 Sandboxed Command Execution

For untrusted commands (CI pipelines, user-submitted goals):

```ts
import { SafetyPolicyEngine, SandboxRunner } from '@google/gemini-cowork';

const policy = new SafetyPolicyEngine({
  allowedDirs: ['/project'],
  deniedCommandPatterns: ['rm\\s+-rf', 'sudo'],
  maxWriteBytes: 524288,
  enforceProjectRoot: true,
});

const sandbox = new SandboxRunner(policy, {
  useDocker: true,
  dockerImage: 'node:22-alpine',
  timeoutMs: 30_000,
});

const result = await sandbox.run('npm test', '/project');
```

---

## 5. Team Setup & Access Control

### 5.1 Shared `.coworkrc` in version control

Commit a team-wide configuration WITHOUT API keys:

```bash
# .coworkrc (safe to commit)
{
  "model": "gemini-2.0-flash",
  "trace": true,
  "maxIterations": 10,
  "projectRules": "Follow the team style guide at CONTRIBUTING.md."
}

# .gitignore
.env
.cowork/traces/     # can be large; optional to gitignore
```

### 5.2 Session Handoffs

Pass an in-progress agentic task between team members:

```bash
# Developer A (pausing mid-task):
cowork session export --notes "Auth refactor 60% done, next: refresh tokens"
# → .cowork/session-abc123.cowork-session

# Developer B (resuming):
cowork session import .cowork/session-abc123.cowork-session
cowork session resume .cowork/session-abc123.cowork-session
```

### 5.3 CODEOWNERS Integration

The agent automatically suggests reviewers after modifying files:

```bash
# CODEOWNERS file:
/src/auth/     @security-team
/src/payments/ @payments-team @security-team
*.test.ts      @qa-team

# When the agent modifies src/auth/login.ts:
# → Suggested Reviewers:
#   @security-team (2 files)
#   @qa-team (1 file)
```

### 5.4 Peer Review Workflow

Use the `review` command for high-stakes changes:

```bash
# Two-round coder → reviewer debate before presenting to the team:
cowork review "Implement JWT refresh token rotation" --max-rounds 3

# Output:
# [CODER]    Round 1: Proposed JWT rotation implementation...
# [REVIEWER] Round 1: CHANGES REQUESTED — missing token blacklist
# [CODER]    Round 2: Added Redis-backed token blacklist...
# [REVIEWER] Round 2: APPROVED — implementation meets security requirements
# ✓ Proposal approved after 2 round(s).
```

---

## 6. CI/CD Integration

### 6.1 GitHub Actions

```yaml
# .github/workflows/cowork.yml
name: Gemini Cowork — Auto Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install Gemini Cowork
        run: npm install -g @google/gemini-cowork

      - name: Run peer review
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
        run: |
          cowork review \
            "Review the changes in this PR for correctness, security, and style" \
            --root ${{ github.workspace }} \
            --max-rounds 2 \
            --trace \
            > review-output.txt 2>&1

      - name: Post review as PR comment
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const review = fs.readFileSync('review-output.txt', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '## Gemini Cowork — Automated Review\n\n```\n' + review.slice(0, 60000) + '\n```'
            });
```

### 6.2 GitLab CI

```yaml
# .gitlab-ci.yml
cowork-review:
  image: node:22-alpine
  stage: review
  variables:
    GEMINI_API_KEY: $GEMINI_API_KEY
  script:
    - npm install -g @google/gemini-cowork
    - cowork run --dry-run "Review changes and suggest improvements" --trace
  artifacts:
    paths:
      - .cowork/traces/
    expire_in: 7 days
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
```

### 6.3 Pre-commit Hook

```bash
#!/bin/sh
# .git/hooks/pre-commit

# Dry-run all staged changes through the agent to catch issues early.
STAGED=$(git diff --cached --name-only | head -20)
if [ -n "$STAGED" ]; then
  echo "Running Gemini Cowork dry-run check..."
  cowork run --dry-run \
    "Review these staged changes for obvious bugs: $STAGED" \
    --max-iterations 3 || true
fi
```

---

## 7. Observability & Monitoring

### 7.1 Trace Files

Every session with `--trace` writes to `.cowork/traces/`:

```
.cowork/traces/
  session-abc123.json   # machine-readable event log
  session-abc123.md     # human-readable post-mortem
```

Aggregate traces with:
```bash
# Count sessions by outcome:
cat .cowork/traces/*.json | jq '.outcome' | sort | uniq -c

# Average tokens per session:
cat .cowork/traces/*.json | jq '.events[].content | length' | awk '{sum+=$1} END {print sum/NR}'
```

### 7.2 Real-Time Dashboard

```bash
cowork run --dashboard "Analyse the codebase"
# → Opens http://localhost:3141 in your browser
```

Dashboard panels:
- **Thought Chain** — live Think / Act / Observe timeline
- **Live Logs** — streaming event feed with timestamp and tool labels
- **Token Usage** — gauges with cost estimate (Flash/Pro pricing)

### 7.3 Audit Log

```bash
# View all audit entries for a session:
cat .cowork/audit.ndjson | jq 'select(.session=="abc123")'

# Verify log integrity:
node -e "
const { AuditLog } = require('@google/gemini-cowork');
new AuditLog('.cowork/audit.ndjson', 'verify')
  .verify()
  .then(r => console.log(r.valid ? '✓ Audit log intact' : '✗ TAMPERED: ' + JSON.stringify(r.brokenLinks)));
"
```

### 7.4 Metrics to Track

| Metric | Alert threshold | Notes |
|---|---|---|
| Session cost (USD) | > $1.00 | Switch complex tasks to Pro selectively |
| Iterations per session | > 20 | May indicate looping; check goal clarity |
| Self-healer retries | > 3 consecutive fails | Tests may need manual attention |
| Redacted secrets / session | > 0 | Investigate source; may indicate config leak |
| Audit log broken links | Any | Immediate security investigation |

---

## 8. SOC2 Compliance Checklist

### CC6 — Logical and Physical Access Controls

- [x] **CC6.1** — API keys stored in environment variables / secret manager, never in config files committed to VCS.
- [x] **CC6.2** — `SafetyPolicy` restricts file system access to explicitly allowed directories.
- [x] **CC6.3** — `SandboxRunner` optionally executes commands in isolated Docker containers.
- [ ] **CC6.6** — Add OIDC/SSO integration (planned for v0.6).

### CC7 — System Operations

- [x] **CC7.1** — All tool calls logged to tamper-evident `AuditLog`.
- [x] **CC7.2** — `Redactor` removes secrets and PII before transmission to external APIs.
- [x] **CC7.3** — `Tracer` records full session history for post-incident analysis.
- [x] **CC7.4** — Dry-run mode enables review before any changes are applied.

### CC9 — Risk Mitigation

- [x] **CC9.1** — `deniedCommandPatterns` blocks dangerous shell commands before human-in-the-loop prompt.
- [x] **CC9.2** — MCP server calls are logged with tool name, arguments, and session ID.
- [x] **CC9.3** — Session files exported without API keys; credentials re-supplied on import.

### Additional Controls

- [x] **Integrity** — `AuditLog` uses SHA-256 hash chaining (tamper-detectable).
- [x] **Confidentiality** — `Redactor` covers Google/OpenAI/AWS/GitHub/Stripe/Slack/NPM API key patterns, JWTs, SSH private keys, email, phone, SSN, credit card.
- [x] **Availability** — All subsystems are non-fatal; indexing, memory, and MCP failures degrade gracefully.

### Evidence Artefacts for Auditors

| Control | Evidence location |
|---|---|
| Access restriction | `.coworkrc` → `safety.allowedDirs` |
| Command approval | Terminal recording of human-in-the-loop prompts |
| Change log | `.cowork/audit.ndjson` |
| Secret handling | `Redactor` unit test results |
| Session integrity | `AuditLog.verify()` report |

---

## 9. Performance Tuning

### 9.1 Context Pruning

For large repositories (> 500 files), enable context pruning to reduce latency:

```ts
import { ContextPruner } from '@google/gemini-cowork';

const pruner = new ContextPruner();
const { text, savedTokens, removedBlocks } = pruner.prune(rawContext, goal);
console.log(`Saved ${savedTokens.toLocaleString()} tokens (${removedBlocks} blocks removed)`);
```

Typical savings: **30–60%** token reduction on large monorepos.

### 9.2 Model Tiering

Model Tiering is automatic when using the `Coworker` class.  To inspect decisions:

```ts
import { ModelTier } from '@google/gemini-cowork';

const tier = new ModelTier('gemini-2.0-flash', 'gemini-2.0-pro');
const decision = tier.select('search', 'Find the latest React 19 docs');
// → { model: 'gemini-2.0-pro', reason: '"search" tool requires Pro', complexityScore: 0.35 }
```

Override per-session:
```bash
COWORK_MODEL=gemini-2.0-pro cowork run "Complex architectural refactor..."
```

### 9.3 Memory Store

For projects with > 50 correction pairs, the TF-IDF retrieval may slow down.
Upgrade the memory store backend to LanceDB for vector-indexed retrieval:

```bash
npm install @lancedb/lancedb
```

Then update `packages/cowork/src/memory/vector-store.ts` to use LanceDB
(the class interface is unchanged).

### 9.4 Parallel Execution

Run multiple agents in parallel for independent sub-tasks:

```ts
const [analysisResult, testResult] = await Promise.all([
  new Coworker({ projectRoot, maxIterations: 5 })
    .runLoop('Analyse code quality metrics'),
  new Coworker({ projectRoot, maxIterations: 5 })
    .runLoop('Identify failing tests'),
]);
```

---

## 10. Incident Response

### 10.1 Agent made unwanted file changes

```bash
# 1. Identify changed files from audit log:
cat .cowork/audit.ndjson | jq 'select(.action=="write_file") | {path, ts, session}'

# 2. Restore from git:
git checkout -- <path>

# 3. Review trace for root cause:
cat .cowork/traces/session-<id>.md

# 4. Enable dry-run to prevent recurrence:
echo '{"dryRun": true}' > .coworkrc
```

### 10.2 Suspected secret exposure

```bash
# 1. Immediately rotate the exposed key.

# 2. Scan all trace files for unredacted secrets:
grep -r "AIza\|sk-\|ghp_\|xox[bprs]-" .cowork/traces/ 2>/dev/null \
  && echo "⚠ Secrets found in traces — check Redactor config"

# 3. Verify Redactor is active (check src/agent/core.ts constructor).
# 4. File an incident report using .cowork/audit.ndjson as evidence.
```

### 10.3 Audit log shows tampered entries

```bash
# 1. Immediately take the system offline / stop the agent.
# 2. Copy the audit log to a secure location.
# 3. Run verification:
node -e "
const { AuditLog } = require('@google/gemini-cowork');
new AuditLog('.cowork/audit.ndjson', 'forensics')
  .verify()
  .then(r => console.log(JSON.stringify(r, null, 2)));
"
# 4. Preserve forensic artefacts:
cp .cowork/audit.ndjson .cowork/audit-$(date +%s).ndjson.bak
# 5. Notify security team and initiate SOC2 incident procedure.
```

### 10.4 Token cost spike

```bash
# 1. Check recent session costs from trace files:
cat .cowork/traces/*.json | \
  jq -r '"Session: \(.sessionId)  Events: \(.events | length)"' | \
  sort -t: -k2 -n -r | head -10

# 2. Reduce maxIterations:
echo '{"maxIterations": 5}' | jq '. + input' .coworkrc > .coworkrc.tmp && mv .coworkrc.tmp .coworkrc

# 3. Enable model tiering (should already be default in v0.5+):
# Verify ModelTier is instantiated in Coworker constructor.
```

---

*Gemini Cowork is an open-source project.  Contributions welcome at*
*https://github.com/google-gemini/gemini-cli*

*For enterprise support, file an issue with the `enterprise` label.*
