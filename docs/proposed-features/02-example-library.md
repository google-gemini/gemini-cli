# Feature Proposal: Example Library with Searchable Use Cases

## Overview

A built-in, searchable library of real-world examples and use cases that users can browse, search, run, and adapt for their own needs. This feature makes it easy for new users to discover what's possible and get started quickly.

## Problem Statement

New users struggle with:
- Not knowing what tasks Gemini CLI can help with
- Difficulty translating their needs into effective prompts
- Lack of concrete, runnable examples
- Time wasted crafting prompts from scratch
- Missing advanced features they don't know exist

## Proposed Solution

Implement a comprehensive example library accessible via `/examples` that provides categorized, searchable, and executable examples.

### Core Features

1. **Searchable Database**
   - Full-text search across examples
   - Tag-based filtering
   - Category browsing
   - Difficulty level filtering (Beginner/Intermediate/Advanced)

2. **Rich Example Metadata**
   - Title and description
   - Category and tags
   - Required tools/permissions
   - Estimated execution time
   - Difficulty level
   - Example input/output

3. **Interactive Execution**
   - Run examples directly
   - Preview before running
   - Adapt examples with prompts
   - Save as custom commands

### Commands

```bash
/examples                           # Browse all examples
/examples search <query>            # Search examples
/examples category <name>           # Filter by category
/examples tag <tag>                 # Filter by tag
/examples show <id>                 # Show example details
/examples run <id>                  # Run example directly
/examples save <id> <command-name>  # Save as custom command
/examples featured                  # Show curated featured examples
/examples random                    # Show random example
```

### Example Categories

1. **Code Understanding** (15+ examples)
   - Explain codebase architecture
   - Find security vulnerabilities
   - Generate API documentation
   - Identify code smells

2. **Development Tasks** (20+ examples)
   - Write unit tests
   - Refactor code
   - Generate boilerplate
   - Create git commit messages

3. **File Operations** (15+ examples)
   - Batch rename files
   - Combine CSV files
   - Convert between formats
   - Organize downloads folder

4. **Data Analysis** (10+ examples)
   - Parse log files
   - Extract data from PDFs
   - Analyze CSV data
   - Generate reports

5. **Automation** (12+ examples)
   - Automated git workflows
   - Project setup scripts
   - Deployment automation
   - Batch image processing

6. **Learning & Documentation** (10+ examples)
   - Generate tutorials
   - Create README files
   - Document APIs
   - Code review assistance

### Example Structure

```json
{
  "id": "rename-photos-by-content",
  "title": "Rename Photos Based on AI-Detected Content",
  "description": "Automatically rename photos in a directory based on what Gemini sees in them",
  "category": "file-operations",
  "tags": ["images", "multimodal", "batch-processing", "automation"],
  "difficulty": "beginner",
  "estimated_time": "2-5 minutes",
  "required_tools": ["read_files", "write_files"],
  "required_permissions": ["file-write"],
  "example_prompt": "Look at all images in ./vacation-photos/ and rename them based on what you see. Use descriptive names like 'beach-sunset.jpg' or 'mountain-hike.jpg'",
  "expected_outcome": "Photos renamed with descriptive AI-generated names",
  "tips": [
    "Review the suggested names before confirming",
    "Works best with JPG and PNG formats",
    "Can process 50+ images in one run"
  ],
  "related_examples": ["batch-image-resize", "extract-text-from-images"],
  "documentation_links": ["docs/tools/file-system.md", "docs/get-started/examples.md"]
}
```

### User Interface Mockup

```
$ gemini /examples search "git"

Found 8 examples matching "git":

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 generate-commit-message (Beginner)
   Generate meaningful git commit messages from staged changes
   Tags: git, automation, development
   ⏱ 1 min

💡 Try: /examples run generate-commit-message
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 explain-git-diff (Beginner)
   Explain what changed in a git diff in plain English
   Tags: git, learning, code-review
   ⏱ 2 min

💡 Try: /examples run explain-git-diff
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 interactive-rebase-helper (Advanced)
   Guide through complex interactive git rebases safely
   Tags: git, advanced, workflow
   ⏱ 10 min
   ⚠️ Requires: git repository

💡 Try: /examples show interactive-rebase-helper
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use /examples show <id> for details
Use /examples run <id> to execute
```

