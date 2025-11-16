# Feature Proposal: Onboarding Checklist Dashboard

## Overview

A comprehensive dashboard that guides new users through essential setup tasks and feature discovery with a visual checklist, progress tracking, and contextual help, ensuring successful onboarding.

## Problem Statement

New users often:
- Don't know what to do after installation
- Miss important setup steps
- Feel overwhelmed by features
- Don't know where to start
- Give up before becoming productive
- Miss key features that would help them

Current onboarding is fragmented:
- No single view of setup progress
- Unclear which steps are essential vs. optional
- No guidance on feature priority
- Difficult to track what's been completed

## Proposed Solution

Implement an Onboarding Checklist Dashboard that provides:
- Visual progress tracking
- Guided setup steps
- Feature discovery
- Contextual help and links
- Celebration of milestones
- Personalized recommendations

### Core Features

1. **Essential Setup Checklist**
   - Authentication setup
   - Workspace configuration
   - First successful task
   - Key feature trials
   - Documentation review

2. **Visual Progress Dashboard**
   - Progress percentage
   - Completed vs. remaining tasks
   - Time estimates
   - Current focus area
   - Next recommended steps

3. **Feature Discovery**
   - Core features introduction
   - Advanced features preview
   - Tool demonstrations
   - Integration suggestions
   - Best practices

4. **Contextual Guidance**
   - Inline help for each step
   - Links to documentation
   - Video tutorials (if available)
   - Example prompts
   - Troubleshooting tips

### Commands

```bash
/onboarding                    # Show onboarding dashboard
/onboarding next               # Go to next recommended step
/onboarding skip <task>        # Skip a task
/onboarding complete <task>    # Mark task as complete
/onboarding reset              # Reset onboarding
/onboarding hide               # Hide completed onboarding
```

### Dashboard Interface

#### Main Dashboard View

```
$ gemini /onboarding

┌──────────────────────────────────────────────────────────────┐
│                                                              │
│           🚀 Welcome to Gemini CLI!                          │
│                                                              │
│     Let's get you set up and productive in minutes          │
│                                                              │
└──────────────────────────────────────────────────────────────┘

Overall Progress: ████████████░░░░░░░░░░░░░░░░ 45% (9/20)
Estimated time remaining: ~15 minutes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Essential Setup (Required)                         6/6 ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Install Gemini CLI
✓ Set up authentication (OAuth)
✓ Configure workspace directory
✓ Set permissions (Confirm mode)
✓ Complete first successful task
✓ Review help documentation

Great job! You're ready to use Gemini CLI. 🎉

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Core Features (Recommended)                        3/8
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Use @syntax to include files in prompts        [Completed]
✓ Try a built-in example                         [Completed]
✓ Enable Explain Mode                            [Completed]

→ Create your first custom command                [Start →]
  Time: ~5 min | Benefit: Save time on repetitive tasks
  Command: /onboarding next

○ Save and restore conversations with checkpoints
  Time: ~3 min | Benefit: Never lose your work

○ Use memory to save important context
  Time: ~4 min | Benefit: Persistent project knowledge

○ Try a workflow template
  Time: ~10 min | Benefit: Multi-step automation

○ Complete interactive tutorial
  Time: ~30 min | Benefit: Comprehensive skill building

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Advanced Features (Optional)                       0/6
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

○ Connect an MCP server
  Unlock: Complete 5 core features

○ Set up headless mode for automation
  Unlock: Complete 5 core features

○ Create a custom workflow
  Unlock: Complete custom command task

○ Configure vim mode
  Unlock: Available now

○ Set up IDE integration
  Unlock: Available now

○ Join the community
  Unlock: Available now

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 Recommended Next Step:
   Create your first custom command

   Custom commands let you save frequently used prompts as
   shortcuts. Try creating one now!

   [S] Start this task
   [N] Show me another task
   [H] Hide this dashboard

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Tip: Run /onboarding anytime to see your progress
```

#### Task Detail View

