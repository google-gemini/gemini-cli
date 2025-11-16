# Feature Proposal: Smart Command Suggestions

## Overview

An intelligent suggestion system that provides context-aware recommendations for commands, prompts, and workflows based on the current state, user history, and common patterns.

## Problem Statement

Users often don't know:
- Which command or tool would be most effective for their task
- The most efficient way to phrase prompts
- What shortcuts or features could save them time
- Which slash commands are relevant to their current context
- How others have solved similar problems

This leads to:
- Suboptimal command usage
- Trial and error with prompts
- Missed opportunities for efficiency
- Underutilization of advanced features

## Proposed Solution

Implement a smart suggestion engine that proactively offers relevant commands, prompts, and workflows based on:
- Current context (files, directories, git state)
- User behavior patterns
- Task similarity matching
- Best practices from the community

### Core Features

1. **Context-Aware Suggestions**
   - Analyze current workspace state
   - Detect common patterns (git repo, package.json, test files)
   - Suggest relevant commands automatically
   - Show inline suggestions as you type

2. **Auto-complete for Commands**
   - Fuzzy matching for slash commands
   - Parameter suggestions
   - File path completion
   - Command history integration

3. **Prompt Improvement Suggestions**
   - Suggest more specific/effective prompts
   - Recommend adding context (files, documentation)
   - Offer alternative phrasings
   - Warn about potentially unclear requests

4. **Smart Workflow Recommendations**
   - Detect multi-step tasks
   - Suggest relevant workflows
   - Offer to create custom workflow from pattern
   - Learn from user behavior

### User Interface

#### Inline Suggestions (as you type)

```
$ gemini /che

  /checkpoint          Save or restore conversation state
  /chat               Manage conversation sessions

  ↑↓ Navigate  ⏎ Select  ⎋ Cancel

$ gemini /checkpoint sa

  /checkpoint save     Save current conversation

  Recent checkpoints:
    feature-work       2 hours ago
    bug-investigation  1 day ago
```

#### Context-Based Suggestions

```
$ gemini

Workspace detected: Node.js project with failing tests

💡 Suggested actions:

  1. Fix failing tests
     → "Run the test suite and fix any failing tests"

  2. Review test coverage
     → "Analyze test coverage and suggest areas that need more tests"

  3. Debug specific test
     → "Help me debug the failing authentication tests"

  Type /suggestions hide to dismiss
```

#### Git Context Suggestions

```
$ gemini

Git repository detected with uncommitted changes (15 files)

💡 Quick actions:

  /examples run generate-commit-message
  → Generate commit message from staged changes

  /workflow run code-review
  → Review changes before committing

  → "Review my changes and identify potential issues"

  Based on your changes to authentication code, you might also want:
  • Review security implications
  • Update related tests
  • Check API documentation
```

#### Prompt Improvement Suggestions

```
$ gemini optimize this code

⚠️ Suggestion: Your prompt could be more specific

Consider adding:
  ✓ Which file/function to optimize
  ✓ What aspect to optimize (speed, memory, readability)
  ✓ Any constraints or requirements

Suggested prompt:
→ "Optimize the authenticateUser function in @src/auth.ts for speed
   without sacrificing security. Focus on reducing database queries."

[Enter] Use suggested prompt  [⎋] Continue with original
```

#### Learning Suggestions

```
$ gemini /memory show

💡 Did you know?

You use /memory show frequently. You can add an alias:
  /settings alias add mem "/memory show"

Then just type: gemini mem

[+] Add this alias  [x] Dismiss  [?] Learn more
```

### Suggestion Categories

#### 1. Command Suggestions
```typescript
interface CommandSuggestion {
  type: 'command';
  command: string;
  description: string;
  reason: string;
  confidence: number;
  example?: string;
}

// Example
{
  type: 'command',
  command: '/workflow run setup-new-feature',
  description: 'Set up a new feature branch with tests',
  reason: 'You recently created several feature branches manually',
  confidence: 0.85,
  example: '/workflow run setup-new-feature --feature-name=user-settings'
}
```

