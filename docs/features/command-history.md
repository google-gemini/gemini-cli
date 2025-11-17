# Command History

Search and manage your command history with powerful annotations and analytics.

## Overview

Command History automatically tracks all your Gemini CLI commands and provides powerful search, filtering, and annotation capabilities.

## Viewing History

**List recent commands:**
```
/history list
/history list 50  # Show 50 entries
```

**Search commands:**
```
/history search npm
/history search "git commit"
```

**Show command details:**
```
/history show 123
```

## Annotations

### Tags

Organize commands with tags:
```
/history tag 123 important
/history tag 123 bug-fix
/history untag 123 temp
```

Search by tags:
```
/history search  # Then filter by tags in results
```

### Bookmarks

Mark important commands:
```
/history bookmark 123
/history unbookmark 123
```

### Ratings

Rate commands (1-5 stars):
```
/history rate 123 5
```

### Notes

Add notes to commands:
```
/history note 123 This fixed the authentication issue
```

## Statistics

View detailed analytics:
```
/history stats
```

Shows:
- Total commands
- Success rate
- Average duration
- Top commands
- Top tags
- Bookmarked/tagged counts

## Pattern Detection

Identify frequently used commands:
```
/history patterns
```

Shows:
- Command frequency
- Average duration
- Success rate
- Last used time

## Export

Export your history in multiple formats:

**JSON:**
```
/history export json history.json
```

**CSV:**
```
/history export csv history.csv
```

**Markdown:**
```
/history export markdown history.md
```

## Search Filters

History search supports multiple filters:
- Text search (command, args, output, notes)
- Tags
- Bookmarked status
- Success/error/cancelled status
- Rating (minimum)
- Date range
- Working directory

## Use Cases

### Track Successful Commands
Find commands that worked:
```
/history search <keyword>
```
Look for success status.

### Document Workflows
1. Run commands
2. Bookmark successful ones
3. Add notes explaining why they worked
4. Export for documentation

### Learn from Errors
1. Check failed commands
2. Add notes about fixes
3. Tag with problem type
4. Review patterns

### Find Frequent Commands
```
/history patterns
```
Create aliases or workflows for common patterns.

## Tips

1. Tag commands immediately after success
2. Bookmark complex commands for later reference
3. Add notes to document why commands worked
4. Export history regularly for backup
5. Use patterns to identify optimization opportunities
6. Rate commands to remember what works best
