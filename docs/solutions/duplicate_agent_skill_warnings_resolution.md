---
title: Resolving Duplicate Agent and Skill Startup Warnings
category: configuration
date: 2026-08-12
module: customization-loader
tags:
  - gemini-cli
  - agents
  - skills
  - duplicate-warnings
problem_type: configuration_issue
symptoms:
  - "⚠ Duplicate agent name 'ce-web-researcher' detected. The later definition will be ignored."
  - "⚠ Skill conflict detected: 'lfg' from ~/.agents/.gemini/skills/lfg/SKILL.md is overriding the same skill from ~/.agents/skills/lfg/SKILL.md."
root_cause: "Gemini CLI scans both ~/.agents/ and ~/.gemini/ during startup. A legacy untracked directory at ~/.agents/.gemini/ contained duplicate shadow copies of skills and agents already defined in ~/.agents/."
resolution_type: configuration_fix
---

# Resolving Duplicate Agent and Skill Startup Warnings

## Problem

When launching Gemini CLI, startup warnings indicated duplicate agent (`ce-web-researcher`) and skill (`lfg`) definitions:

```text
⚠ Duplicate agent name 'ce-web-researcher' detected. The later definition will be ignored. Rename one of the agents to avoid this conflict.
⚠ Skill conflict detected: "lfg" from "/Users/rzager/.agents/.gemini/skills/lfg/SKILL.md" is overriding the same skill from "/Users/rzager/.agents/skills/lfg/SKILL.md".
```

## Symptoms

- CLI startup feedback emitted warning logs on every invocation.
- Agent and skill registries processed duplicate definitions across two discovery paths (`~/.agents/` and `~/.agents/.gemini/`).

## What Didn't Work

- **Selective file renaming**: Renaming individual files without addressing the shadow directory leaves other duplicated agents/skills unhandled.
- **Unverified directory deletion**: Deleting `~/.agents/.gemini/` directly without auditing for active auto-sync hooks risks breaking processes if a background script regenerates the directory.

## Solution

### 1. Audit Root Cause
Scan workspace hooks, binaries, and scripts to confirm no automated process periodically syncs files into `~/.agents/.gemini/`:

```bash
grep -rn "\.gemini" ~/.agents/hooks/ ~/.agents/bin/ ~/.agents/scripts/ 2>/dev/null || true
```

### 2. Verify Primary Files and Create Reversible Backup
Confirm primary definitions exist in `~/.agents/agents/` and `~/.agents/skills/`, then safely move the untracked `.agents/.gemini` folder to a timestamped backup directory:

```bash
# Verify primary definitions
ls ~/.agents/agents/ce-web-researcher.md ~/.agents/skills/lfg/SKILL.md

# Safely back up and remove shadow directory
mv ~/.agents/.gemini ~/.agents/.gemini.bak.$(date +%Y%m%d_%H%M%S)
```

### 3. Verify Clean CLI Startup
Execute the CLI help command and assert that zero duplicate/conflict warnings are produced:

```bash
cd /Users/rzager/Code/rz@russellzager.com/gemini-claude
npm run start -- --help 2>&1 | grep -i "duplicate\|conflict" || echo "PASS: Zero duplicate/conflict warnings"
```

## Why This Works

Gemini CLI discovers user-level customizations in both `~/.agents/` (`.agents/skills`, `.agents/agents`) and `~/.gemini/` (`.gemini/skills`, `.gemini/agents`). Because `~/.agents/.gemini/` was a nested folder inside `~/.agents/`, the scanner traversed both tree paths and loaded identical definitions twice. Removing the nested `.gemini` folder eliminates the duplicate discovery path.

## Prevention

1. **Avoid Nested Shadow Customization Folders**: Keep `~/.agents/` clean of nested `.gemini/` directories.
2. **Path Portability**: Use `~/.agents/` or repo-relative references instead of hardcoding absolute user home paths.
3. **Automated Verification**: Include CLI startup checks in preflight test suites to catch duplicate customization warnings early.
