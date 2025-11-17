# Workflows

Automate common development tasks with pre-built workflow templates.

## Overview

Workflows provide a powerful way to automate repetitive tasks and standardize processes. Gemini CLI includes 20 built-in workflow templates covering development, testing, documentation, DevOps, and more.

## What are Workflows?

A workflow is a sequence of steps that automate a task:
- **Shell steps** execute commands
- **Prompt steps** send instructions to Gemini
- **Workflow steps** chain other workflows
- **Conditional steps** make decisions based on conditions

Workflows support variables for customization and can handle errors gracefully.

## Available Workflows

### Development (5)

#### Code Review
Review code changes and provide feedback.
```
/workflow run code-review
```

#### Bug Fix Assistant
Help diagnose and fix bugs in your code.
```
/workflow run bug-fix
```

#### Code Refactoring
Refactor code for better readability and performance.
```
/workflow run refactor
```

#### Error Handling
Add comprehensive error handling to code.
```
/workflow run error-handling
```

#### Type Safety
Add TypeScript type definitions to code.
```
/workflow run type-safety
```

### Testing (1)

#### Test Generation
Create comprehensive unit tests for code.
```
/workflow run test-generation
```

### Documentation (3)

#### Documentation Generator
Generate documentation for code.
```
/workflow run doc-generation
```

#### README Generator
Generate a comprehensive README file.
```
/workflow run readme-gen
```

#### Changelog Update
Update CHANGELOG with recent changes.
```
/workflow run changelog-update
```

### Architecture (1)

#### API Design
Design REST API endpoints and structure.
```
/workflow run api-design
```

### Database (1)

#### Database Schema
Design database schema and relationships.
```
/workflow run db-schema
```

### Security (1)

#### Security Audit
Audit code for security vulnerabilities.
```
/workflow run security-audit
```

### Optimization (1)

#### Performance Analysis
Identify and analyze performance bottlenecks.
```
/workflow run performance-analysis
```

### Migration (1)

#### Migration Helper
Create migration plans for version upgrades.
```
/workflow run migration-helper
```

### DevOps (2)

#### CI/CD Setup
Set up continuous integration and deployment.
```
/workflow run ci-setup
```

#### Docker Setup
Create Docker configuration for projects.
```
/workflow run docker-setup
```

### Git (1)

#### Git Workflow
Automate git operations with custom messages.
```
/workflow run git-workflow message="Your commit message"
```

### Maintenance (1)

#### Update Dependencies
Update project dependencies.
```
/workflow run dependency-update
```

### Setup (1)

#### Initialize Project
Set up new project structure and files.
```
/workflow run project-init
```

### Quality (1)

#### Accessibility Audit
Check code for accessibility compliance.
```
/workflow run accessibility-audit
```

## Using Workflows

### List All Workflows

View all available workflows:
```
/workflow list
```

Filter by category:
```
/workflow list development
/workflow list testing
/workflow list documentation
```

### View Workflow Details

See detailed information about a workflow:
```
/workflow show code-review
```

Shows:
- Description
- Version
- Category and tags
- Default variables
- All steps

### Execute a Workflow

Run a workflow:
```
/workflow run code-review
```

With custom variables:
```
/workflow run git-workflow message="Fix: resolve authentication bug"
```

Multiple variables:
```
/workflow run custom-workflow var1=value1 var2=value2
```

### View Statistics

See workflow execution statistics:
```
/workflow stats
```

Shows:
- Total workflows available
- Number of executions
- Successful executions
- Failed executions

## Workflow Variables

Many workflows support variables for customization:

### Syntax
Use `{{variable}}` in workflow definitions:
```yaml
steps:
  - type: shell
    command: git commit -m "{{message}}"
```

### Usage
Pass variables when running:
```
/workflow run workflow-name variable=value
```

### Default Values
Workflows can have default variables that are used if none are provided.

## Understanding Workflow Results

After execution, you'll see:
- **Status:** Completed, failed, or running
- **Duration:** Execution time
- **Step Results:** Output from each step
- **Error Messages:** If any step failed

Example output:
```
Workflow Execution: Code Review

Status: completed
Duration: 1234ms

Results:
✅ analyze
   Review the code changes and provide feedback
```

## Error Handling

Workflows handle errors based on configuration:
- **Stop:** Halt on first error (default)
- **Continue:** Skip failed steps and continue
- **Rollback:** Undo changes on failure

## Best Practices

1. **Review workflow details** before running
2. **Use appropriate variables** for customization
3. **Check workflow results** for success
4. **Monitor workflow stats** to track usage
5. **Combine workflows** for complex tasks

## Learning Path Integration

Using workflows unlocks achievements and grants XP:
- **Workflow Novice** - Execute first workflow (+30 XP)
- **Workflow User** - Execute 5 workflows (+75 XP)
- **Workflow Expert** - Execute 10 workflows (+150 XP)
- **Automation Master** - Execute 25 workflows (+300 XP)

Check your achievements: `/progress achievements`

## Creating Custom Workflows

Custom workflows are defined in YAML or JSON format. Contact your administrator or check the extension documentation for details on creating custom workflows.

## Troubleshooting

**Workflow not found?**
- Check available workflows: `/workflow list`
- Verify the workflow ID is correct

**Execution failed?**
- Review error messages in results
- Check variable values are correct
- Ensure prerequisites are met

**Need help?**
- Use `/help` for general assistance
- Ask in the main chat for specific guidance

## Examples

### Basic Usage
```
# Review code
/workflow run code-review

# Generate tests
/workflow run test-generation

# Update dependencies
/workflow run dependency-update
```

### With Variables
```
# Git commit with custom message
/workflow run git-workflow message="feat: add user authentication"

# Custom project initialization
/workflow run project-init name=my-app type=nodejs
```

### Workflow Chains
```
# Complete development cycle
/workflow run test-generation
/workflow run code-review
/workflow run doc-generation
/workflow run git-workflow message="chore: update tests and docs"
```

## Next Steps

- Explore all workflows: `/workflow list`
- Try running your first workflow
- Check execution statistics: `/workflow stats`
- Combine workflows for complex automation
- Track your progress: `/progress dashboard`
