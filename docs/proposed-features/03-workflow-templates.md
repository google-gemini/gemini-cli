# Feature Proposal: Workflow Templates System

## Overview

A template system that allows users to quickly bootstrap common multi-step workflows with pre-configured commands, prompts, and automation patterns. Templates can be shared, customized, and executed with a single command.

## Problem Statement

Many tasks require multiple steps and commands in sequence:
- Setting up new projects with specific structures
- Running repetitive analysis workflows
- Executing complex debugging procedures
- Performing multi-step code transformations

Users currently must:
- Remember all steps in the correct order
- Manually execute each command
- Copy-paste from documentation
- Recreate workflows each time

## Proposed Solution

Implement a workflow template system accessible via `/workflow` that provides reusable, parameterized multi-step procedures.

### Core Features

1. **Pre-built Workflow Library**
   - Common development workflows (testing, deployment, debugging)
   - Code quality workflows (linting, formatting, review)
   - Project setup workflows (new repo, new feature, new service)
   - Analysis workflows (performance, security, dependencies)

2. **Parameterized Templates**
   - Accept user inputs for customization
   - Support default values
   - Variable substitution throughout workflow
   - Conditional steps based on parameters

3. **Interactive Execution**
   - Step-by-step execution with confirmations
   - Pause/resume capability
   - Skip optional steps
   - Rollback on failure

4. **Custom Workflow Creation**
   - Define workflows in YAML or JSON
   - Share workflows with team
   - Version control friendly
   - Template inheritance

### Commands

```bash
/workflow list                          # List available workflows
/workflow show <name>                   # Show workflow details
/workflow run <name> [params]           # Execute workflow
/workflow new <name>                    # Create new workflow
/workflow edit <name>                   # Edit existing workflow
/workflow share <name>                  # Export workflow for sharing
/workflow import <file>                 # Import workflow
/workflow validate <name>               # Validate workflow syntax
```

### Workflow Template Structure

```yaml
# .gemini/workflows/setup-new-feature.yaml
name: setup-new-feature
version: 1.0
description: Set up a new feature branch with tests and documentation
author: gemini-cli
tags: [development, git, testing]

# Parameters with defaults and validation
parameters:
  - name: feature_name
    description: Name of the feature (kebab-case)
    required: true
    pattern: "^[a-z0-9-]+$"
    example: "user-authentication"

  - name: create_tests
    description: Create test files
    type: boolean
    default: true

  - name: base_branch
    description: Branch to branch from
    default: "main"

# Workflow steps executed in order
steps:
  - name: create_branch
    description: "Create feature branch"
    type: shell
    command: "git checkout -b feature/{{feature_name}} {{base_branch}}"
    rollback: "git checkout {{base_branch}} && git branch -D feature/{{feature_name}}"

  - name: create_structure
    description: "Create feature directory structure"
    type: prompt
    message: |
      Create the following directory structure for the {{feature_name}} feature:
      - src/features/{{feature_name}}/
      - src/features/{{feature_name}}/components/
      - src/features/{{feature_name}}/utils/
      - src/features/{{feature_name}}/types.ts
      - src/features/{{feature_name}}/index.ts

  - name: create_tests
    description: "Generate test files"
    type: prompt
    condition: "{{create_tests}}"
    message: |
      Create test files for {{feature_name}}:
      - tests/features/{{feature_name}}/{{feature_name}}.test.ts
      - Include example test cases for core functionality

  - name: update_docs
    description: "Update documentation"
    type: prompt
    message: |
      Update CHANGELOG.md and docs/features/{{feature_name}}.md with:
      - Feature description
      - API documentation
      - Usage examples

  - name: initial_commit
    description: "Create initial commit"
    type: shell
    command: |
      git add . &&
      git commit -m "feat: initialize {{feature_name}} feature structure"

# Success message
on_success: |
  ✅ Feature setup complete!

  Next steps:
  1. Start implementing in src/features/{{feature_name}}/
  2. Write tests in tests/features/{{feature_name}}/
  3. Update documentation as needed
  4. Run /workflow run feature-development to continue

# Error handling
on_failure: |
  ❌ Workflow failed. Rolling back changes...
  Run /workflow run setup-new-feature again or create manually.
```

### Built-in Workflow Examples

#### 1. Code Review Workflow
```yaml
name: code-review-workflow
description: Comprehensive code review process

steps:
  - name: check_diff
    type: shell
    command: "git diff {{base_branch}}...HEAD"

  - name: analyze_changes
    type: prompt
    message: "Review the git diff and identify: 1) Potential bugs, 2) Security issues, 3) Performance concerns, 4) Best practice violations"

  - name: test_coverage
    type: shell
    command: "npm test -- --coverage"

  - name: review_tests
    type: prompt
    message: "Analyze test coverage report. Suggest additional test cases for uncovered code paths"

  - name: check_documentation
    type: prompt
    message: "Check if all new public APIs are documented. Suggest documentation improvements"

  - name: generate_summary
    type: prompt
    message: "Create a code review summary with: 1) Changes overview, 2) Issues found, 3) Recommendations, 4) Approval status"
```

