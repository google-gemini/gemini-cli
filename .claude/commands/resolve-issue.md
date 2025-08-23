---
argument-hint: <repository> [complexity-level]
description: Auto-resolve GitHub issues with configurable complexity levels
---

# GitHub Issue Auto-Resolver

Automatically resolve GitHub issues by intelligently selecting and fixing suitable issues from the upstream repository using specialized subagents and GitHub CLI integration.

## Usage

```
/resolve-issue <owner/repo> [simple|medium|complex]
```

**Arguments:**

- `<owner/repo>` (required): Upstream repository name (e.g., microsoft/vscode)
- `[complexity-level]` (optional): Issue complexity level to target
  - `simple` (default): Simple fixes, typos, minor bugs
  - `medium`: Moderate features, logic fixes, refactoring
  - `complex`: Major features, architectural changes, complex bugs

## Complexity Levels

### Simple (Default)

- Bug fixes: Simple logic errors, typos, missing validations
- Code improvements: Comment fixes, example corrections
- Configuration: Simple config adjustments
- Minor features: Small utility functions, simple UI improvements

### Medium

- Moderate bug fixes: Multi-file logic issues, integration problems
- Feature enhancements: Extending existing functionality
- Refactoring: Code structure improvements, optimization
- UI improvements: Complex component changes

### Complex

- Major features: New functionality requiring multiple components
- Architectural changes: Significant design modifications
- Complex bug fixes: Performance issues, memory leaks, race conditions
- Breaking changes: API modifications, major refactoring

## Prerequisites

The command will use the provided repository argument and pass the complexity level to the issue selector.

## Dual-Agent Workflow

### Phase 1: Parallel Agent Launch

Launch both subagents simultaneously with provided arguments:

1. **Repository Analyzer** (`repo-analyzer`): Discovers project infrastructure and commands
2. **Issue Selector** (`issue-resolver`): Selects optimal issue from upstream repository based on complexity level

**Arguments to pass:**

- Repository: Extract from `$ARGUMENTS` (first argument)
- Complexity level: Extract from `$ARGUMENTS` (second argument, default to "simple" if not provided)

### Phase 2: Issue Context Retrieval

After issue selection, fetch complete issue details:

```bash
# Get comprehensive issue information
gh issue view {selected_issue_number} --repo {UPSTREAM_REPO} --json number,title,body,author,createdAt,updatedAt,assignees,labels,state,comments

# Get all comments for context
gh issue view {selected_issue_number} --repo {UPSTREAM_REPO} --comments
```

### Phase 3: Implementation

1. **Create Branch**: Feature branch following repository conventions
2. **Implement Fix**: Code changes based on issue requirements and repository patterns
3. **Quality Assurance**: Use commands from repo-analyzer (lint, test, build)
4. **Git Operations**: Clean commits excluding .claude/ files

### Phase 4: Pull Request Creation

1. **Template Usage**: Use PR template discovered by repo-analyzer
2. **Issue Linking**: Link to upstream issue with "fixes owner/repo#123" format
3. **Professional Format**: NEVER include "Generated with [Claude Code](https://claude.ai/code)" attribution in commits or PR descriptions
4. **Upstream Repository**: Create PR directly on the upstream repository (not on a fork) using `gh pr create --repo {UPSTREAM_REPO}`
5. **Branch Cleanup**: After PR creation, checkout to the main branch (main/master) to prepare for future work

**Required Input**: Upstream repository (owner/repo) for issue analysis

## Error Handling

- **Missing Upstream Repo**: Command will request upstream repository specification
- **No Suitable Issues**: Graceful handling when issue-resolver finds no candidates
- **Infrastructure Detection Failure**: Fallback commands when repo-analyzer cannot identify project type

## Success Flow

1. Launch subagents in parallel
2. Receive repository commands and selected issue number
3. Fetch complete issue context using GitHub CLI
4. Implement solution using repository-specific workflows
5. Create professional pull request linking to upstream issue

The system maintains focus on the single selected issue while leveraging discovered repository infrastructure for optimal implementation.
