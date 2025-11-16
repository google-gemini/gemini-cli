# Feature Proposal: Interactive Tutorial Mode

## Overview

An interactive, step-by-step tutorial system that guides new users through Gemini CLI's core features and commands, helping them learn by doing in a safe, sandboxed environment.

## Problem Statement

New users often face a steep learning curve when first using Gemini CLI:
- Overwhelming number of commands and features
- Uncertainty about where to start
- Fear of making mistakes or breaking things
- Lack of hands-on practice in a structured way

## Proposed Solution

Implement an interactive tutorial mode accessible via `/tutorial` that provides:

### Core Features

1. **Progressive Learning Modules**
   - Module 1: Basic Chat & Commands (5 mins)
   - Module 2: File Operations (@files, editing) (10 mins)
   - Module 3: Shell Integration (! commands) (10 mins)
   - Module 4: Advanced Features (checkpointing, memory) (15 mins)
   - Module 5: Custom Commands & Automation (20 mins)

2. **Interactive Exercises**
   - Step-by-step instructions with validation
   - Practice tasks with immediate feedback
   - Safe sandbox environment (no actual file modifications)
   - Visual progress indicators

3. **Adaptive Learning**
   - Skip modules for experienced users
   - Resume where you left off
   - Hints system for stuck users
   - Success/failure feedback with explanations

### Commands

```bash
/tutorial                    # Start tutorial from beginning
/tutorial list               # Show all available modules
/tutorial start <module>     # Start specific module
/tutorial resume             # Continue from last checkpoint
/tutorial reset              # Reset all progress
/tutorial skip               # Skip current exercise
/tutorial status             # Show completion status
```

### Example Tutorial Flow

```
$ gemini /tutorial

Welcome to Gemini CLI Interactive Tutorial! 🚀

This tutorial will guide you through the essential features of Gemini CLI.
Estimated time: 30 minutes (you can pause anytime)

Progress: [░░░░░░░░░░] 0% (0/5 modules completed)

Module 1: Basic Chat & Commands
═══════════════════════════════════════════════════════════

Let's start with the basics. Try asking Gemini a simple question:

→ Your turn: Ask "What is Gemini CLI?"

[User types: What is Gemini CLI?]

✓ Great! You just had your first conversation with Gemini.

Next, let's try a slash command. Type: /help

[User types: /help]

✓ Perfect! Slash commands are meta-commands that control the CLI itself.

... continues with more exercises ...
```

## User Benefits

### For Complete Beginners
- Structured learning path from zero to productive
- Builds confidence through hands-on practice
- Safe environment to experiment

### For Intermediate Users
- Discover advanced features they might have missed
- Learn best practices and shortcuts
- Refresh specific topics quickly

### For All Users
- Reduces time-to-productivity
- Decreases support burden
- Improves feature adoption

## Technical Implementation

### Directory Structure
```
packages/cli/src/tutorial/
├── index.ts                 # Tutorial engine
├── modules/
│   ├── 01-basics.ts
│   ├── 02-file-operations.ts
│   ├── 03-shell-integration.ts
│   ├── 04-advanced-features.ts
│   └── 05-automation.ts
├── validator.ts             # Exercise validation
├── progress-tracker.ts      # User progress storage
└── sandbox.ts               # Safe execution environment
```

### Key Components

1. **Tutorial Engine** (`TutorialEngine.ts`)
   - Manages module progression
   - Handles user input validation
   - Tracks completion status
   - Provides hints and feedback

2. **Module System** (`Module.ts`)
   - Define learning objectives
   - Create interactive exercises
   - Validate user actions
   - Provide contextual help

3. **Progress Tracker** (`ProgressTracker.ts`)
   - Store completion status in `~/.gemini/tutorial-progress.json`
   - Track time spent per module
   - Record attempts and success rate

4. **Sandbox Environment**
   - Create temporary workspace
   - Mock file operations for safety
   - Clean up after completion

### Data Storage

```json
// ~/.gemini/tutorial-progress.json
{
  "version": "1.0",
  "started_at": "2025-01-15T10:30:00Z",
  "last_activity": "2025-01-15T11:15:00Z",
  "modules": {
    "01-basics": {
      "completed": true,
      "started_at": "2025-01-15T10:30:00Z",
      "completed_at": "2025-01-15T10:45:00Z",
      "exercises_completed": 5,
      "exercises_total": 5,
      "hints_used": 1
    },
    "02-file-operations": {
      "completed": false,
      "started_at": "2025-01-15T10:45:00Z",
      "current_exercise": 3,
      "exercises_completed": 2,
      "exercises_total": 8,
      "hints_used": 0
    }
  },
  "total_time_minutes": 45,
  "completion_percentage": 20
}
```

## Integration Points

### With Existing Features
- **Help System**: Link tutorial from `/help` output
- **First Run**: Auto-suggest tutorial on first launch
- **Settings**: Add `tutorial.autoSuggest` configuration
- **Telemetry**: Track tutorial completion rates (opt-in)

### With Documentation
- Tutorial module content based on existing docs
- Links to relevant documentation sections
- Consistent terminology and examples

## Success Metrics

- Tutorial completion rate (% users who finish)
- Time-to-first-productive-use (reduced from days to hours)
- Support ticket reduction (fewer basic questions)
- Feature discovery rate (% users who use advanced features)
- User satisfaction scores (post-tutorial survey)

## Implementation Phases

### Phase 1: MVP (2-3 weeks)
- Basic tutorial engine
- Module 1 (Basics) fully implemented
- Progress tracking
- Simple text-based UI

### Phase 2: Expansion (3-4 weeks)
- Modules 2-5 implementation
- Enhanced UI with colors/formatting
- Hint system
- Resume functionality

### Phase 3: Polish (2 weeks)
- Sandbox environment
- Telemetry integration
- User feedback collection
- Documentation

## Alternatives Considered

1. **Video Tutorials**: Less interactive, can't verify learning
2. **Written Documentation**: Already exists, not hands-on
3. **Example Scripts**: Passive learning, no validation

## Open Questions

1. Should tutorials run in the main chat or separate mode?
2. How to handle users who want to explore mid-tutorial?
3. Should we support custom/community-created tutorials?
4. Translation/internationalization needs?

## Resources Required

- **Development**: 1-2 engineers, 6-8 weeks total
- **Design**: UX review for tutorial flow
- **Documentation**: Tutorial content writing
- **Testing**: User testing with new users

## Related Work

- VS Code's interactive playground
- GitHub's learning lab
- Vim tutor (`vimtutor`)
- Git tutorial (`git help tutorial`)

## Future Enhancements

- Community-contributed tutorial modules
- Language-specific tutorials (Python, JavaScript, etc.)
- Role-based tutorials (DevOps, Data Science, Web Dev)
- Achievement badges for gamification
- Tutorial authoring CLI for custom tutorials

## Conclusion

Interactive Tutorial Mode addresses the primary barrier to Gemini CLI adoption: the learning curve. By providing structured, hands-on learning experiences, we can dramatically reduce time-to-productivity and increase user satisfaction.

**Recommendation**: Implement in phases, starting with MVP to validate approach and gather user feedback before full implementation.