#### 2. Bug Investigation Workflow
```yaml
name: debug-bug
description: Systematic bug investigation and fix workflow

parameters:
  - name: bug_description
    description: "Description of the bug"
    required: true

  - name: reproduction_steps
    description: "Steps to reproduce"
    required: false

steps:
  - name: understand_bug
    type: prompt
    message: "Bug: {{bug_description}}\n\nSteps to reproduce: {{reproduction_steps}}\n\nBased on this information, suggest: 1) Likely root causes, 2) Files to investigate, 3) Debugging strategy"

  - name: search_related_code
    type: prompt
    message: "Search the codebase for code related to this bug. Look for: 1) Similar past issues, 2) Recent changes in affected areas, 3) Related error handling"

  - name: analyze_logs
    type: prompt
    message: "If there are error logs or stack traces, analyze them to pinpoint the issue location"

  - name: suggest_fix
    type: prompt
    message: "Based on the investigation, suggest: 1) Root cause, 2) Proposed fix, 3) Test cases to prevent regression"

  - name: implement_fix
    type: prompt
    message: "Implement the suggested fix and add test cases"

  - name: verify_fix
    type: shell
    command: "npm test"

  - name: create_commit
    type: shell
    command: "git add . && git commit -m 'fix: {{bug_description}}'"
```

#### 3. Performance Optimization Workflow
```yaml
name: optimize-performance
description: Identify and fix performance bottlenecks

parameters:
  - name: target_area
    description: "Area to optimize (e.g., 'API routes', 'database queries')"
    required: true

steps:
  - name: profile_current
    type: prompt
    message: "Analyze the {{target_area}} and identify potential performance bottlenecks. Look for: 1) N+1 queries, 2) Unnecessary computations, 3) Memory leaks, 4) Inefficient algorithms"

  - name: measure_baseline
    type: prompt
    message: "Suggest performance tests to establish baseline metrics for {{target_area}}"

  - name: suggest_optimizations
    type: prompt
    message: "Based on the analysis, suggest specific optimizations with estimated impact"

  - name: implement_optimizations
    type: prompt
    message: "Implement the top 3 optimizations that will have the most impact"

  - name: measure_improvement
    type: prompt
    message: "Add performance tests to verify improvements and prevent regressions"
```

### User Interface

```
$ gemini /workflow list

Available Workflows:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Development
  setup-new-feature       Set up new feature branch (5 steps, ~5 min)
  create-new-component    Generate React component with tests (4 steps)
  add-api-endpoint        Add new API endpoint with docs (6 steps)

Code Quality
  code-review-workflow    Comprehensive code review (6 steps, ~10 min)
  debug-bug              Systematic bug investigation (7 steps)
  optimize-performance   Performance optimization workflow (5 steps)

Testing
  add-test-coverage      Add tests for existing code (4 steps)
  integration-test       Create integration test suite (5 steps)

Deployment
  deploy-staging         Deploy to staging environment (8 steps)
  release-new-version    Version bump and release (10 steps)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Use /workflow show <name> for details
💡 Use /workflow run <name> to execute

$ gemini /workflow run setup-new-feature

🚀 Starting workflow: setup-new-feature
   Set up a new feature branch with tests and documentation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Required Parameters:

? Feature name (kebab-case): user-profile-page
? Create test files? (Y/n): Y
? Base branch (default: main): main

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Workflow Preview:
  1. ✓ Create feature branch
  2. ✓ Create feature directory structure
  3. ✓ Generate test files
  4. ✓ Update documentation
  5. ✓ Create initial commit

Continue? (Y/n): Y

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1/5: Create feature branch
$ git checkout -b feature/user-profile-page main
✅ Branch created successfully

Step 2/5: Create feature directory structure
🤖 Creating directories...
✅ Structure created

Step 3/5: Generate test files
🤖 Generating tests...
✅ Tests created

Step 4/5: Update documentation
🤖 Updating docs...
✅ Documentation updated

Step 5/5: Create initial commit
$ git add . && git commit -m "feat: initialize user-profile-page feature structure"
✅ Changes committed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Workflow completed successfully!

Next steps:
1. Start implementing in src/features/user-profile-page/
2. Write tests in tests/features/user-profile-page/
3. Update documentation as needed
4. Run /workflow run feature-development to continue
```

## User Benefits

