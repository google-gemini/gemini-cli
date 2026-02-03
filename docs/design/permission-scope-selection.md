# Design: Permission Scope Selection

**Status:** Draft **Author:** @majdyz **Created:** 2026-02-03 **Last Updated:**
2026-02-03

---

## Table of Contents

1. [Overview](#overview)
2. [Current System](#current-system)
3. [Problem Statement](#problem-statement)
4. [Proposed Solution](#proposed-solution)
5. [Smart Scope Detection](#smart-scope-detection)
6. [Security Considerations](#security-considerations)
7. [Implementation Plan](#implementation-plan)
8. [Open Questions](#open-questions)

---

## Overview

This document proposes improvements to the permission approval UX by adding
**smart scope selection** when users approve tool executions. The goal is to
reduce approval fatigue while maintaining security.

**Related Documentation:**

- [Policy Engine](../core/policy-engine.md) - Core policy system documentation

---

## Current System

### How Permissions Work

The permission system uses a **policy engine** with priority-based rules:

```
┌─────────────────────────────────────────────────────────────┐
│ ADMIN TIER (3.000 - 3.999) - Cannot be overridden          │
├─────────────────────────────────────────────────────────────┤
│ USER TIER (2.000 - 2.999)                                   │
│   2.95  ← Dynamic "Always Allow" (session choices)         │
│   2.0   ← User TOML policies                               │
├─────────────────────────────────────────────────────────────┤
│ DEFAULT TIER (1.000 - 1.999)                                │
│   1.999 ← YOLO mode                                        │
│   1.050 ← Read-only tools allowed                          │
│   1.010 ← Write tools → ASK_USER                           │
└─────────────────────────────────────────────────────────────┘
```

### Current Approval Options

When a tool requires confirmation:

| Option                            | What Happens                                   |
| --------------------------------- | ---------------------------------------------- |
| **Allow once**                    | Execute once, no policy created                |
| **Allow for this session**        | In-memory rule at priority 2.95                |
| **Allow for all future sessions** | Writes to `~/.gemini/policies/auto-saved.toml` |

### How Policies Are Stored

**TOML format** in `~/.gemini/policies/`:

```toml
[[rule]]
toolName = "run_shell_command"
decision = "allow"
priority = 100
commandPrefix = "ls -la"  # Only allows commands starting with "ls -la"
```

### Key Files

| File                                                                  | Purpose                         |
| --------------------------------------------------------------------- | ------------------------------- |
| `packages/core/src/policy/policy-engine.ts`                           | Core decision logic             |
| `packages/core/src/policy/config.ts`                                  | Policy loading, dynamic updates |
| `packages/core/src/scheduler/policy.ts`                               | Handles user confirmations      |
| `packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx` | Approval dialog UI              |

---

## Problem Statement

### The Issue

When you select "Allow for this session" for `ls -la /foo`, the system saves
`commandPrefix = "ls -la"`. This is **too narrow**:

```
✓ Allows: ls -la /foo/bar     (same prefix)
✓ Allows: ls -la /other       (same prefix)
✗ Asks again: ls -l /foo      (different flags!)
✗ Asks again: ls /foo         (no flags!)
✗ Asks again: cat file.txt    (different command!)
```

### Root Cause

In `packages/core/src/scheduler/policy.ts`:

```typescript
if (confirmationDetails?.type === 'exec') {
  options.commandPrefix = confirmationDetails.rootCommands; // Too specific!
}
```

### User Pain

A typical session requires approving:

- `ls -la`, `ls -l`, `ls`
- `cat`, `head`, `tail`
- `git status`, `git diff`, `git log`
- ...dozens of variations

**Users think in terms of intent ("allow listing files"), not exact command
strings.**

---

## Proposed Solution

### Smart Scope Selection UI

When approving a command, offer **human-readable scope options** based on
intelligent parsing:

```
┌─────────────────────────────────────────────────────────────┐
│ Allow execution of: 'ls -la /project/src'                   │
├─────────────────────────────────────────────────────────────┤
│ What would you like to allow?                               │
│                                                              │
│   ○ This exact command only                                 │
│   ○ ls -la (any path)                                       │
│   ● ls (any flags, any path)        ← Recommended           │
│   ○ Custom pattern (advanced)                               │
│                                                              │
│ Duration: ○ Once  ● This session  ○ Always                  │
└─────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Parse command structure**: `[command] [flags] [arguments]`
2. **Offer sensible groupings**: Not regex, but human-readable options
3. **Recommend safest broad option**: Based on command classification
4. **Warn for dangerous scopes**: Extra confirmation for destructive commands

---

## Smart Scope Detection

### Approach 1: Heuristic Command Parsing

Parse the command and generate scope options automatically:

```typescript
interface CommandParts {
  binary: string; // "ls"
  flags: string[]; // ["-l", "-a"]
  arguments: string[]; // ["/project/src"]
}

function parseCommand(cmd: string): CommandParts {
  // Handle quoted strings, escaped chars, etc.
  const tokens = tokenize(cmd);
  const binary = tokens[0];
  const flags = tokens.filter((t) => t.startsWith('-'));
  const args = tokens.filter((t) => !t.startsWith('-') && t !== binary);
  return { binary, flags, arguments: args };
}

function generateScopeOptions(parts: CommandParts): ScopeOption[] {
  return [
    {
      label: 'This exact command only',
      pattern: `^${escapeRegex(parts.binary + ' ' + parts.flags.join(' '))}\\b`,
      scope: 'exact',
    },
    {
      label: `${parts.binary} ${parts.flags.join(' ')} (any arguments)`,
      pattern: `^${escapeRegex(parts.binary + ' ' + parts.flags.join(' '))}\\b`,
      scope: 'command-flags',
    },
    {
      label: `${parts.binary} (any flags, any arguments)`,
      pattern: `^${escapeRegex(parts.binary)}\\b`,
      scope: 'command-only',
    },
  ];
}
```

### Approach 2: AI-Assisted Intent Detection

Use the LLM to classify commands and suggest appropriate scopes:

```typescript
interface CommandClassification {
  intent: 'read-only' | 'write' | 'network' | 'destructive' | 'system-admin';
  confidence: number;
  suggestedScope: 'exact' | 'command-flags' | 'command-only' | 'category';
  relatedCommands?: string[]; // For category grouping
  risks?: string[];
}

async function classifyCommand(
  command: string,
): Promise<CommandClassification> {
  // Option A: Use lightweight heuristics first
  const heuristic = heuristicClassify(command);
  if (heuristic.confidence > 0.9) {
    return heuristic;
  }

  // Option B: Ask the model for complex cases
  const response = await model.generate({
    prompt: `Classify this shell command for permission scope:
    Command: ${command}

    Return JSON with:
    - intent: read-only | write | network | destructive | system-admin
    - suggestedScope: how broadly should this be approved?
    - relatedCommands: similar safe commands to group with
    - risks: any security concerns`,
  });

  return parseClassification(response);
}
```

### Approach 3: Pre-Defined Command Categories

Define categories that users can approve as groups:

```typescript
const COMMAND_CATEGORIES = {
  'file-listing': {
    commands: ['ls', 'dir', 'tree', 'find', 'locate'],
    description: 'List and find files',
    intent: 'read-only',
    defaultScope: 'category',
  },
  'file-reading': {
    commands: ['cat', 'head', 'tail', 'less', 'more', 'bat'],
    description: 'Read file contents',
    intent: 'read-only',
    defaultScope: 'category',
  },
  'git-read': {
    commands: ['git status', 'git diff', 'git log', 'git show', 'git branch'],
    description: 'Read-only git operations',
    intent: 'read-only',
    defaultScope: 'category',
  },
  'git-write': {
    commands: ['git add', 'git commit', 'git push', 'git pull', 'git merge'],
    description: 'Git write operations',
    intent: 'write',
    defaultScope: 'command-only', // More cautious
  },
};
```

### Combined Smart UI

Putting it together:

```
┌─────────────────────────────────────────────────────────────┐
│ Allow execution of: 'git diff HEAD~1'                       │
├─────────────────────────────────────────────────────────────┤
│ Detected: Read-only git operation                           │
│                                                              │
│ What would you like to allow?                               │
│                                                              │
│   ○ Just this command                                       │
│   ○ git diff (any arguments)                                │
│   ● All read-only git commands                    [?]       │
│       Includes: status, diff, log, show, branch            │
│   ○ All git commands                                        │
│       ⚠️ Includes write operations (push, commit)           │
│   ○ Custom pattern                                          │
│                                                              │
│ Duration: [This session ▾]                                  │
│                                                              │
│ [Allow] [Reject]                                            │
└─────────────────────────────────────────────────────────────┘
```

The `[?]` shows a tooltip with exactly which commands are included.

---

## Security Considerations

### Existing Shell Safety (Already Implemented!)

**Good news**: The codebase already has robust shell safety using
**tree-sitter** parsers.

#### What Already Exists

From `packages/core/src/utils/shell-utils.ts` and
`packages/core/src/policy/policy-engine.ts`:

1. **`splitCommands()`** - Uses tree-sitter to parse and split compound commands
2. **Recursive validation** - Each sub-command is checked against policies
   separately
3. **`hasRedirection()`** - Detects `>`, `<`, `>>`, `<<<` operators
4. **Parse failure safety** - Returns `ASK_USER` if parsing fails

#### How It Works

```typescript
// In policy-engine.ts checkShellCommand()
const subCommands = splitCommands(command); // Tree-sitter parsing

// Recursively validate each subcommand
for (const rawSubCmd of subCommands) {
  const subResult = await this.check(
    { name: toolName, args: { command: subCmd } },
    serverName,
  );
  // Aggregate: DENY wins, then ASK_USER, then ALLOW
}
```

#### Operators Already Handled

| Operator    | Handling                                     |
| ----------- | -------------------------------------------- |
| `&&`        | Split into separate commands, each validated |
| `\|\|`      | Split into separate commands, each validated |
| `;`         | Split into separate commands, each validated |
| `\|`        | Split into separate commands, each validated |
| `$()`       | Nested command extracted and validated       |
| `` ` ``     | Nested command extracted and validated       |
| `<()` `>()` | Process substitution commands extracted      |
| `>` `>>`    | Detected, downgrades ALLOW to ASK_USER       |

#### Tests Proving This

See `packages/core/src/policy/shell-safety.test.ts`:

```typescript
it('SHOULD NOT allow "git log && rm -rf /"', async () => {
  // Even if "git log" is approved, "rm -rf /" triggers ASK_USER
  const result = await policyEngine.check(toolCall, undefined);
  expect(result.decision).toBe(PolicyDecision.ASK_USER);
});
```

### Additional Security for Scope Selection

Even though operators are handled, we should still restrict broad scopes for
dangerous commands:

```typescript
const EXACT_ONLY_COMMANDS = [
  'rm',
  'rmdir',
  'mv',
  'chmod',
  'chown',
  'chgrp',
  'sudo',
  'su',
  'doas',
  'curl',
  'wget',
  'nc',
  'netcat',
  'ssh',
  'scp',
  'rsync',
  'eval',
  'exec',
  'source',
  'dd',
  'mkfs',
  'fdisk',
  'mount',
  'umount',
  'kill',
  'killall',
  'pkill',
  'reboot',
  'shutdown',
  'halt',
];

function getAllowedScopes(command: string): ScopeOption[] {
  const binary = extractBinary(command);

  if (EXACT_ONLY_COMMANDS.includes(binary)) {
    return ['exact']; // Dangerous commands: exact only
  }

  return ['exact', 'command-flags', 'command-only', 'category'];
}
```

---

## Implementation Plan

Since shell safety already exists, we can focus on the **UX improvement**.

### Phase 1: Core Types & Policy Handler

**Files:**

- `packages/core/src/tools/tools.ts` - Add scope to `ToolConfirmationPayload`
- `packages/core/src/scheduler/policy.ts` - Handle scope in
  `handleStandardPolicyUpdate()`
- `packages/core/src/confirmation-bus/types.ts` - Add scope options to exec
  details

**Changes:**

```typescript
// In tools.ts - ToolConfirmationPayload
export interface ToolConfirmationPayload {
  modifiedContent?: string;
  answers?: { [questionIndex: string]: string };
  scope?: 'exact' | 'command-flags' | 'command-only' | 'custom';  // NEW
  customPattern?: string;  // NEW: for custom scope
}

// In scheduler/policy.ts - handleStandardPolicyUpdate()
async function handleStandardPolicyUpdate(...) {
  if (confirmationDetails?.type === 'exec') {
    const scope = payload?.scope ?? 'exact';  // Default to current behavior

    switch (scope) {
      case 'exact':
        options.commandPrefix = confirmationDetails.rootCommands;
        break;
      case 'command-flags':
        // e.g., "ls -la" -> allows "ls -la *" but not "ls -l"
        options.commandPrefix = confirmationDetails.rootCommands;
        break;
      case 'command-only':
        // e.g., "ls" -> allows "ls *" with any flags
        const binary = extractBinary(confirmationDetails.rootCommand);
        options.argsPattern = `^${escapeRegex(binary)}\\b`;
        break;
      case 'custom':
        options.argsPattern = payload?.customPattern;
        break;
    }
  }
}
```

### Phase 2: Smart Scope Generation

**Files:**

- `packages/core/src/policy/scope-generator.ts` (new)

**Tasks:**

1. Parse command to extract binary, flags, arguments
2. Generate human-readable scope options
3. Detect command category (if applicable)
4. Determine default/recommended scope

```typescript
// New file: scope-generator.ts
export interface ScopeOption {
  id: 'exact' | 'command-flags' | 'command-only' | 'category' | 'custom';
  label: string; // "ls -la (any path)"
  description?: string; // "Allows ls -la with any arguments"
  pattern: string; // Regex pattern for policy
  recommended?: boolean; // Highlight as recommended
  disabled?: boolean; // Grey out for dangerous commands
}

export function generateScopeOptions(
  command: string,
  rootCommand: string,
): ScopeOption[] {
  const parts = parseCommand(rootCommand);
  const options: ScopeOption[] = [];

  // Always offer exact
  options.push({
    id: 'exact',
    label: 'This exact command only',
    pattern: buildArgsPattern(rootCommand),
  });

  // Command with flags (if flags present)
  if (parts.flags.length > 0) {
    const cmdWithFlags = `${parts.binary} ${parts.flags.join(' ')}`;
    options.push({
      id: 'command-flags',
      label: `${cmdWithFlags} (any arguments)`,
      pattern: buildArgsPattern(cmdWithFlags),
    });
  }

  // Command only (any flags)
  if (!EXACT_ONLY_COMMANDS.includes(parts.binary)) {
    options.push({
      id: 'command-only',
      label: `${parts.binary} (any flags, any arguments)`,
      pattern: `^${escapeRegex(parts.binary)}\\b`,
      recommended: isReadOnlyCommand(parts.binary),
    });
  }

  // Category (if command belongs to one)
  const category = findCategory(parts.binary);
  if (category) {
    options.push({
      id: 'category',
      label: `All ${category.description}`,
      description: `Includes: ${category.commands.slice(0, 5).join(', ')}...`,
      pattern: category.pattern,
      recommended: category.intent === 'read-only',
    });
  }

  return options;
}
```

### Phase 3: UI Changes

**Files:**

- `packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx`

**Tasks:**

1. Replace duration options with scope-based options
2. Auto-decide persist (session vs future) based on command intent
3. Show hint about persistence decision
4. Pass selected scope + auto-persist in payload

**Simplified UI Flow (Single Step):**

```
For read-only command (e.g., ls):
┌─────────────────────────────────────────────────────────────┐
│ Allow execution of: 'ls -la /project/src'?                  │
├─────────────────────────────────────────────────────────────┤
│   ls -la /project/src                                       │
│                                                              │
│   ○ Allow once                                              │
│   ● Allow 'ls' (recommended)                                │
│   ○ Allow 'ls -la' (any path)                               │
│   ○ Allow exact command only                                │
│   ○ No, suggest changes                                     │
│                                                              │
│   💡 Will be saved for future sessions                      │
└─────────────────────────────────────────────────────────────┘

For write command (e.g., npm install):
┌─────────────────────────────────────────────────────────────┐
│ Allow execution of: 'npm install lodash'?                   │
├─────────────────────────────────────────────────────────────┤
│   npm install lodash                                        │
│                                                              │
│   ○ Allow once                                              │
│   ● Allow 'npm install' (recommended)                       │
│   ○ Allow 'npm' (any subcommand)                            │
│   ○ Allow exact command only                                │
│   ○ No, suggest changes                                     │
│                                                              │
│   💡 Will apply for this session only                       │
└─────────────────────────────────────────────────────────────┘
```

**Auto-Persist Logic:**

```typescript
function shouldPersist(command: string): boolean {
  const intent = classifyCommand(command).intent;

  switch (intent) {
    case 'read-only':
      return true; // Always want ls, cat, git status
    case 'write':
    case 'network':
    case 'destructive':
    case 'unknown':
    default:
      return false; // More cautious for these
  }
}
```

**Benefits:**

- Single interaction instead of two
- Smart default pre-selected
- User just presses Enter for recommended option
- No need to think about session vs future

### Phase 4: AI Enhancement (Optional)

**Approaches:**

#### A. Heuristic Classification (Recommended First)

```typescript
const COMMAND_INTENT: Record<
  string,
  'read-only' | 'write' | 'network' | 'destructive'
> = {
  // Read-only
  ls: 'read-only',
  cat: 'read-only',
  head: 'read-only',
  tail: 'read-only',
  grep: 'read-only',
  find: 'read-only',
  which: 'read-only',
  'git status': 'read-only',
  'git diff': 'read-only',
  'git log': 'read-only',

  // Write
  'git add': 'write',
  'git commit': 'write',
  'git push': 'write',
  'npm install': 'write',
  'yarn add': 'write',

  // Network
  curl: 'network',
  wget: 'network',
  ssh: 'network',

  // Destructive
  rm: 'destructive',
  rmdir: 'destructive',
  mv: 'destructive',
};

function classifyCommand(command: string): CommandClassification {
  const binary = extractBinary(command);

  // Check exact matches first (e.g., "git status")
  for (const [cmd, intent] of Object.entries(COMMAND_INTENT)) {
    if (command.startsWith(cmd)) {
      return { intent, confidence: 1.0, source: 'heuristic' };
    }
  }

  // Check binary only
  if (COMMAND_INTENT[binary]) {
    return {
      intent: COMMAND_INTENT[binary],
      confidence: 0.9,
      source: 'heuristic',
    };
  }

  return { intent: 'unknown', confidence: 0, source: 'none' };
}
```

#### B. LLM Classification (For Unknown Commands)

```typescript
async function classifyWithLLM(
  command: string,
): Promise<CommandClassification> {
  // Only call LLM for truly unknown commands
  const heuristic = classifyCommand(command);
  if (heuristic.confidence > 0.5) {
    return heuristic;
  }

  // Use a lightweight prompt
  const response = await model.generate({
    prompt: `Classify this shell command's intent (respond with just the category):
Command: ${command}
Categories: read-only, write, network, destructive, system-admin, unknown`,
    maxTokens: 20,
  });

  return {
    intent: parseIntent(response),
    confidence: 0.7,
    source: 'llm',
  };
}
```

#### C. User Feedback Loop

```typescript
// Store classifications for future use
interface ClassificationFeedback {
  command: string;
  userSelectedScope: string;
  timestamp: Date;
}

// Learn from user choices
function learnFromUserChoice(command: string, scope: string) {
  // If user keeps selecting "command-only" for similar commands,
  // suggest that scope by default next time
}
```

---

## Open Questions

1. **AI Classification Cost**: Should we call the LLM for every unknown command,
   or rely on heuristics?
   - **Decision**: Heuristics first, LLM only for truly ambiguous cases
   - Rationale: Most commands can be classified with simple pattern matching

2. **Category Customization**: Should users be able to define their own
   categories?
   - **Proposal**: Yes, in `~/.gemini/policies/categories.toml`
   - Could also support importing community-shared categories

3. **Environment Variables**: Is `$VAR` expansion a risk?
   - **Already Handled**: Tree-sitter parser handles `$()` command substitution
   - Simple `$VAR` expansion is a shell feature, not a security risk in itself

4. **Default Scope Setting**: Should there be a global setting for default
   scope?
   - **Proposal**: Yes, in settings.json:
     `"security.defaultApprovalScope": "command-only"`
   - Power users could set to broader scopes

5. **Migration**: How to handle existing `auto-saved.toml` policies?
   - **Proposal**: Keep working as-is (backward compatible)
   - New policies will use `argsPattern` instead of `commandPrefix` for broader
     scopes

6. **UI Complexity**: Two-step flow (duration then scope) vs single combined UI?
   - **Decision**: Single step with smart auto-persist
   - Scope options replace duration options
   - System auto-decides session vs future based on command intent
   - Read-only commands → persist (future sessions)
   - Write/network/destructive → session only

7. **Compound Commands**: Should we show scope selector for compound commands?
   - **No**: Compound commands are already split and validated separately
   - Each sub-command gets its own approval if needed

---

## Summary

### What's Already Done (Shell Safety)

- Tree-sitter based command parsing
- Recursive validation of compound commands
- Redirection detection
- Parse failure safety

### What We're Adding (UX Improvement)

1. **Scope selection** when approving for session/always
2. **Smart suggestions** based on command classification
3. **Category grouping** for related commands
4. **AI-assisted classification** for unknown commands (optional)

### Key Files to Modify

| File                                               | Change                                         |
| -------------------------------------------------- | ---------------------------------------------- |
| `packages/core/src/tools/tools.ts`                 | Add `scope` to `ToolConfirmationPayload`       |
| `packages/core/src/scheduler/policy.ts`            | Handle scope in `handleStandardPolicyUpdate()` |
| `packages/core/src/policy/scope-generator.ts`      | NEW: Generate scope options                    |
| `packages/cli/src/.../ToolConfirmationMessage.tsx` | Add scope selector UI                          |

---

## Changelog

| Date       | Change                                                                           |
| ---------- | -------------------------------------------------------------------------------- |
| 2026-02-03 | Initial draft with smart scope detection and security considerations             |
| 2026-02-03 | Updated: Shell safety already exists, focus on UX. Added implementation details. |
| 2026-02-03 | Simplified: Single-step UI with auto-persist based on command intent             |
| 2026-02-03 | Implementation started: Core types, scope generator, policy handler, UI updates  |