#### 2. Prompt Suggestions
```typescript
interface PromptSuggestion {
  type: 'prompt';
  prompt: string;
  description: string;
  context: string[];
  tags: string[];
}

// Example
{
  type: 'prompt',
  prompt: 'Review this code for security vulnerabilities: @src/auth.ts',
  description: 'Security review for authentication code',
  context: ['@src/auth.ts', 'OWASP guidelines'],
  tags: ['security', 'code-review']
}
```

#### 3. Workflow Suggestions
```typescript
interface WorkflowSuggestion {
  type: 'workflow';
  workflowId: string;
  name: string;
  reason: string;
  estimatedTime: string;
  autoTrigger?: boolean;
}

// Example
{
  type: 'workflow',
  workflowId: 'debug-bug',
  name: 'Bug Investigation Workflow',
  reason: 'Error detected in console output',
  estimatedTime: '5-10 minutes',
  autoTrigger: false
}
```

#### 4. Learning Suggestions
```typescript
interface LearningSuggestion {
  type: 'learning';
  feature: string;
  benefit: string;
  difficulty: 'easy' | 'medium' | 'hard';
  resources: string[];
}

// Example
{
  type: 'learning',
  feature: 'MCP Server Integration',
  benefit: 'Connect to GitHub, Slack, databases, and more',
  difficulty: 'medium',
  resources: [
    '/tutorial start mcp',
    '/examples show mcp-github',
    'docs/extensions/mcp.md'
  ]
}
```

### Suggestion Engine Logic

```typescript
// packages/core/src/suggestions/engine.ts
export class SuggestionEngine {
  async getSuggestions(context: Context): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    // Context-based suggestions
    suggestions.push(...await this.getContextSuggestions(context));

    // Pattern-based suggestions
    suggestions.push(...await this.getPatternSuggestions(context));

    // Learning suggestions
    suggestions.push(...await this.getLearningSuggestions(context));

    // Filter and rank
    return this.rankSuggestions(suggestions, context);
  }

  private async getContextSuggestions(
    context: Context
  ): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    // Git repository context
    if (context.isGitRepo) {
      if (context.hasUncommittedChanges) {
        suggestions.push({
          type: 'workflow',
          workflowId: 'generate-commit-message',
          reason: 'Uncommitted changes detected',
          confidence: 0.9
        });
      }

      if (context.hasConflicts) {
        suggestions.push({
          type: 'prompt',
          prompt: 'Help me resolve git merge conflicts',
          reason: 'Merge conflicts detected',
          confidence: 0.95
        });
      }
    }

    // Package.json context (Node.js project)
    if (context.hasPackageJson) {
      if (context.hasFailingTests) {
        suggestions.push({
          type: 'workflow',
          workflowId: 'debug-tests',
          reason: 'Failing tests detected',
          confidence: 0.9
        });
      }

      if (context.hasOutdatedDeps) {
        suggestions.push({
          type: 'prompt',
          prompt: 'Review outdated dependencies and suggest safe updates',
          reason: 'Outdated dependencies found',
          confidence: 0.75
        });
      }
    }

    // Error logs context
    if (context.hasRecentErrors) {
      suggestions.push({
        type: 'workflow',
        workflowId: 'debug-bug',
        reason: 'Recent error logs detected',
        confidence: 0.85
      });
    }

    return suggestions;
  }

  private async getPatternSuggestions(
    context: Context
  ): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    const history = await this.getUserHistory();

    // Detect repetitive patterns
    const patterns = this.detectPatterns(history);

    for (const pattern of patterns) {
      if (pattern.count >= 3) {
        suggestions.push({
          type: 'learning',
          feature: 'Custom Command',
          benefit: `Create a shortcut for: "${pattern.prompt}"`,
          difficulty: 'easy',
          action: () => this.offerCustomCommand(pattern)
        });
      }
    }

    // Time-based suggestions
    if (this.isMonday(context.time)) {
      suggestions.push({
        type: 'prompt',
        prompt: 'Review my weekly goals and suggest priorities',
        reason: 'Monday morning productivity',
        confidence: 0.6
      });
    }

    return suggestions;
  }

  private rankSuggestions(
    suggestions: Suggestion[],
    context: Context
  ): Suggestion[] {
    return suggestions
      .sort((a, b) => {
        // Sort by confidence, recency, and relevance
        const scoreA = this.calculateScore(a, context);
        const scoreB = this.calculateScore(b, context);
        return scoreB - scoreA;
      })
      .slice(0, 5); // Top 5 suggestions
  }

  private calculateScore(
    suggestion: Suggestion,
    context: Context
  ): number {
    let score = suggestion.confidence ?? 0.5;

    // Boost based on context relevance
    if (suggestion.type === 'workflow' && context.isGitRepo) {
      score *= 1.2;
    }

    // Boost based on user level
    if (suggestion.difficulty === 'easy' && context.userLevel < 2) {
      score *= 1.3;
    }

    // Reduce for recently dismissed suggestions
    if (this.wasRecentlyDismissed(suggestion)) {
      score *= 0.3;
    }

    return score;
  }
}
```

