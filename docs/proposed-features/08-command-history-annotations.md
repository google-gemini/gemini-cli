# Feature Proposal: Command History with Annotations

## Overview

An enhanced command history system that allows users to search, annotate, bookmark, and share their past interactions with Gemini CLI, turning history into a personal knowledge base.

## Problem Statement

Current command history limitations:
- No easy way to find past successful prompts
- Can't remember what worked well before
- Lose valuable context from previous sessions
- Difficult to share solutions with teammates
- No way to mark favorites or important commands
- Plain text history lacks context and metadata

Users often:
- Retype the same prompts repeatedly
- Forget successful command sequences
- Can't find that "perfect prompt" from last week
- Lose knowledge when switching contexts

## Proposed Solution

Implement an enriched command history system with search, annotations, bookmarks, and organization features that makes past interactions a valuable learning and reference resource.

### Core Features

1. **Rich History Tracking**
   - Full conversation context
   - Timestamps and duration
   - Success/failure indicators
   - Files modified
   - Tools used
   - Tags and categories

2. **Powerful Search & Filtering**
   - Full-text search across prompts and responses
   - Filter by date range, tags, tools, files
   - Search by result type (successful/failed)
   - Fuzzy matching
   - Saved searches

3. **Annotations & Bookmarks**
   - Add notes to history entries
   - Star/bookmark favorites
   - Tag for organization
   - Rate effectiveness
   - Share with team

4. **Smart Reuse**
   - Re-run past commands with one click
   - Adapt prompts with templates
   - Create custom commands from history
   - Export as workflows
   - Share snippets

### Commands

```bash
/history                        # Show recent history
/history search <query>         # Search history
/history show <id>              # Show detailed entry
/history rerun <id>             # Re-run command
/history bookmark <id>          # Bookmark entry
/history bookmarks              # Show bookmarked entries
/history tag <id> <tags>        # Add tags
/history note <id> <note>       # Add annotation
/history export <id>            # Export as custom command
/history share <id>             # Share with team
/history stats                  # Show usage statistics
/history delete <id>            # Delete entry
/history clear                  # Clear all history
```

### User Interface

#### Basic History View

```
$ gemini /history

Recent History (last 10 commands):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⭐ #42 - 2 hours ago (bookmarked)
   "Review my changes and suggest improvements"
   ✓ Success • 3 files modified • 2m 15s
   Tags: code-review, git
   📝 Note: Great for pre-commit reviews

#41 - 3 hours ago
   "Generate unit tests for @src/auth.ts"
   ✓ Success • 1 file created • 1m 32s
   Tags: testing

#40 - 4 hours ago
   "Explain the authentication flow in this codebase"
   ✓ Success • 0 files modified • 45s
   Tools: read_files (5), grep_search (2)

#39 - 5 hours ago
   "Fix the failing tests"
   ✗ Failed • Error: Cannot find test files
   📝 Note: Remember to specify test directory

#38 - 6 hours ago
   "Refactor user controller for better readability"
   ✓ Success • 1 file modified • 3m 8s
   Tags: refactoring

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 /history search <query> to find specific commands
💡 /history bookmarks to see your favorites
```

#### Detailed Entry View

```
$ gemini /history show 42

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
History Entry #42 ⭐
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Timestamp: 2025-01-15 14:30:22
Duration: 2 minutes 15 seconds
Status: ✓ Success

Prompt:
───────────────────────────────────────────────────────────────
Review my changes and suggest improvements
───────────────────────────────────────────────────────────────

Context:
• Working directory: ~/projects/my-app
• Git branch: feature/user-auth
• Uncommitted changes: 15 files

Tools Used:
• run_shell_command - git diff (3 times)
• read_files - Read 8 files
• grep_search - Security patterns (1 time)

Files Modified:
• src/auth.ts
• src/middleware/validate.ts
• tests/auth.test.ts

Response Summary:
Found 3 potential issues and 5 improvement suggestions:
1. Security: Add rate limiting to login endpoint
2. Performance: Cache validation results
3. Testing: Add edge case tests
[... full response available ...]

Tags: code-review, git, security
Bookmarked: Yes
Rating: ⭐⭐⭐⭐⭐ (5/5)

Notes:
───────────────────────────────────────────────────────────────
Great for pre-commit reviews. Always catches issues I miss.
Works best when run from feature branch with staged changes.
───────────────────────────────────────────────────────────────

Actions:
[R] Re-run  [E] Export as command  [S] Share  [C] Copy prompt
[T] Edit tags  [N] Edit note  [D] Delete  [Q] Back

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### Search Interface

```
$ gemini /history search "refactor"