### Example Detail View

```
$ gemini /examples show rename-photos-by-content

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📸 Rename Photos Based on AI-Detected Content
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Automatically rename photos in a directory based on what Gemini
sees in them using multimodal vision capabilities.

Category: File Operations
Difficulty: ⭐ Beginner
Time: 2-5 minutes
Tools: read_files, write_files

Example Prompt:
───────────────────────────────────────────────────────────────
Look at all images in ./vacation-photos/ and rename them based
on what you see. Use descriptive names like 'beach-sunset.jpg'
or 'mountain-hike.jpg'
───────────────────────────────────────────────────────────────

Expected Outcome:
• Photos renamed with descriptive AI-generated names
• Preserves original file extensions
• Creates backup list of original names

Tips:
• Review suggested names before confirming
• Works best with JPG and PNG formats
• Can process 50+ images in one run

Related Examples:
• batch-image-resize
• extract-text-from-images
• organize-downloads-folder

Commands:
/examples run rename-photos-by-content     Run this example
/examples save rename-photos-by-content    Save as custom command

Documentation:
📖 docs/tools/file-system.md
📖 docs/get-started/examples.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## User Benefits

### Discovery
- Learn what's possible without reading extensive docs
- Get inspired by real-world use cases
- Discover features organically through examples

### Productivity
- Copy and adapt working examples
- Reduce time from idea to execution
- Avoid common pitfalls with proven patterns

### Education
- Learn by example (most effective learning method)
- Understand prompt engineering best practices
- See tool combinations in action

## Technical Implementation

### Directory Structure
```
packages/core/src/examples/
├── index.ts                 # Example library engine
├── registry.ts              # Example registry
├── examples/
│   ├── code-understanding/
│   │   ├── explain-architecture.json
│   │   └── find-vulnerabilities.json
│   ├── development/
│   │   ├── write-tests.json
│   │   └── generate-commits.json
│   ├── file-operations/
│   │   ├── rename-photos.json
│   │   └── combine-csvs.json
│   └── ...
├── search.ts                # Search and filtering
├── runner.ts                # Example execution
└── templates.ts             # Example templates
```

### Example Registry

```typescript
// packages/core/src/examples/registry.ts
export interface Example {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: string;
  requiredTools: string[];
  requiredPermissions: string[];
  examplePrompt: string;
  expectedOutcome: string;
  tips: string[];
  relatedExamples: string[];
  documentationLinks: string[];
  featured?: boolean;
}

export class ExampleRegistry {
  private examples: Map<string, Example>;

  search(query: string): Example[];
  filterByCategory(category: string): Example[];
  filterByTag(tag: string): Example[];
  filterByDifficulty(level: string): Example[];
  getFeatured(): Example[];
  getRandom(): Example;
}
```

### Search Implementation

```typescript
// packages/core/src/examples/search.ts
export class ExampleSearch {
  // Full-text search across title, description, tags
  searchFullText(query: string): Example[] {
    // Use simple string matching or Fuse.js for fuzzy search
  }

  // Multi-criteria filtering
  filter(criteria: {
    category?: string;
    tags?: string[];
    difficulty?: string;
    tools?: string[];
  }): Example[] {
    // Combine filters with AND logic
  }

  // Suggest related examples
  getRelated(exampleId: string, limit: number = 3): Example[] {
    // Based on shared tags and category
  }
}
```

### Example Runner

```typescript
// packages/core/src/examples/runner.ts
export class ExampleRunner {
  async run(exampleId: string, options?: {
    dryRun?: boolean;
    interactive?: boolean;
    customize?: boolean;
  }): Promise<void> {
    const example = registry.get(exampleId);

    // Check permissions and tools
    await this.checkRequirements(example);

    // Show preview if requested
    if (options?.interactive) {
      await this.showPreview(example);
      const confirmed = await this.confirm();
      if (!confirmed) return;
    }

    // Allow customization
    if (options?.customize) {
      const customPrompt = await this.customizePrompt(example);
      await this.execute(customPrompt);
    } else {
      await this.execute(example.examplePrompt);
    }
  }

