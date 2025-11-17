# Tutorial Mode

Interactive tutorials to help you master Gemini CLI from basics to advanced features.

## Overview

Tutorial Mode provides 10 comprehensive modules covering everything from getting started to advanced techniques. Each tutorial includes interactive exercises, quizzes, and practical examples to ensure hands-on learning.

## Available Tutorials

### Beginner Level

#### 1. Getting Started
**Duration:** 15 minutes
**Prerequisites:** None

Learn the fundamentals of Gemini CLI:
- Basic commands and navigation
- Starting your first chat
- Understanding responses
- Getting help when needed

**Start:** `/tutorial start getting-started`

#### 2. File Operations
**Duration:** 20 minutes
**Prerequisites:** Getting Started

Master file operations:
- Reading and writing files
- File search and navigation
- Understanding file contexts
- Best practices for file operations

**Start:** `/tutorial start file-operations`

#### 3. Slash Commands
**Duration:** 25 minutes
**Prerequisites:** Getting Started

Learn all available slash commands:
- Built-in commands overview
- Configuration commands
- Productivity commands
- Custom command creation

**Start:** `/tutorial start slash-commands`

### Intermediate Level

#### 4. Multimodal Prompts
**Duration:** 20 minutes
**Prerequisites:** File Operations

Work with images and multimodal content:
- Uploading images
- Describing visual content
- Combining text and images
- Multimodal best practices

**Start:** `/tutorial start multimodal`

#### 5. Tool Usage
**Duration:** 30 minutes
**Prerequisites:** Slash Commands

Understand how Gemini CLI uses tools:
- Available tools overview
- Tool selection process
- Reading tool outputs
- Optimizing tool usage

**Start:** `/tutorial start tool-usage`

#### 6. Workflows Introduction
**Duration:** 25 minutes
**Prerequisites:** Tool Usage

Get started with workflows:
- What are workflows
- Running built-in workflows
- Understanding workflow steps
- Customizing workflows

**Start:** `/tutorial start workflows-intro`

### Advanced Level

#### 7. Advanced Prompting
**Duration:** 35 minutes
**Prerequisites:** Tool Usage

Master advanced prompting techniques:
- Effective prompt engineering
- Context management
- Chain of thought prompting
- Few-shot examples

**Start:** `/tutorial start advanced-prompting`

#### 8. Project Analysis
**Duration:** 30 minutes
**Prerequisites:** File Operations, Tool Usage

Analyze and understand codebases:
- Project structure analysis
- Code quality assessment
- Dependency management
- Refactoring strategies

**Start:** `/tutorial start project-analysis`

#### 9. Custom Commands
**Duration:** 40 minutes
**Prerequisites:** Slash Commands

Create your own custom commands:
- Command structure
- Parameter handling
- Integration with CLI
- Publishing commands

**Start:** `/tutorial start custom-commands`

#### 10. Best Practices
**Duration:** 30 minutes
**Prerequisites:** All previous tutorials

Learn expert tips and best practices:
- Productivity workflows
- Security considerations
- Performance optimization
- Troubleshooting common issues

**Start:** `/tutorial start best-practices`

## Tutorial Features

### Step Types

- **Instruction:** Explanatory content with examples
- **Exercise:** Hands-on practice with validation
- **Quiz:** Knowledge checks with immediate feedback
- **Practice:** Open-ended challenges

### Progress Tracking

View your progress at any time:
```
/tutorial progress getting-started
```

Shows:
- Steps completed
- Current step number
- Time spent
- Completion percentage

### Navigation

Move through tutorial steps:
```
/tutorial next getting-started      # Go to next step
/tutorial previous getting-started  # Go back one step
/tutorial complete getting-started  # Mark current step complete
```

## Getting Started

1. **List available tutorials:**
   ```
   /tutorial list
   ```

2. **Start your first tutorial:**
   ```
   /tutorial start getting-started
   ```

3. **Follow the instructions** and complete each step

4. **Track your progress:**
   ```
   /tutorial stats
   ```

## Tips for Success

- **Take your time** - Tutorials are self-paced
- **Practice actively** - Complete all exercises
- **Review concepts** - Use previous/next to revisit topics
- **Ask questions** - Use the main chat for clarification
- **Check your stats** - Monitor your learning progress

## Statistics

View your overall tutorial statistics:
```
/tutorial stats
```

Shows:
- Total modules available
- Modules completed
- Modules in progress
- Total time spent learning

## Learning Path Integration

Completing tutorials unlocks achievements and grants XP:
- **Tutorial Starter** - Complete first tutorial (+30 XP)
- **Eager Learner** - Complete 3 tutorials (+75 XP)
- **Tutorial Champion** - Complete 5 tutorials (+150 XP)
- **Tutorial Completionist** - Complete all 10 tutorials (+300 XP)

Check your achievements: `/progress achievements`

## Troubleshooting

**Tutorial not starting?**
- Ensure you're using the correct tutorial ID
- Check `/tutorial list` for available tutorials

**Lost your progress?**
- Progress is saved automatically
- Use `/tutorial progress <id>` to resume

**Stuck on a step?**
- Use `/tutorial previous` to review
- Ask questions in the main chat
- Check `/help` for general assistance

## Next Steps

After completing tutorials:
- Try `/workflow list` to explore workflows
- Check `/progress dashboard` for achievements
- Experiment with custom commands
- Share your knowledge with others
