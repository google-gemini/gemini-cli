# Phase 3: Mastery - Tutorials, Workflows, and Learning Path

**Status:** ✅ Complete
**Implementation Date:** November 2025
**Features:** Tutorial Mode (Weeks 28-35), Workflows (Weeks 36-44), Learning Path (Weeks 45-52)
**IMPLEMENTATION_PLAN.md:** Weeks 28-52

## Overview

Phase 3 implements three major mastery features to help users advance from beginners to experts:

1. **Tutorial Mode** (Weeks 28-35) - Interactive tutorials with 10 comprehensive modules
2. **Workflows** (Weeks 36-44) - YAML/JSON workflow templates with 20 built-in workflows
3. **Learning Path** (Weeks 45-52) - Achievements, XP system, and gamification

## Tutorial Mode

### Architecture

Module System → Progress Tracking → Step Navigation → Exercise Validation

**Files:**
- `packages/core/src/tutorials/types.ts` - Type definitions
- `packages/core/src/tutorials/tutorial-engine.ts` - Tutorial engine
- `packages/core/src/tutorials/modules.ts` - 10 tutorial modules
- `packages/core/src/tutorials/index.ts` - Module exports
- `packages/cli/src/ui/commands/tutorialCommand.ts` - CLI command

### Features

- **10 Tutorial Modules:**
  1. Getting Started - Learn the basics
  2. File Operations - Working with files
  3. Slash Commands - Mastering commands
  4. Multimodal - Multimodal prompts
  5. Tool Usage - Understanding tools
  6. Workflows Intro - Introduction to workflows
  7. Advanced Prompting - Advanced techniques
  8. Project Analysis - Analyzing projects
  9. Custom Commands - Creating commands
  10. Best Practices - Tips and best practices

- **Step Types:** Instruction, exercise, quiz, practice
- **Difficulty Levels:** Beginner, intermediate, advanced
- **Progress Tracking:** Current step, completed steps, time spent
- **Prerequisites:** Module dependency system

### CLI Commands

- `/tutorial list` - List all tutorials
- `/tutorial start <id>` - Start a tutorial
- `/tutorial progress <id>` - Show tutorial progress
- `/tutorial next <id>` - Next step
- `/tutorial previous <id>` - Previous step
- `/tutorial complete <id>` - Complete current step
- `/tutorial stats` - Show learning statistics

## Workflows

### Architecture

Workflow Definition → Variable Substitution → Step Execution → Result Tracking

**Files:**
- `packages/core/src/workflows/types.ts` - Type definitions
- `packages/core/src/workflows/workflow-engine.ts` - Workflow engine
- `packages/core/src/workflows/templates.ts` - 20 built-in workflows
- `packages/core/src/workflows/index.ts` - Module exports
- `packages/cli/src/ui/commands/workflowCommand.ts` - CLI command

### Features

- **20 Built-in Workflows:**
  1. Code Review - Review code changes
  2. Bug Fix Assistant - Diagnose and fix bugs
  3. Test Generation - Create unit tests
  4. Documentation Generator - Generate docs
  5. Code Refactoring - Refactor for quality
  6. API Design - Design REST APIs
  7. Database Schema - Design DB schema
  8. Security Audit - Audit for vulnerabilities
  9. Performance Analysis - Identify bottlenecks
  10. Migration Helper - Migration planning
  11. CI/CD Setup - Configure CI/CD
  12. Docker Setup - Create Docker config
  13. Git Workflow - Automate git operations
  14. Dependency Update - Update dependencies
  15. Project Init - Initialize projects
  16. README Generator - Generate README
  17. Changelog Update - Update changelog
  18. Error Handling - Add error handling
  19. Accessibility Audit - Check accessibility
  20. Type Safety - Add TypeScript types