Found 8 entries matching "refactor":
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#38 - 6 hours ago
   "Refactor user controller for better readability"
   ✓ Success • Refactored 120 lines
   Tags: refactoring, clean-code

#35 - 2 days ago
   "Refactor database queries to use ORM"
   ✓ Success • 5 files modified
   Tags: refactoring, database

#28 - 1 week ago
   "Help me refactor this nested callback hell"
   ✓ Success • Converted to async/await
   Tags: refactoring, javascript
   ⭐ Bookmarked

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Filter by:
[T] Tag  [D] Date range  [F] Files  [S] Status  [C] Clear filters
```

#### Bookmarks View

```
$ gemini /history bookmarks

Your Bookmarked Commands:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⭐⭐⭐⭐⭐ Code Review
   #42 "Review my changes and suggest improvements"
   Use: /history rerun 42

⭐⭐⭐⭐⭐ Git Commit Messages
   #31 "Generate commit message from git diff"
   Use: /history rerun 31

⭐⭐⭐⭐ Complex Refactoring
   #28 "Help me refactor this nested callback hell"
   Use: /history rerun 28

⭐⭐⭐⭐ Test Generation
   #22 "Generate comprehensive tests for @src/utils.ts"
   Use: /history rerun 22

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Convert bookmarks to custom commands: /history export <id>
```

#### Statistics View

```
$ gemini /history stats

Usage Statistics (Last 30 Days):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total Commands: 156
Success Rate: 91% (142 successful, 14 failed)
Average Duration: 1m 45s
Most Active Day: Monday (38 commands)

Top Categories:
  1. Code Review      28 commands (18%)
  2. Testing          24 commands (15%)
  3. Refactoring      19 commands (12%)
  4. Documentation    15 commands (10%)
  5. Bug Fixes        12 commands (8%)

Most Used Tools:
  1. read_files       89 times
  2. write_files      67 times
  3. grep_search      45 times
  4. run_shell_command 34 times

