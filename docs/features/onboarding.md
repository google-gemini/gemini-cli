# Onboarding Dashboard

The Onboarding Dashboard helps you learn Gemini CLI through a curated checklist of 20 tasks across essential, core, and advanced features.

## Overview

The onboarding system provides:

- **Structured Learning** - 20 tasks organized by difficulty
- **Progress Tracking** - Monitor your learning journey
- **Smart Recommendations** - Get personalized next steps
- **Achievement System** - Track task completions and timing
- **Category Organization** - Essential, Core, and Advanced tasks

## Quick Start

```bash
# View your onboarding dashboard
/onboarding

# Start a specific task
/onboarding start first-prompt

# Complete a task
/onboarding complete first-prompt

# View detailed statistics
/onboarding stats
```

## Task Categories

### Essential Tasks (6 tasks)

Must complete to effectively use Gemini CLI.

| Task | Description | Time |
|------|-------------|------|
| `complete-wizard` | Complete Quick Start Wizard | 5 min |
| `authenticate` | Set Up Authentication | 2 min |
| `first-prompt` | Send Your First Prompt | 1 min |
| `explore-examples` | Browse Example Library | 5 min |
| `run-example` | Run an Example | 3 min |
| `configure-workspace` | Configure Your Workspace | 3 min |

**Completion:** You're considered onboarded when all essential tasks are complete.

### Core Feature Tasks (8 tasks)

Important features that improve your experience.

| Task | Description | Time |
|------|-------------|------|
| `use-file-context` | Use @ File References | 5 min |
| `multimodal-prompt` | Send a Multimodal Prompt | 5 min |
| `save-custom-command` | Save a Custom Command | 5 min |
| `use-tools` | Try Tool Usage | 10 min |
| `review-history` | Review Your History | 2 min |
| `rate-example` | Rate an Example | 1 min |
| `configure-settings` | Customize Settings | 5 min |
| `explore-search` | Search Examples | 3 min |

**Benefit:** Core features unlock the full potential of Gemini CLI.

### Advanced Feature Tasks (6 tasks)

Power user features for complex workflows.

| Task | Description | Time |
|------|-------------|------|
| `use-variables` | Use Variable Substitution | 10 min |
| `batch-processing` | Process Multiple Files | 15 min |
| `advanced-tools` | Use Advanced Tools | 15 min |
| `project-analysis` | Analyze a Project | 20 min |
| `create-workflow` | Create a Workflow | 20 min |
| `share-feedback` | Share Feedback | 5 min |

**For:** Developers and power users building complex automations.

## CLI Commands

### `/onboarding` or `/onboarding dashboard`

Display the onboarding dashboard with progress and recommendations.

```bash
/onboarding
```

**Output:**
```
📋 Onboarding Checklist

Progress: 30% (6/20 tasks)

By Category:
  Essential   : 4/6 completed
  Core        : 2/8 completed
  Advanced    : 0/6 completed

Next Recommended Steps:
1. **Configure Your Workspace**
   Essential for getting started
   Estimated: 3 minutes
   Try: /onboarding start configure-workspace

2. **Explore Example Library**
   Essential for getting started
   Estimated: 5 minutes
   Try: /examples

3. **Use @ File References**
   Important core feature
   Estimated: 5 minutes

_Run /onboarding stats for detailed statistics_
```

### `/onboarding stats`

Show detailed statistics including timing metrics.

```bash
/onboarding stats
```

**Output:**
```
📊 Onboarding Statistics

Overall:
  Total tasks: 20
  Completed: 6
  Completion rate: 30.0%

By Category:
  Essential: 4/6
  Core: 2/8
  Advanced: 0/6

Timing:
  Time to first task: 5 minutes
  Average completion: 8 minutes
```

### `/onboarding start <task-id>`

Mark a task as started and show instructions.

```bash
/onboarding start first-prompt
```

**Output:**
```
▶️ Started: Send Your First Prompt

Try asking Gemini a question

Estimated time: 1 minute

💡 Type any question or command and press Enter
```

### `/onboarding complete <task-id>`

Mark a task as completed.

```bash
/onboarding complete first-prompt
```

**Output:**
```
✅ Completed: Send Your First Prompt

Progress: 35%
```

**With celebration:**
```
✅ Completed: Share Feedback

Progress: 100%

🎉 Congratulations! You have completed all essential onboarding tasks!
```

**Prerequisite Enforcement:**

Tasks cannot be completed if their prerequisites are not met. If you try to complete a task without completing its prerequisites first, you'll see an error:

```bash
/onboarding complete authenticate
```

**Error Output:**
```
❌ Cannot complete task "Set Up Authentication": unmet prerequisites: Complete Quick Start Wizard

💡 Complete the required tasks first, then try again.
```

Complete prerequisite tasks in order before attempting dependent tasks.

### `/onboarding skip <task-id>`

Skip a task (mark as skipped).

```bash
/onboarding skip advanced-tools
```

**Output:**
```
⏭️ Skipped task: advanced-tools
```

**When to skip:**
- Task not relevant to your use case
- Already familiar with the feature
- Want to focus on other tasks first

