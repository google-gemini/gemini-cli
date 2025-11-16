# Feature Proposal: Explain Mode (Educational Assistant)

## Overview

An educational mode that makes Gemini CLI transparent and instructive by explaining what it's doing, why it's doing it, and what users can learn from each interaction. Perfect for beginners who want to understand, not just execute.

## Problem Statement

New users often feel like they're using a "black box":
- Don't understand how Gemini interprets their requests
- Can't see which tools are being used and why
- Miss learning opportunities from each interaction
- Don't know how to replicate results manually
- Unclear about what's happening "behind the scenes"

This leads to:
- Dependency on Gemini without understanding
- Inability to solve similar problems independently
- Missed skill development opportunities
- Lack of confidence in results

## Proposed Solution

Implement an "Explain Mode" that provides detailed, educational explanations of Gemini's reasoning, tool usage, and decision-making process in real-time.

### Core Features

1. **Transparent Tool Usage**
   - Show which tools are being invoked
   - Explain why each tool was chosen
   - Display tool parameters and results
   - Teach when to use each tool

2. **Reasoning Breakdown**
   - Explain how Gemini interpreted the request
   - Show the thought process and plan
   - Highlight key decisions and trade-offs
   - Link to relevant documentation

3. **Learning Annotations**
   - Inline tips and best practices
   - Explanations of technical concepts
   - Suggestions for further learning
   - Related examples and tutorials

4. **Alternative Approaches**
   - Show other ways to accomplish the task
   - Explain pros/cons of each approach
   - Demonstrate manual methods
   - Teach underlying principles

### Commands

```bash
/explain on                 # Enable explain mode
/explain off                # Disable explain mode
/explain toggle             # Toggle explain mode
/explain verbosity <level>  # Set explanation detail (brief/normal/detailed)
/explain last               # Explain the last response
/explain this               # Explain current response in detail
```

### Explanation Levels

#### Brief Mode
- Tool names only
- One-line explanations
- Key decisions highlighted

#### Normal Mode (default)
- Tool usage with reasons
- Step-by-step breakdown
- Tips and best practices

#### Detailed Mode
- Complete reasoning process
- All tool parameters shown
- Educational content
- Alternative approaches
- Related documentation

### User Interface Examples

#### Example 1: Simple File Read

**Without Explain Mode:**
```
$ gemini What does app.ts do?

The app.ts file is the main entry point for the application. It initializes
the Express server, sets up middleware, and defines the core routes...
```

**With Explain Mode (Normal):**
```
$ gemini What does app.ts do?

┌─ Explain Mode ────────────────────────────────────────────┐
│ I'm going to read the app.ts file to answer your question │
│                                                            │
│ Tool: read_files                                          │
│ Why: To access the contents of app.ts                     │
│ File: src/app.ts                                          │
└────────────────────────────────────────────────────────────┘

The app.ts file is the main entry point for the application...

┌─ What I Did ──────────────────────────────────────────────┐
│ 1. ✓ Read src/app.ts (43 lines)                          │
│ 2. ✓ Analyzed code structure and purpose                 │
│                                                            │
│ 💡 Tip: You can also use @src/app.ts in your prompts     │
│    to include file content directly                       │
│                                                            │
│ 📚 Learn more: /examples show read-files                  │
└────────────────────────────────────────────────────────────┘
```

#### Example 2: Complex Multi-step Task

**Request:** "Find all TODO comments in the codebase and create a summary"