Files Most Modified:
  1. src/auth.ts      12 times
  2. src/api/users.ts  8 times
  3. tests/*.test.ts   7 times

Productivity Insights:
  • Your most productive time: 2-4 PM
  • Average commands per day: 5.2
  • Bookmarked commands used: 23 times
  • Repeat commands: 18% (consider creating custom commands)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Data Structure

```typescript
// packages/core/src/history/types.ts
export interface HistoryEntry {
  id: string;                    // Unique identifier
  timestamp: Date;               // When executed
  duration: number;              // Execution time (ms)

  // Command details
  prompt: string;                // User's prompt
  response: string;              // Gemini's response
  context: {
    workingDirectory: string;
    gitBranch?: string;
    uncommittedChanges?: number;
    openFiles?: string[];
  };

  // Execution details
  status: 'success' | 'failed' | 'partial';
  error?: string;
  toolsUsed: ToolUsage[];
  filesModified: string[];
  filesCreated: string[];
  filesDeleted: string[];

  // User additions
  tags: string[];
  bookmarked: boolean;
  rating?: 1 | 2 | 3 | 4 | 5;
  notes: string;

  // Metadata
  sessionId: string;
  checkpointId?: string;
  relatedEntries?: string[];     // IDs of related history entries
}

interface ToolUsage {
  tool: string;
  count: number;
  duration: number;
  successful: boolean;
}
```

### Storage & Indexing

```typescript
// packages/core/src/history/storage.ts
export class HistoryStorage {
  private db: Database;  // SQLite for efficient querying

  async save(entry: HistoryEntry): Promise<void> {
    await this.db.insert('history', entry);
    await this.updateIndex(entry);
  }

  async search(query: SearchQuery): Promise<HistoryEntry[]> {
    let sql = 'SELECT * FROM history WHERE 1=1';
    const params: any[] = [];

    // Full-text search
    if (query.text) {
      sql += ' AND (prompt LIKE ? OR response LIKE ? OR notes LIKE ?)';
      params.push(`%${query.text}%`, `%${query.text}%`, `%${query.text}%`);
    }

    // Filter by tags
    if (query.tags?.length) {
      sql += ` AND tags LIKE ?`;
      params.push(`%${query.tags.join('%')}%`);
    }

    // Filter by date range
    if (query.dateFrom) {
      sql += ' AND timestamp >= ?';
      params.push(query.dateFrom.toISOString());
    }

    // Filter by status
    if (query.status) {
      sql += ' AND status = ?';
      params.push(query.status);
    }

    // Filter by files
    if (query.files?.length) {
      sql += ' AND (filesModified LIKE ? OR filesCreated LIKE ?)';
      const filePattern = `%${query.files.join('%')}%`;
      params.push(filePattern, filePattern);
    }

    // Order by relevance or timestamp
    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(query.limit ?? 100);

    return await this.db.query(sql, params);
  }

  async getBookmarks(): Promise<HistoryEntry[]> {
    return await this.db.query(
      'SELECT * FROM history WHERE bookmarked = 1 ORDER BY rating DESC, timestamp DESC'
    );
  }

  async getStats(dateRange?: DateRange): Promise<HistoryStats> {
    // Aggregate statistics
    const stats = await this.db.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
        AVG(duration) as avgDuration,
        MAX(timestamp) as lastUsed
      FROM history
      WHERE timestamp >= ?
    `, [dateRange?.from ?? new Date(0)]);

    return this.computeStats(stats);
  }
}
```

### Smart Features

```typescript
// packages/core/src/history/analyzer.ts
export class HistoryAnalyzer {
  async detectPatterns(history: HistoryEntry[]): Promise<Pattern[]> {
    // Find repeated prompts
    const patterns: Pattern[] = [];

    const promptCounts = new Map<string, number>();
    for (const entry of history) {
      const normalized = this.normalizePrompt(entry.prompt);
      promptCounts.set(normalized, (promptCounts.get(normalized) ?? 0) + 1);
    }

    // Suggest custom commands for repeated prompts
    for (const [prompt, count] of promptCounts) {
      if (count >= 3) {
        patterns.push({
          type: 'repeated-prompt',
          prompt,
          count,
          suggestion: `Create custom command: this prompt was used ${count} times`
        });
      }
    }

    // Find successful sequences
    const sequences = this.findSequences(history);
    for (const seq of sequences) {
      if (seq.length >= 3 && seq.every(e => e.status === 'success')) {
        patterns.push({
          type: 'successful-sequence',
          entries: seq,
          suggestion: 'Create workflow from this sequence'
        });
      }
    }

    return patterns;
  }

  async suggestTags(entry: HistoryEntry): Promise<string[]> {
    const suggestions: string[] = [];

    // Based on prompt keywords
    const keywords = {
      'test': ['testing'],
      'refactor': ['refactoring'],
      'bug': ['debugging', 'bug-fix'],
      'review': ['code-review'],
      'commit': ['git'],
      'deploy': ['deployment']
    };

    for (const [keyword, tags] of Object.entries(keywords)) {
      if (entry.prompt.toLowerCase().includes(keyword)) {
        suggestions.push(...tags);
      }
    }

    // Based on files modified
    if (entry.filesModified.some(f => f.includes('test'))) {
      suggestions.push('testing');
    }

    // Based on tools used
    if (entry.toolsUsed.some(t => t.tool === 'run_shell_command')) {
      suggestions.push('automation');
    }

    return [...new Set(suggestions)]; // Deduplicate
  }
}
```

### Export & Share

```typescript
// packages/core/src/history/exporter.ts
export class HistoryExporter {
  async exportAsCustomCommand(
    entry: HistoryEntry,
    commandName: string
  ): Promise<void> {
    const command = {
      name: commandName,
      description: entry.notes || 'Exported from history',
      prompt: entry.prompt,
      tags: entry.tags
    };

    await this.saveCustomCommand(command);
  }

  async exportAsWorkflow(entries: HistoryEntry[]): Promise<void> {
    const workflow = {
      name: 'Exported Workflow',
      steps: entries.map(e => ({
        name: this.generateStepName(e),
        type: 'prompt',
        message: e.prompt
      }))
    };

    await this.saveWorkflow(workflow);
  }

  async shareEntry(entry: HistoryEntry): Promise<string> {
    // Generate shareable link or export file
    const exported = {
      prompt: entry.prompt,
      tags: entry.tags,
      notes: entry.notes,
      rating: entry.rating,
      context: {
        tools: entry.toolsUsed.map(t => t.tool),
        files: entry.filesModified
      }
    };

    // Save to file or upload to sharing service
    const shareId = await this.uploadToShareService(exported);
    return `https://gemini-cli.com/shared/${shareId}`;
  }
}
```

## User Benefits

### Knowledge Retention
- Never lose a good prompt again
- Build personal command library
- Learn from past successes
- Avoid repeating mistakes

### Productivity
- Quick access to frequent commands
- No retyping successful prompts
- Faster task execution
- Less trial and error

### Learning & Improvement
- Review what works well
- Analyze patterns in usage
- Discover underutilized features
- Share knowledge with team

### Collaboration
- Share effective prompts
- Build team knowledge base
- Standardize common tasks
- Learn from teammates

## Technical Implementation

### Directory Structure
```
packages/core/src/history/
├── index.ts                # History manager
├── storage.ts             # Database operations
├── search.ts              # Search engine
├── analyzer.ts            # Pattern detection
├── exporter.ts            # Export & share
├── annotations.ts         # Tags, notes, bookmarks
└── migrations/
    └── 001-initial.sql    # Database schema
```

## Integration Points

### With Existing Features
- **Custom Commands**: Export history as commands
- **Checkpointing**: Link history to checkpoints
- **Memory**: Add history context to memory

### With Proposed Features
- **Workflows**: Convert sequences to workflows
- **Examples**: Mark history as examples
- **Learning Path**: Award XP for using history features

## Success Metrics

- History feature usage rate
- Bookmark/annotation usage
- Commands exported from history
- Search effectiveness
- Repeat command reduction
- User productivity improvement

## Implementation Phases

### Phase 1: Core Storage (2 weeks)
- Database schema
- Basic CRUD operations
- Simple history view
- Search functionality

### Phase 2: Annotations (2 weeks)
- Bookmarking
- Tagging
- Notes
- Ratings

### Phase 3: Smart Features (2 weeks)
- Pattern detection
- Auto-tagging
- Statistics
- Analytics

### Phase 4: Export & Share (1 week)
- Export as custom commands
- Export as workflows
- Share functionality
- Import shared history

## Privacy Considerations

- All history stored locally by default
- Opt-in for cloud sync
- Sensitive data filtering
- Export controls
- Deletion capabilities

## Open Questions

1. Cloud sync for history across devices?
2. Team shared history repository?
3. History size limits and archiving?
4. Integration with shell history?

## Resources Required

- **Development**: 1-2 engineers, 7 weeks
- **Database**: SQLite schema design
- **Testing**: Performance testing with large history
- **Documentation**: Usage guides

## Alternatives Considered

1. **Plain Text Log**: No structure, hard to search
2. **Shell History Integration**: Too limited
3. **External Note-taking**: Context switching

## Related Work

- Shell history (bash, zsh)
- GitHub command palette
- VS Code command history
- Obsidian (note-taking with linking)

## Future Enhancements

- AI-powered search (semantic)
- History visualization (timeline, graphs)
- Collaborative history (team shared)
- History analytics dashboard
- Integration with project management tools

## Conclusion

Command History with Annotations transforms Gemini CLI usage history from a forgotten log into a valuable personal knowledge base. By making it easy to search, organize, and reuse past successes, we significantly improve long-term productivity and learning.

**Recommendation**: Medium priority. This feature provides compounding value over time and appeals to power users who want to build their own library of effective prompts and workflows.