- **Step Types:** Shell, prompt, workflow, conditional
- **Variable Substitution:** {{variable}} pattern
- **Categories:** Development, testing, documentation, architecture, database, security, optimization, migration, devops, git, maintenance, setup, quality
- **Error Handling:** Stop, continue, or rollback on error
- **Execution History:** Track all workflow executions

### CLI Commands

- `/workflow list [category]` - List all workflows
- `/workflow show <id>` - Show workflow details
- `/workflow run <id> [vars]` - Execute a workflow
- `/workflow stats` - Show execution statistics

## Learning Path

### Architecture

Activity Tracking → Achievement Checking → XP Calculation → Level Progression

**Files:**
- `packages/core/src/learning-path/types.ts` - Type definitions
- `packages/core/src/learning-path/learning-path-engine.ts` - Learning path engine
- `packages/core/src/learning-path/achievements.ts` - 33 achievements
- `packages/core/src/learning-path/levels.ts` - 10 level definitions
- `packages/core/src/learning-path/index.ts` - Module exports
- `packages/cli/src/ui/commands/learningPathCommand.ts` - CLI command

### Features

- **10 Levels:**
  1. Novice (0 XP)
  2. Beginner (100 XP)
  3. Apprentice (250 XP)
  4. Intermediate (500 XP)
  5. Advanced (1,000 XP)
  6. Expert (2,000 XP)
  7. Master (3,500 XP)
  8. Guru (5,500 XP)
  9. Sage (8,000 XP)
  10. Legend (12,000 XP)

- **33 Achievements:** Across 8 categories
  - Getting Started: First steps, streaks, dedication
  - Wizard: Complete quick start wizard
  - Onboarding: Task completion milestones
  - Suggestions: Smart suggestion usage
  - Explain Mode: Explanation feature usage
  - Tutorials: Tutorial completion milestones
  - Workflows: Workflow execution milestones
  - Mastery: Well-rounded usage, achievement hunting

- **XP System:**
  - Achievements grant XP (10-1000 XP)
  - Activity tracking (commands, files, tutorials, workflows)
  - Level progression based on total XP
  - XP history tracking

- **Gamification:**
  - Streak tracking (consecutive days active)
  - Progress to next level
  - Recent achievements display
  - Leaderboard rankings

### CLI Commands

- `/progress dashboard` - Show learning dashboard
- `/progress achievements` - View all achievements
- `/progress stats` - Detailed statistics
- `/progress leaderboard` - XP and level info

## Testing

- **tutorial-engine.test.ts** - Tutorial engine tests (100+ assertions)
- **workflow-engine.test.ts** - Workflow engine tests (100+ assertions)
- **learning-path-engine.test.ts** - Learning path tests (100+ assertions)

All tests validate:
- Data integrity (unique IDs, required fields, valid references)
- Core functionality (CRUD operations, state management)
- Edge cases (boundaries, errors, race conditions)
- Persistence (file I/O, state restoration)
- Singleton patterns

## Documentation

- **PHASE_3_MASTERY.md** - Implementation details (this file)
- **tutorial-mode.md** - User guide for tutorials
- **workflows.md** - User guide for workflows
- **learning-path.md** - User guide for learning path

## Integration

All three features are fully integrated:

1. **Core Package Exports:** Added to `packages/core/src/index.ts`
2. **CLI Commands:** Registered in `BuiltinCommandLoader.ts`
3. **Cross-Feature Tracking:** Learning path tracks tutorial and workflow progress
4. **State Persistence:** All features persist state to `~/.gemini-cli/`

## File Locations

### State Files
- Tutorials: `~/.gemini-cli/tutorial-progress.json`
- Workflows: `~/.gemini-cli/workflow-history.json`
- Learning Path: `~/.gemini-cli/learning-path.json`

### Documentation
- Implementation: `docs/implementation/PHASE_3_MASTERY.md`
- Features: `docs/features/tutorial-mode.md`, `workflows.md`, `learning-path.md`

Addresses IMPLEMENTATION_PLAN.md Weeks 28-52.