**With Explain Mode (Detailed):**
```
┌─ Understanding Your Request ──────────────────────────────┐
│ Task: Find and summarize TODO comments                    │
│ Scope: Entire codebase                                    │
│ Complexity: Multi-step (search → analyze → summarize)     │
│                                                            │
│ My Plan:                                                   │
│ 1. Search all code files for "TODO" comments             │
│ 2. Extract each TODO with its context                    │
│ 3. Categorize by file and priority                       │
│ 4. Create organized summary                              │
│                                                            │
│ Alternative approaches:                                    │
│ • Use grep/ripgrep directly (faster, less insight)       │
│ • Use IDE's TODO tracker (IDE-specific)                  │
│ • Manual code review (time-consuming)                    │
│                                                            │
│ Chosen approach: AI-powered analysis for better context   │
└────────────────────────────────────────────────────────────┘

┌─ Step 1: Search for TODO comments ────────────────────────┐
│ Tool: grep_search (ripgrep-based)                         │
│ Pattern: "TODO"                                           │
│ Case-sensitive: No                                        │
│ File types: All code files                               │
│                                                            │
│ Why this tool: Grep is optimized for text search across  │
│ many files. It's faster than reading each file and       │
│ supports regex patterns for flexible matching.            │
│                                                            │
│ 📊 Found: 23 TODO comments across 12 files               │
└────────────────────────────────────────────────────────────┘

┌─ Step 2: Analyze context ──────────────────────────────────┐
│ Tool: read_files                                          │
│ Files: Reading surrounding context for each TODO          │
│                                                            │
│ Why: Understanding the code around each TODO helps       │
│ determine priority and provides better context for       │
│ the summary.                                              │
│                                                            │
│ Reading: src/auth.ts, src/api/users.ts, ...             │
└────────────────────────────────────────────────────────────┘

[... Gemini provides the summary ...]

┌─ Summary of My Process ───────────────────────────────────┐
│ Tools Used:                                               │
│ ✓ grep_search - Found 23 TODOs in <1 second             │
│ ✓ read_files - Read 12 files for context                │
│ ✓ AI analysis - Categorized and prioritized             │
│                                                            │
│ What You Learned:                                         │
│ • Grep is perfect for codebase-wide text search          │
│ • Combining search + context gives better insights       │
│ • AI can categorize and prioritize beyond simple search  │
│                                                            │
│ Try It Yourself:                                          │
│ $ rg "TODO" --type ts                                     │
│ This would show all TODOs in TypeScript files            │
│                                                            │
│ Next Steps:                                               │
│ • Create GitHub issues from these TODOs                  │
│ • /workflow run todo-to-issues                           │
│                                                            │
│ 📚 Related:                                               │
│ • /examples search grep                                   │
│ • /tutorial grep-and-search                              │
│ • docs/tools/grep.md                                     │
└────────────────────────────────────────────────────────────┘
```

#### Example 3: Error Recovery Explanation

```
$ gemini Refactor auth.ts to use async/await

┌─ Error Occurred ──────────────────────────────────────────┐
│ ❌ File not found: auth.ts                                │
│                                                            │
│ What Happened:                                            │
│ I tried to read "auth.ts" but it doesn't exist in the    │
│ current directory.                                        │
│                                                            │
│ Why This Error:                                           │
│ File paths are relative to your current working          │
│ directory. The file might be in a subdirectory.           │
│                                                            │
│ How I'm Recovering:                                       │
│ 1. Searching for files matching "auth.ts"                │
│ 2. Will ask you to confirm which one                     │
│                                                            │
│ 💡 Pro Tip: Use tab completion or @src/auth.ts to        │
│    specify exact paths                                    │
└────────────────────────────────────────────────────────────┘

Found 2 files matching "auth.ts":
  1. src/auth.ts
  2. tests/auth.ts

Which file did you mean? [1]:
```

### Explanation Components