### `/onboarding reset`

Reset the entire checklist (start over).

```bash
/onboarding reset
```

**Output:**
```
🔄 Onboarding checklist has been reset.
```

**Warning:** This clears all progress and completions.

## Task Prerequisites

Some tasks require completing others first:

```
complete-wizard
  ├─> authenticate
  │     └─> first-prompt
  │           ├─> explore-examples
  │           │     └─> run-example
  │           │           ├─> save-custom-command
  │           │           └─> rate-example
  │           ├─> use-file-context
  │           │     └─> multimodal-prompt
  │           ├─> use-tools
  │           └─> review-history
  └─> configure-workspace
```

**Smart Recommendations:** The system only recommends tasks where prerequisites are met.

## Recommendation Engine

The onboarding dashboard provides intelligent next-step recommendations based on:

### Priority Factors

1. **Category Priority**
   - Essential: +5 priority
   - Core: +3 priority
   - Advanced: +1 priority

2. **Blocking Tasks**
   - +1 priority for each task it unlocks
   - Example: `complete-wizard` unlocks many tasks → high priority

3. **Prerequisites**
   - Only recommends tasks with completed prerequisites
   - Ensures logical learning progression

### Recommendation Reasons

- **"Essential for getting started"** - Essential category tasks
- **"Unlocks N other tasks"** - Tasks that are prerequisites for others
- **"Important core feature"** - Core category tasks
- **"Recommended next step"** - Advanced tasks or general recommendations

## Learning Paths

### Beginner Path (Essential Only)

Complete all 6 essential tasks to get started:

```bash
1. /onboarding start complete-wizard
2. /wizard start  # Complete the wizard
3. /onboarding complete complete-wizard

4. /onboarding start authenticate
5. # Verify authentication works
6. /onboarding complete authenticate

7. /onboarding start first-prompt
8. # Send a prompt to Gemini
9. /onboarding complete first-prompt

10. /onboarding start explore-examples
11. /examples  # Browse examples
12. /onboarding complete explore-examples

13. /onboarding start run-example
14. /examples run <example-id>
15. /onboarding complete run-example

16. /onboarding start configure-workspace
17. # Configure workspace settings
18. /onboarding complete configure-workspace
```

**Time:** 15-20 minutes

**Outcome:** Ready to use Gemini CLI effectively

### Intermediate Path (Essential + Core)

Complete essential tasks plus core features:

```bash
# After completing essential tasks...

# File references
/onboarding start use-file-context
# Try: "Explain @src/app.ts"
/onboarding complete use-file-context

# Multimodal
/onboarding start multimodal-prompt
# Try: "Describe @screenshot.png"
/onboarding complete multimodal-prompt

# Custom commands
/onboarding start save-custom-command
/examples save <example-id> my-command
/onboarding complete save-custom-command

# Tools
/onboarding start use-tools
# Try: "Create a file called test.txt"
/onboarding complete use-tools

# History
/onboarding start review-history
/history
/onboarding complete review-history

# Ratings
/onboarding start rate-example
/examples rate <example-id> 5 "Great example!"
/onboarding complete rate-example

# Settings
/onboarding start configure-settings
/settings
/onboarding complete configure-settings

# Search
/onboarding start explore-search
/examples search <query>
/onboarding complete explore-search
```

**Time:** 30-45 minutes

**Outcome:** Proficient with core Gemini CLI features

### Advanced Path (All Tasks)

Complete all 20 tasks for mastery:

```bash
# After completing essential + core tasks...

# Variables
/onboarding start use-variables
/examples run <example-with-variables>
/onboarding complete use-variables

# Batch processing
/onboarding start batch-processing
# Try batch processing example
/onboarding complete batch-processing

# Advanced tools
/onboarding start advanced-tools
# Experiment with shell execution
/onboarding complete advanced-tools

# Project analysis
/onboarding start project-analysis
# Analyze a codebase
/onboarding complete project-analysis

# Workflows
/onboarding start create-workflow
# Create multi-step workflow
/onboarding complete create-workflow

# Feedback
/onboarding start share-feedback
/examples rate <example-id> <rating> <notes>
/onboarding complete share-feedback
```

**Time:** 1-2 hours total

**Outcome:** Gemini CLI expert

## Progress Tracking

### Progress Calculation

```
Progress = (Completed Tasks / Total Tasks) × 100
```

Example: 6 completed out of 20 tasks = 30% progress

### Completion Criteria

You're considered "onboarded" when:
- All 6 essential tasks are complete
- `isComplete` flag is true in dashboard

**Note:** Core and advanced tasks are optional for completion status.

### Statistics

The dashboard tracks:

- **Total Tasks** - Always 20
- **Completed Tasks** - Tasks marked as completed
- **Completion Rate** - Percentage of all tasks completed
- **By Category** - Breakdown by essential/core/advanced
- **Time to First Task** - How long until first completion
- **Average Completion Time** - Average time per task

## Auto-Detection

Some tasks can be automatically detected as completed:

```typescript
verificationMethod: 'automatic'
```