```
$ gemini /onboarding next

┌──────────────────────────────────────────────────────────────┐
│ Task: Create Your First Custom Command                       │
│ Category: Core Features                      Time: ~5 min    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ What You'll Learn:                                          │
│ • How to create custom commands                             │
│ • Save frequently used prompts as shortcuts                 │
│ • Boost productivity with reusable commands                 │
│                                                              │
│ Benefits:                                                   │
│ ✓ Save time on repetitive tasks                            │
│ ✓ Build your personal command library                      │
│ ✓ Share commands with your team                            │
│                                                              │
│ Steps:                                                      │
│                                                              │
│ 1. Think of a prompt you use frequently                     │
│    Example: "Review my git changes and suggest improvements"│
│                                                              │
│ 2. Create a custom command:                                 │
│    $ gemini /settings command add review-changes           │
│    "Review my git changes and suggest improvements"         │
│                                                              │
│ 3. Try using your command:                                  │
│    $ gemini review-changes                                  │
│                                                              │
│ 4. Edit anytime with:                                       │
│    $ gemini /settings command edit review-changes           │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ 📚 Resources:                                               │
│ • /help commands       - Command help                       │
│ • /examples search     - Find example commands              │
│ • docs/custom-commands.md - Full documentation              │
│                                                              │
│ 💬 Need Help?                                               │
│ Ask: "How do I create a custom command?"                    │
│                                                              │
│ Actions:                                                    │
│ [T] Try it now  [S] Skip  [L] Learn more  [B] Back          │
│                                                              │
└──────────────────────────────────────────────────────────────┘

[T]

Great! Let's create your first custom command together.

What prompt do you use frequently? Or type 'suggest' for ideas.

> suggest

Here are some popular custom commands you might find useful:

1. "review" - Review git changes and suggest improvements
2. "test" - Generate unit tests for the current file
3. "commit" - Generate a commit message from staged changes
4. "explain" - Explain what a file or function does
5. "doc" - Generate documentation for code

Which would you like to create? [1-5 or custom]: _
```

#### Completion Celebration

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                    🎉 Congratulations!                       │
│                                                              │
│        You've completed the Core Features section!           │
│                                                              │
│                    ████████████████ 100%                     │
│                                                              │
│   You're now equipped with essential Gemini CLI skills!      │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ What You've Mastered:                                       │
│ ✓ File inclusion with @syntax                              │
│ ✓ Using built-in examples                                  │
│ ✓ Explain Mode for learning                                │
│ ✓ Custom commands creation                                 │
│ ✓ Conversation checkpointing                               │
│ ✓ Memory management                                        │
│ ✓ Workflow templates                                       │
│ ✓ Interactive tutorial                                     │
│                                                              │
│ 🏆 Achievement Unlocked: "Core Features Master"             │
│ +100 XP                                                     │
│                                                              │
│ Next Steps:                                                 │
│ → Explore Advanced Features                                │
│ → Try some playground challenges                           │
│ → Share your learnings with the community                  │
│                                                              │
│ Keep up the great work! 🚀                                  │
│                                                              │
│ [C] Continue to Advanced  [D] Done  [S] Share Progress      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Checklist Structure

```typescript
// packages/core/src/onboarding/checklist.ts
export interface ChecklistTask {
  id: string;
  title: string;
  description: string;
  category: 'essential' | 'core' | 'advanced';
  required: boolean;
  estimatedTime: number;  // minutes

  // Completion tracking
  completed: boolean;
  completedAt?: Date;
  skipped: boolean;

  // Prerequisites
  prerequisites?: string[];  // Task IDs
  unlocks?: string[];        // Task IDs that this unlocks

  // Guidance
  steps: string[];
  benefits: string[];
  resources: Resource[];
  examples?: string[];

  // Validation
  validation?: {
    type: 'automatic' | 'manual';
    checker?: () => Promise<boolean>;
  };

  // Metadata
  xpReward?: number;
  achievement?: string;
}

interface Resource {
  type: 'doc' | 'example' | 'video' | 'tutorial';
  title: string;
  url: string;
}

const onboardingChecklist: ChecklistTask[] = [
  {
    id: 'auth-setup',
    title: 'Set up authentication',
    description: 'Choose and configure your authentication method',
    category: 'essential',
    required: true,
    estimatedTime: 2,
    completed: false,
    skipped: false,
    steps: [
      'Choose authentication method (OAuth/API Key/Vertex AI)',
      'Follow setup instructions',
      'Verify authentication works'
    ],
    benefits: [
      'Access to Gemini AI models',
      'Free tier with generous limits',
      'Secure credential storage'
    ],
    resources: [
      {
        type: 'doc',
        title: 'Authentication Guide',
        url: 'docs/get-started/authentication.md'
      }
    ],
    validation: {
      type: 'automatic',
      checker: async () => {
        return await authManager.isAuthenticated();
      }
    },
    unlocks: ['first-task']
  },

  {
    id: 'create-custom-command',
    title: 'Create your first custom command',
    description: 'Save a frequently used prompt as a reusable command',
    category: 'core',
    required: false,
    estimatedTime: 5,
    completed: false,
    skipped: false,
    prerequisites: ['auth-setup', 'first-task'],
    steps: [
      'Think of a frequently used prompt',
      'Use /settings command add to create it',
      'Try using your new command',
      'Edit if needed'
    ],
    benefits: [
      'Save time on repetitive tasks',
      'Build personal command library',
      'Share with team members'
    ],
    resources: [
      {
        type: 'doc',
        title: 'Custom Commands',
        url: 'docs/cli/custom-commands.md'
      },
      {
        type: 'example',
        title: 'Example Commands',
        url: '/examples search commands'
      }
    ],
    examples: [
      '/settings command add review "Review my changes and suggest improvements"',
      '/settings command add test "Generate unit tests for @{{args}}"'
    ],
    validation: {
      type: 'automatic',
      checker: async () => {
        const commands = await customCommandManager.list();
        return commands.length > 0;
      }
    },
    xpReward: 20,
    unlocks: ['create-workflow']
  }
];
```