```typescript
// packages/core/src/explain/explainer.ts
export interface Explanation {
  phase: 'planning' | 'execution' | 'summary';
  type: 'tool-usage' | 'reasoning' | 'tip' | 'alternative' | 'error';
  content: string;
  metadata?: {
    toolName?: string;
    parameters?: Record<string, any>;
    duration?: number;
    filesAffected?: string[];
  };
  links?: {
    examples?: string[];
    tutorials?: string[];
    documentation?: string[];
  };
}

export class ExplainMode {
  private enabled: boolean = false;
  private verbosity: 'brief' | 'normal' | 'detailed' = 'normal';

  async explainPlan(plan: ExecutionPlan): Promise<void> {
    if (!this.enabled) return;

    const explanation = this.formatPlan(plan);
    await this.display(explanation);
  }

  async explainToolCall(
    tool: string,
    params: any,
    result: any
  ): Promise<void> {
    if (!this.enabled) return;

    const explanation: Explanation = {
      phase: 'execution',
      type: 'tool-usage',
      content: this.formatToolUsage(tool, params),
      metadata: {
        toolName: tool,
        parameters: params,
        duration: result.duration
      },
      links: {
        documentation: [`docs/tools/${tool}.md`]
      }
    };

    await this.display(explanation);
  }

  async explainReasoning(
    thought: string,
    alternatives?: string[]
  ): Promise<void> {
    if (!this.enabled || this.verbosity === 'brief') return;

    const explanation: Explanation = {
      phase: 'planning',
      type: 'reasoning',
      content: thought,
      links: alternatives ? {
        examples: alternatives.map(a => this.findRelatedExample(a))
      } : undefined
    };

    await this.display(explanation);
  }

  async provideTip(tip: Tip): Promise<void> {
    if (!this.enabled) return;
    if (this.verbosity === 'brief' && !tip.important) return;

    const explanation: Explanation = {
      phase: 'summary',
      type: 'tip',
      content: tip.message,
      links: {
        examples: tip.examples,
        tutorials: tip.tutorials
      }
    };

    await this.display(explanation);
  }
}
```

### Smart Tip System

```typescript
// packages/core/src/explain/tips.ts
interface Tip {
  id: string;
  message: string;
  trigger: TriggerCondition;
  important: boolean;
  examples?: string[];
  tutorials?: string[];
  showOnce?: boolean;
}

const tips: Tip[] = [
  {
    id: 'use-at-syntax',
    message: 'You can use @file.ts to include file content in your prompts',
    trigger: {
      type: 'tool-usage',
      tool: 'read_files',
      minCount: 3
    },
    important: true,
    examples: ['/examples show read-files'],
    showOnce: true
  },
  {
    id: 'save-as-command',
    message: 'This prompt works well! Consider saving it as a custom command',
    trigger: {
      type: 'repeated-prompt',
      similarity: 0.8,
      count: 2
    },
    important: true,
    tutorials: ['/tutorial custom-commands']
  },
  {
    id: 'checkpoint-suggestion',
    message: 'Long conversation! Consider /checkpoint save to preserve your work',
    trigger: {
      type: 'conversation-length',
      turns: 20
    },
    important: false,
    examples: ['/examples show checkpoint']
  }
];

export class TipProvider {
  private shownTips: Set<string> = new Set();

  async checkTips(context: Context): Promise<Tip[]> {
    const applicableTips: Tip[] = [];

    for (const tip of tips) {
      if (tip.showOnce && this.shownTips.has(tip.id)) {
        continue;
      }

      if (await this.triggerMatches(tip.trigger, context)) {
        applicableTips.push(tip);
        this.shownTips.add(tip.id);
      }
    }

    return applicableTips;
  }
}
```

### Educational Content Integration

```typescript
// packages/core/src/explain/educator.ts
export class EducationalAssistant {
  async getConceptExplanation(concept: string): Promise<string> {
    const explanations = {
      'grep': 'Grep searches for patterns in text. It\'s much faster than reading every file.',
      'regex': 'Regular expressions are patterns for matching text. Example: "\\d+" matches numbers.',
      'git-diff': 'Git diff shows changes between commits, helping you understand what changed.',
      // ... more concepts
    };

    return explanations[concept] ?? '';
  }

  async suggestManualMethod(task: string): Promise<string> {
    // Suggest how to do tasks manually
    const manual = {
      'search-todos': 'Manually: Run `rg "TODO" --type ts` in your terminal',
      'git-commit': 'Manually: Run `git add . && git commit -m "your message"`',
      // ... more tasks
    };

    return manual[task] ?? '';
  }

  async suggestRelatedLearning(tool: string): Promise<RelatedContent> {
    return {
      examples: await this.findRelatedExamples(tool),
      tutorials: await this.findRelatedTutorials(tool),
      documentation: this.getDocumentation(tool),
      challenges: await this.findRelatedChallenges(tool)
    };
  }
}
```