### Context Detection

```typescript
// packages/core/src/suggestions/context.ts
export class ContextDetector {
  async detectContext(): Promise<Context> {
    const cwd = process.cwd();

    return {
      // Git
      isGitRepo: await this.isGitRepository(cwd),
      hasUncommittedChanges: await this.hasUncommittedChanges(cwd),
      hasConflicts: await this.hasMergeConflicts(cwd),
      currentBranch: await this.getCurrentBranch(cwd),

      // Project type
      hasPackageJson: await this.fileExists('package.json'),
      hasPyProject: await this.fileExists('pyproject.toml'),
      hasCargoToml: await this.fileExists('Cargo.toml'),

      // Project state
      hasFailingTests: await this.detectFailingTests(cwd),
      hasOutdatedDeps: await this.detectOutdatedDeps(cwd),
      hasRecentErrors: await this.detectRecentErrors(cwd),

      // User context
      userLevel: await this.getUserLevel(),
      recentCommands: await this.getRecentCommands(10),
      currentTime: new Date(),

      // Files
      openFiles: await this.getOpenFiles(),
      recentFiles: await this.getRecentFiles(),
    };
  }

  private async hasUncommittedChanges(cwd: string): Promise<boolean> {
    const result = await exec('git status --porcelain', { cwd });
    return result.stdout.trim().length > 0;
  }

  private async detectFailingTests(cwd: string): Promise<boolean> {
    // Check for test failure indicators
    // Could parse test output, check CI status, etc.
    return false; // Implementation depends on test framework
  }
}
```

### Auto-complete Implementation

```typescript
// packages/cli/src/input/autocomplete.ts
export class AutocompleteProvider {
  async getSuggestions(
    input: string,
    cursorPosition: number
  ): Promise<AutocompleteSuggestion[]> {
    const beforeCursor = input.slice(0, cursorPosition);

    // Slash command completion
    if (beforeCursor.startsWith('/')) {
      return this.getCommandCompletions(beforeCursor);
    }

    // File path completion
    if (beforeCursor.includes('@')) {
      return this.getFileCompletions(beforeCursor);
    }

    // Custom command completion
    if (beforeCursor.match(/^[\w-]+$/)) {
      return this.getCustomCommandCompletions(beforeCursor);
    }

    return [];
  }

  private async getCommandCompletions(
    input: string
  ): Promise<AutocompleteSuggestion[]> {
    const commands = await this.getAllCommands();
    const query = input.slice(1); // Remove leading /

    return commands
      .filter(cmd =>
        cmd.name.startsWith(query) ||
        this.fuzzyMatch(cmd.name, query)
      )
      .map(cmd => ({
        text: `/${cmd.name}`,
        description: cmd.description,
        category: 'command'
      }));
  }

  private async getFileCompletions(
    input: string
  ): Promise<AutocompleteSuggestion[]> {
    const atIndex = input.lastIndexOf('@');
    const path = input.slice(atIndex + 1);

    const files = await this.findMatchingFiles(path);

    return files.map(file => ({
      text: `@${file}`,
      description: this.getFileDescription(file),
      category: 'file'
    }));
  }

  private fuzzyMatch(text: string, query: string): boolean {
    // Simple fuzzy matching
    let i = 0;
    for (const char of query) {
      i = text.indexOf(char, i);
      if (i === -1) return false;
      i++;
    }
    return true;
  }
}
```