### Progress Tracking

```typescript
// packages/core/src/onboarding/progress.ts
export class OnboardingProgress {
  private state: OnboardingState;

  async initialize(): Promise<void> {
    this.state = await this.loadState() ?? {
      startedAt: new Date(),
      tasks: this.initializeTasks(),
      currentTask: null,
      completedCategories: []
    };
  }

  async markComplete(taskId: string): Promise<void> {
    const task = this.state.tasks[taskId];
    if (!task) return;

    task.completed = true;
    task.completedAt = new Date();

    // Award XP if applicable
    if (task.xpReward) {
      await this.awardXP(task.xpReward);
    }

    // Unlock dependent tasks
    if (task.unlocks) {
      for (const unlockId of task.unlocks) {
        this.state.tasks[unlockId].locked = false;
      }
    }

    // Check category completion
    await this.checkCategoryCompletion(task.category);

    // Auto-advance to next task
    this.state.currentTask = await this.getNextRecommendedTask();

    await this.saveState();
    await this.showCompletionFeedback(task);
  }

  async skip(taskId: string): Promise<void> {
    const task = this.state.tasks[taskId];
    if (!task || task.required) return;

    task.skipped = true;
    this.state.currentTask = await this.getNextRecommendedTask();

    await this.saveState();
  }

  async getNextRecommendedTask(): Promise<string | null> {
    // Find next incomplete, unlocked task
    const tasks = Object.values(this.state.tasks);

    // Prioritize essential tasks
    const essential = tasks.find(
      t => t.category === 'essential' && !t.completed && !t.skipped
    );
    if (essential) return essential.id;

    // Then core features
    const core = tasks.find(
      t => t.category === 'core' && !t.completed && !t.skipped && !t.locked
    );
    if (core) return core.id;

    // Finally advanced
    const advanced = tasks.find(
      t => t.category === 'advanced' && !t.completed && !t.skipped && !t.locked
    );
    if (advanced) return advanced.id;

    return null;
  }

  getProgress(): ProgressSummary {
    const tasks = Object.values(this.state.tasks);
    const completed = tasks.filter(t => t.completed).length;
    const total = tasks.length;
    const skipped = tasks.filter(t => t.skipped).length;

    const byCategory = {
      essential: this.getCategoryProgress('essential'),
      core: this.getCategoryProgress('core'),
      advanced: this.getCategoryProgress('advanced')
    };

    return {
      percentage: Math.round((completed / total) * 100),
      completed,
      total,
      skipped,
      byCategory,
      estimatedTimeRemaining: this.calculateRemainingTime()
    };
  }

  private getCategoryProgress(
    category: string
  ): CategoryProgress {
    const tasks = Object.values(this.state.tasks).filter(
      t => t.category === category
    );
    const completed = tasks.filter(t => t.completed).length;

    return {
      completed,
      total: tasks.length,
      percentage: Math.round((completed / tasks.length) * 100)
    };
  }

  private calculateRemainingTime(): number {
    const incompleteTasks = Object.values(this.state.tasks).filter(
      t => !t.completed && !t.skipped
    );

    return incompleteTasks.reduce(
      (total, task) => total + task.estimatedTime,
      0
    );
  }

  async checkCategoryCompletion(category: string): Promise<void> {
    const progress = this.getCategoryProgress(category);

    if (progress.percentage === 100 &&
        !this.state.completedCategories.includes(category)) {
      this.state.completedCategories.push(category);
      await this.celebrateCategoryCompletion(category);
    }
  }
}
```

### Dashboard UI Component