## User Benefits

### Learning & Understanding
- Understand the "why" not just the "what"
- Learn best practices through examples
- Build mental models of how Gemini works
- Develop problem-solving skills

### Confidence Building
- See exactly what's happening
- Understand results and trust them
- Learn to verify and validate
- Gain independence from AI assistance

### Skill Development
- Learn tools and commands organically
- Understand when to use different approaches
- Build terminal/CLI skills
- Transfer knowledge to other contexts

### Debugging & Troubleshooting
- Understand when things go wrong
- Learn to recognize and fix errors
- See recovery strategies in action
- Build debugging intuition

## Technical Implementation

### Directory Structure
```
packages/core/src/explain/
├── index.ts                # Explain mode manager
├── explainer.ts           # Core explanation logic
├── formatter.ts           # Format explanations for display
├── tips.ts               # Tip system
├── educator.ts           # Educational content
├── alternatives.ts       # Alternative approaches
└── templates/
    ├── tool-usage.ts     # Tool explanation templates
    ├── reasoning.ts      # Reasoning templates
    └── errors.ts         # Error explanation templates
```

### Integration with Core

```typescript
// Integrate with tool execution
class ToolExecutor {
  async executeTool(tool: string, params: any): Promise<any> {
    // Before execution
    if (explainMode.isEnabled()) {
      await explainMode.explainToolCall(tool, params, 'before');
    }

    // Execute
    const result = await this.runTool(tool, params);

    // After execution
    if (explainMode.isEnabled()) {
      await explainMode.explainToolCall(tool, params, result);
    }

    return result;
  }
}
```

## Integration Points

### With Existing Features
- **Tools**: Explain each tool usage
- **Commands**: Explain command execution
- **Checkpointing**: Explain save/restore process
- **Memory**: Explain memory lookups

### With Proposed Features
- **Tutorial**: More detailed explanations in tutorial mode
- **Examples**: Explain example execution
- **Workflows**: Explain each workflow step
- **Playground**: Explanations for challenges

## Success Metrics

- User comprehension (quiz/survey)
- Repeat usage of learned commands
- Graduation from explain mode
- User confidence scores
- Documentation page views (reduction)
- Support questions (reduction)

## Implementation Phases

### Phase 1: Basic Explanations (2 weeks)
- Tool usage explanations
- Simple reasoning display
- Brief/Normal modes

### Phase 2: Educational Content (2 weeks)
- Tip system
- Concept explanations
- Manual method suggestions
- Detailed mode

### Phase 3: Advanced Features (2 weeks)
- Alternative approaches
- Error recovery explanations
- Learning path integration
- Related content suggestions

### Phase 4: Polish (1 week)
- UI/UX improvements
- Performance optimization
- Documentation
- User testing feedback

## Open Questions

1. Should explanations be collapsible/expandable?
2. Export explanations for later review?
3. Different explain modes for different user levels?
4. Integration with screen readers for accessibility?

## Resources Required

- **Development**: 1-2 engineers, 7 weeks
- **Content**: Educational content creation
- **UX Design**: Explanation UI design
- **Testing**: User testing with beginners

## Alternatives Considered

1. **Verbose Mode Only**: Less educational, just more output
2. **Post-Execution Summary**: Loses learning in context
3. **External Documentation**: Context switching required

## Related Work

- Explainable AI research
- VS Code's "Explain this" feature
- Stack Overflow explanations
- Linux `man` pages with examples

## Future Enhancements

- Interactive explanations (ask follow-up questions)
- Video explanations for complex topics
- Quizzes to test understanding
- Explanation history and review
- Generate custom learning paths from explanations
- Export explanations to notebook format

## Conclusion

Explain Mode transforms Gemini CLI from a productivity tool into a learning platform. By making AI reasoning transparent and educational, we empower users to become more skilled and independent developers.

**Recommendation**: High priority for educational focus and beginner onboarding. This feature aligns with making Gemini CLI accessible and educational, directly supporting new user success.