## User Benefits

### Discoverability
- Learn features organically through suggestions
- Discover shortcuts and best practices
- Understand context-relevant capabilities

### Efficiency
- Faster command entry with autocomplete
- Reduce typing with smart suggestions
- Quick access to common workflows

### Better Results
- More effective prompts through guidance
- Avoid common mistakes
- Learn from community best practices

### Reduced Friction
- Less context switching to documentation
- Inline help when needed
- Progressive feature discovery

## Technical Implementation

### Directory Structure
```
packages/core/src/suggestions/
├── index.ts                 # Main suggestion engine
├── engine.ts               # Suggestion logic
├── context-detector.ts     # Workspace context analysis
├── pattern-matcher.ts      # User pattern detection
├── ranker.ts              # Suggestion scoring/ranking
├── providers/
│   ├── command-provider.ts
│   ├── prompt-provider.ts
│   ├── workflow-provider.ts
│   └── learning-provider.ts
└── data/
    ├── suggestion-rules.ts
    └── best-practices.ts

packages/cli/src/input/
├── autocomplete.ts         # Autocomplete logic
└── suggestion-ui.ts        # Suggestion display
```

## Integration Points

### With Existing Features
- **Command System**: Suggest relevant slash commands
- **Custom Commands**: Detect patterns, offer to create commands
- **Workflows**: Suggest workflows based on task
- **Examples**: Link to relevant examples
- **Memory**: Suggest adding important context to memory

### With Proposed Features
- **Tutorial**: Suggest tutorial modules
- **Learning Path**: Award XP for using suggestions
- **Playground**: Suggest challenges based on activity

## Success Metrics

- Suggestion acceptance rate (% of suggestions used)
- Feature discovery rate increase
- Command entry speed improvement
- Prompt effectiveness (measured by retries)
- User satisfaction with suggestions
- Reduction in help command usage

## Implementation Phases

### Phase 1: Basic Autocomplete (2 weeks)
- Command autocomplete
- File path completion
- Simple fuzzy matching

### Phase 2: Context Detection (3 weeks)
- Git context detection
- Project type detection
- Error/test detection
- Basic context suggestions

### Phase 3: Smart Suggestions (3 weeks)
- Pattern detection
- Workflow suggestions
- Prompt improvement
- Learning suggestions

### Phase 4: ML Enhancement (Future)
- Learn from user feedback
- Personalized suggestions
- Community pattern mining
- Predictive suggestions

## Privacy Considerations

- All suggestion data stored locally
- No user data sent to servers (unless opted in)
- Pattern detection runs locally
- Opt-out available for all suggestions

## Open Questions

1. Should suggestions use LLM for improvement analysis?
2. How to balance helpfulness vs. intrusiveness?
3. Allow community-contributed suggestion rules?
4. Sync suggestions preferences across devices?

## Resources Required

- **Development**: 1-2 engineers, 8 weeks
- **UX Design**: Suggestion UI/UX design
- **Testing**: A/B testing for suggestion effectiveness
- **Data**: Curate best practice patterns

## Alternatives Considered

1. **No Suggestions**: Users must discover everything manually
2. **Static Help**: Less contextual, not interactive
3. **LLM-Only**: Too slow, requires API calls

## Related Work

- GitHub Copilot (code completion)
- VS Code IntelliSense
- Fish shell (command suggestions)
- Zsh autosuggestions

## Future Enhancements

- Machine learning for personalization
- Community suggestion marketplace
- Integration with IDE suggestions
- Voice-based suggestions
- Predictive task completion

## Conclusion

Smart Command Suggestions bridges the gap between novice and expert users by providing contextual, intelligent recommendations at the right time. This feature makes Gemini CLI more discoverable, efficient, and user-friendly.

**Recommendation**: High priority for improving user experience. This feature complements all other proposed features and significantly reduces learning curve while improving productivity for all users.