```typescript
// packages/cli/src/ui/onboarding-dashboard.ts
export class OnboardingDashboard {
  async render(): Promise<void> {
    const progress = await onboardingProgress.getProgress();
    const currentTask = await onboardingProgress.getCurrentTask();

    // Render overall progress
    this.renderHeader(progress);

    // Render each category
    await this.renderCategory('essential', progress.byCategory.essential);
    await this.renderCategory('core', progress.byCategory.core);
    await this.renderCategory('advanced', progress.byCategory.advanced);

    // Render next step recommendation
    if (currentTask) {
      this.renderRecommendation(currentTask);
    } else {
      this.renderCompletionMessage();
    }

    // Render actions
    this.renderActions();
  }

  private renderHeader(progress: ProgressSummary): void {
    console.log(chalk.bold.cyan('\n🚀 Welcome to Gemini CLI!\n'));
    console.log('Let\'s get you set up and productive in minutes\n');

    const bar = this.createProgressBar(progress.percentage);
    console.log(`Overall Progress: ${bar} ${progress.percentage}% (${progress.completed}/${progress.total})`);
    console.log(`Estimated time remaining: ~${progress.estimatedTimeRemaining} minutes\n`);
  }

  private async renderCategory(
    category: string,
    progress: CategoryProgress
  ): Promise<void> {
    const icon = progress.percentage === 100 ? '✓' : '';
    const label = this.getCategoryLabel(category);

    console.log(chalk.bold(`\n${label} ${icon}`));
    console.log('─'.repeat(60));

    const tasks = await onboardingProgress.getTasksByCategory(category);

    for (const task of tasks) {
      this.renderTask(task);
    }
  }

  private renderTask(task: ChecklistTask): void {
    const icon = task.completed ? '✓' :
                 task.skipped ? '○' :
                 task.locked ? '🔒' :
                 task === currentTask ? '→' : '○';

    const color = task.completed ? chalk.green :
                  task === currentTask ? chalk.yellow :
                  chalk.gray;

    console.log(color(`${icon} ${task.title}`));

    if (task === currentTask) {
      console.log(color(`  Time: ~${task.estimatedTime} min | ${task.benefits[0]}`));
      console.log(color('  Command: /onboarding next'));
    }
  }
}
```

## User Benefits

### Clear Direction
- Know exactly what to do next
- Understand priority of tasks
- See progress visually
- Celebrate milestones

### Reduced Overwhelm
- Bite-sized tasks
- Time estimates
- Optional vs. required
- Progressive disclosure

### Feature Discovery
- Learn features organically
- Understand benefits before trying
- Guided exploration
- Contextual help

### Motivation
- Visual progress
- Achievement unlocks
- Milestone celebrations
- Clear end goal

## Technical Implementation

### Directory Structure
```
packages/core/src/onboarding/
├── index.ts                # Onboarding manager
├── checklist.ts           # Task definitions
├── progress.ts            # Progress tracking
├── validator.ts           # Task validation
└── rewards.ts             # Celebrations & rewards

packages/cli/src/ui/
├── onboarding-dashboard.ts # Dashboard UI
└── task-detail.ts         # Task detail view
```

## Integration Points

### With Existing Features
- **Settings**: Track configuration steps
- **Authentication**: Validate auth setup
- **Help**: Link to relevant help

### With Proposed Features
- **Quick Start Wizard**: Initialize checklist
- **Learning Path**: Award XP for tasks
- **Tutorial**: Link tutorial tasks
- **Achievements**: Unlock achievements

## Success Metrics

- Onboarding completion rate
- Time to productivity
- Feature adoption rate
- User retention (7-day, 30-day)
- Support ticket reduction
- User satisfaction scores

## Implementation Phases

### Phase 1: Core Checklist (2 weeks)
- Task definitions
- Progress tracking
- Basic dashboard UI
- Essential tasks only

### Phase 2: Feature Discovery (2 weeks)
- Core feature tasks
- Advanced feature tasks
- Task validation
- Resource links

### Phase 3: Engagement (1 week)
- Celebrations
- Recommendations
- XP integration
- Achievement unlocks

### Phase 4: Polish (1 week)
- UI refinement
- Copywriting
- Testing
- Analytics

## Open Questions

1. Should onboarding be dismissible permanently?
2. Different checklists for different user types?
3. Team onboarding vs. individual?
4. Periodic "feature refresh" checklists?

## Resources Required

- **Development**: 1 engineer, 6 weeks
- **UX Design**: Dashboard and flow design
- **Content**: Task descriptions and guidance
- **Testing**: User testing with new users

## Alternatives Considered

1. **Tooltip Tour**: Less comprehensive
2. **Video Tutorial**: Passive, not tracked
3. **Documentation Page**: No progress tracking

## Related Work

- GitHub onboarding checklist
- VS Code welcome screen
- Slack onboarding
- Duolingo lesson progression

## Future Enhancements

- Personalized checklists based on use case
- Team onboarding collaboration
- Onboarding analytics dashboard
- A/B testing different task orders
- Adaptive difficulty

## Conclusion

The Onboarding Checklist Dashboard provides structure and guidance for new users, dramatically improving the onboarding experience. By visualizing progress and recommending next steps, we reduce overwhelm and accelerate time-to-productivity.

**Recommendation**: Highest priority alongside Quick Start Wizard. This feature should be the first thing new users see and is critical for retention and successful onboarding. Implement early in the feature roadmap.