Tasks with automatic verification:
- `complete-wizard` - Detects wizard completion
- `authenticate` - Detects valid auth configuration
- `first-prompt` - Detects first conversation
- `explore-examples` - Detects example library access
- `run-example` - Detects example execution

**Manual verification tasks:**
- `configure-settings` - Subjective/preference-based
- `advanced-tools` - Experimentation-based
- `create-workflow` - Creative/open-ended

## Tips

### For Efficient Learning

1. **Follow Recommendations** - Dashboard knows optimal order
2. **Complete Prerequisites First** - Unlock more tasks faster
3. **Track Your Time** - Note how long tasks actually take
4. **Add Notes** - Use `/onboarding complete task-id notes` to record insights
5. **Don't Skip Essential** - These are truly necessary

### For Busy Users

1. **Focus on Essential** - Get to 6/6 essential first
2. **Skip Advanced** - Can return later when needed
3. **Use Commands** - Faster than manual tracking
4. **Bookmark Tasks** - Use `/onboarding` to remind yourself

### For Power Users

1. **Complete All 20** - Unlock full potential
2. **Experiment** - Go beyond task descriptions
3. **Create Workflows** - Combine multiple features
4. **Share Feedback** - Help improve the CLI
5. **Customize** - Edit tasks in code (advanced)

## State Management

### State File

Location: `~/.gemini-cli/onboarding-checklist.json`

```json
{
  "tasks": {
    "complete-wizard": {
      "taskId": "complete-wizard",
      "status": "completed",
      "startedAt": 1700000000000,
      "completedAt": 1700000300000,
      "notes": "Quick and easy setup"
    },
    "first-prompt": {
      "taskId": "first-prompt",
      "status": "in-progress",
      "startedAt": 1700000400000
    }
  },
  "progress": 5,
  "startedAt": 1700000000000,
  "lastUpdatedAt": 1700000400000,
  "isComplete": false
}
```

### Task States

- **`pending`** - Not started (default)
- **`in-progress`** - Started but not completed
- **`completed`** - Successfully completed
- **`skipped`** - Skipped by user

### Manual Editing

You can manually edit the state file:

```bash
# Backup first!
cp ~/.gemini-cli/onboarding-checklist.json ~/.gemini-cli/onboarding-checklist.json.backup

# Edit with your favorite editor
vim ~/.gemini-cli/onboarding-checklist.json

# Restart CLI to see changes
```

**Warning:** Invalid JSON will reset checklist to default state.

## Troubleshooting

### Task Won't Complete

**Problem:** `/onboarding complete task-id` shows error

**Solutions:**
1. Check task ID spelling: `/onboarding` shows all task IDs
2. Verify task exists in checklist
3. Try `/onboarding reset` and start over

### Progress Not Updating

**Problem:** Completed tasks don't update progress

**Solutions:**
1. Restart CLI
2. Check `~/.gemini-cli/onboarding-checklist.json` exists
3. Verify file permissions
4. Try `/onboarding reset`

### Recommendations Don't Make Sense

**Problem:** Recommended tasks have unmet prerequisites

**Solutions:**
1. This should not happen (please report bug!)
2. Check `/onboarding stats` for task status
3. Manually complete prerequisites
4. Try `/onboarding reset`

### Can't Access State File

**Problem:** Permission denied errors

**Solutions:**
1. Check file permissions: `ls -la ~/.gemini-cli/`
2. Verify ownership: `whoami` should match file owner
3. Fix permissions: `chmod 644 ~/.gemini-cli/onboarding-checklist.json`

## Integration with Other Features

### Wizard Integration

The onboarding dashboard includes a task to complete the wizard:

```bash
/onboarding start complete-wizard
/wizard start
# Complete wizard...
/onboarding complete complete-wizard
```

### Example Library Integration

Many tasks involve the example library:

```bash
/onboarding start explore-examples
/examples  # Browse library
/onboarding complete explore-examples

/onboarding start run-example
/examples run code-review
/onboarding complete run-example
```

### History Integration

Review your progress over time:

```bash
/onboarding start review-history
/history  # See what you've done
/onboarding complete review-history
```

## Best Practices

### Do's

✅ Complete essential tasks first
✅ Follow recommended next steps
✅ Add notes when completing tasks
✅ Use commands for efficient tracking
✅ Review stats periodically
✅ Skip tasks not relevant to you

### Don'ts

❌ Don't skip essential tasks
❌ Don't manually edit state file (unless you know what you're doing)
❌ Don't reset checklist unless necessary
❌ Don't rush through tasks
❌ Don't ignore prerequisites

## Privacy

### What's Tracked

- Task completion status
- Start and completion timestamps
- Optional notes you add
- Progress percentage

### What's NOT Tracked

- Actual prompt contents
- File contents
- Personal information
- Usage beyond checklist

### Data Location

All data stored locally in `~/.gemini-cli/onboarding-checklist.json`.

**Never sent to servers.**

## Related

- [Quick Start Wizard](../get-started/wizard.md) - Initial setup
- [Example Library](./example-library.md) - Explore examples
- [Configuration](../get-started/configuration.md) - Customize settings
- [Getting Started](../get-started/index.md) - Overview