### For New Users
- Learn best practices through templates
- Reduce cognitive load (don't need to remember all steps)
- Build confidence with guided workflows
- Avoid common mistakes

### For Teams
- Standardize processes across team members
- Share and reuse proven workflows
- Ensure consistency in project structure
- Document tribal knowledge

### For All Users
- Save time on repetitive tasks
- Reduce errors in multi-step processes
- Focus on creative work, not mechanics
- Build personal workflow library

## Technical Implementation

### Directory Structure
```
packages/core/src/workflows/
├── index.ts                 # Workflow engine
├── registry.ts              # Workflow registry
├── executor.ts              # Step execution engine
├── validator.ts             # Template validation
├── templates/
│   ├── development/
│   │   ├── setup-new-feature.yaml
│   │   └── create-component.yaml
│   ├── code-quality/
│   │   ├── code-review.yaml
│   │   └── debug-bug.yaml
│   └── testing/
│       └── add-tests.yaml
└── parser.ts                # YAML/JSON parser
```

### Workflow Engine

```typescript
// packages/core/src/workflows/executor.ts
export interface WorkflowStep {
  name: string;
  description: string;
  type: 'shell' | 'prompt' | 'workflow';
  command?: string;
  message?: string;
  condition?: string;
  rollback?: string;
  timeout?: number;
}

export interface WorkflowTemplate {
  name: string;
  version: string;
  description: string;
  parameters: WorkflowParameter[];
  steps: WorkflowStep[];
  onSuccess?: string;
  onFailure?: string;
}

export class WorkflowExecutor {
  async execute(
    template: WorkflowTemplate,
    params: Record<string, any>,
    options: {
      interactive?: boolean;
      dryRun?: boolean;
      skipConfirmations?: boolean;
    }
  ): Promise<WorkflowResult> {
    // Validate parameters
    this.validateParameters(template, params);

    // Substitute variables
    const resolvedSteps = this.resolveVariables(template.steps, params);

    // Execute steps
    for (const step of resolvedSteps) {
      if (!this.evaluateCondition(step.condition, params)) {
        continue;
      }

      try {
        await this.executeStep(step, options);
      } catch (error) {
        await this.handleFailure(step, error);
        throw error;
      }
    }

    return { success: true, message: template.onSuccess };
  }

  private async executeStep(step: WorkflowStep, options: any): Promise<void> {
    switch (step.type) {
      case 'shell':
        await this.executeShellCommand(step.command);
        break;
      case 'prompt':
        await this.executePrompt(step.message);
        break;
      case 'workflow':
        await this.executeNestedWorkflow(step);
        break;
    }
  }
}
```

### Variable Substitution

```typescript
// packages/core/src/workflows/parser.ts
export class TemplateParser {
  resolveVariables(
    template: string,
    variables: Record<string, any>
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] ?? match;
    });
  }

  evaluateCondition(
    condition: string | undefined,
    variables: Record<string, any>
  ): boolean {
    if (!condition) return true;

    // Simple expression evaluation
    // e.g., "{{create_tests}}" or "{{env}} === 'production'"
    const resolved = this.resolveVariables(condition, variables);
    return eval(resolved); // Use safe evaluator in production
  }
}
```

## Integration Points

### With Existing Features
- **Custom Commands**: Workflows can call custom commands
- **Checkpointing**: Save workflow state, resume later
- **Memory**: Workflows can save/retrieve context
- **MCP Servers**: Workflows can use MCP tools

### With Other Proposed Features
- **Examples**: Convert examples to workflows
- **Tutorial**: Tutorial references workflows
- **Templates**: Use workflow templates in project setup

## Success Metrics

- Workflow usage rate (% users who use workflows)
- Custom workflow creation rate
- Time saved vs manual execution
- Error rate reduction in complex tasks
- Workflow sharing rate (team adoption)

## Implementation Phases

### Phase 1: Core Engine (3 weeks)
- Workflow parser and validator
- Execution engine
- Basic CLI commands
- 5 built-in templates

### Phase 2: Advanced Features (3 weeks)
- Conditional steps
- Variable substitution
- Rollback capability
- Error handling
- 10 additional templates

### Phase 3: User Workflows (2 weeks)
- Custom workflow creation
- Workflow editor
- Share/import functionality
- Template validation

### Phase 4: Integration (1 week)
- Checkpoint integration
- MCP integration
- Documentation
- Telemetry

## Open Questions

1. Should workflows support parallel step execution?
2. How to handle long-running workflows (background execution)?
3. Support for workflow scheduling/cron?
4. Workflow marketplace for sharing?

## Resources Required

- **Development**: 1-2 engineers, 9 weeks
- **Content**: Create 20+ workflow templates
- **Testing**: Test across platforms and scenarios
- **Documentation**: Workflow authoring guide

## Alternatives Considered

1. **Shell Scripts**: Less integrated, no AI prompts
2. **Make/Task Runners**: Separate tool, learning curve
3. **Custom Commands Only**: Less structure, no parameters

## Related Work

- GitHub Actions (workflow YAML)
- GitLab CI/CD pipelines
- Ansible playbooks
- Terraform workflows

## Future Enhancements

- Visual workflow builder (GUI)
- Workflow marketplace
- Team workflow libraries
- Workflow analytics and optimization
- CI/CD integration
- Scheduled workflow execution

## Conclusion

Workflow Templates bring structure and repeatability to common multi-step tasks. They reduce cognitive load, ensure consistency, and capture best practices in shareable, version-controlled formats.

**Recommendation**: High priority for team/enterprise users. Complements automation features and significantly improves productivity for repetitive tasks.