  async saveAsCommand(exampleId: string, commandName: string): Promise<void> {
    // Convert example to custom command
    // Save to ~/.gemini/commands/ or .gemini/commands/
  }
}
```

## Integration Points

### With Existing Features
- **Help System**: Link from `/help` to featured examples
- **Custom Commands**: One-click save as custom command
- **Documentation**: Deep links to relevant docs
- **Telemetry**: Track most popular examples
- **First Run**: Suggest examples on first launch

### With Tutorial System
- Tutorial modules reference specific examples
- Examples marked as "tutorial-friendly"
- Progressive disclosure based on tutorial progress

## Success Metrics

- Example usage rate (% of users who use examples)
- Search effectiveness (% searches with results)
- Example-to-command conversion rate
- Time saved (before/after implementation)
- Feature discovery rate improvement

## Sample Examples

### Example 1: Generate Commit Message
```json
{
  "id": "generate-commit-message",
  "title": "Generate Git Commit Message from Diff",
  "description": "Create meaningful commit messages automatically based on staged changes",
  "category": "development",
  "tags": ["git", "automation", "development"],
  "difficulty": "beginner",
  "estimatedTime": "1 minute",
  "requiredTools": ["run_shell_command"],
  "requiredPermissions": [],
  "examplePrompt": "Look at my git staged changes and write a clear, concise commit message following conventional commits format",
  "expectedOutcome": "Well-formatted commit message ready to use",
  "tips": [
    "Stage your changes first with 'git add'",
    "Review the message before committing",
    "Works with conventional commits format"
  ]
}
```

### Example 2: Explain Codebase
```json
{
  "id": "explain-codebase-architecture",
  "title": "Explain Repository Architecture",
  "description": "Get a high-level overview of how a codebase is organized",
  "category": "code-understanding",
  "tags": ["learning", "documentation", "architecture"],
  "difficulty": "beginner",
  "estimatedTime": "3-5 minutes",
  "requiredTools": ["read_files", "list_directory"],
  "requiredPermissions": ["directory-read"],
  "examplePrompt": "Analyze this repository structure and explain: 1) Overall architecture, 2) Main components and their purposes, 3) How data flows through the system, 4) Entry points for new developers",
  "expectedOutcome": "Comprehensive architecture overview",
  "tips": [
    "Works best when run from project root",
    "Add @README.md for more context",
    "Ask follow-up questions for deeper understanding"
  ]
}
```

## Implementation Phases

### Phase 1: MVP (2 weeks)
- Core example registry with 20 examples
- Basic search and browse commands
- Simple execution
- Categories: Development, File Operations

### Phase 2: Enhanced Search (2 weeks)
- Advanced filtering (tags, difficulty, tools)
- Featured examples
- Related examples suggestions
- 40+ total examples

### Phase 3: Integration (1 week)
- Save as custom command
- Tutorial integration
- Documentation links
- Telemetry

### Phase 4: Community (Future)
- User-contributed examples
- Rating and reviews
- Example packs (Python, Web Dev, DevOps)

## Open Questions

1. Should examples be shipped with CLI or fetched from web?
2. How to handle example versioning/updates?
3. Allow user-contributed examples in public registry?
4. Localization for international users?

## Resources Required

- **Development**: 1 engineer, 5 weeks
- **Content Creation**: Create 50+ high-quality examples
- **Testing**: Verify examples work across platforms
- **Documentation**: Update docs to reference examples

## Alternatives Considered

1. **Static Examples Page**: Less discoverable, not integrated
2. **Cookbook Website**: Requires context switching, not executable
3. **GitHub Examples Repo**: Separate from CLI experience

## Conclusion

The Example Library dramatically reduces friction for new users by providing immediate, practical answers to "what can I do with this?" It bridges the gap between reading documentation and productive use.

**Recommendation**: Implement as high priority - this feature directly addresses the primary user onboarding challenge and complements other educational features like tutorials.
