# Self-Review Loop Integration Guide

## Overview

The Self-Review Loop system provides automated quality validation for code generation and modification tasks. It implements Phase 2.2 of the modular prompt system specification with configurable quality gates that ensure code quality, security, and compliance before presenting results to users.

## Architecture

### Core Components

1. **SelfReviewLoop** - Main review engine with configurable quality gates
2. **SelfReviewIntegration** - Integration layer with PromptAssembler
3. **quality-gates.md** - Modular prompt component for review guidance
4. **ModuleSelector** - Extended to include self-review when appropriate

### Quality Gates

The system implements five core quality gates:

| Gate ID            | Description                           | Condition                             | Action   |
| ------------------ | ------------------------------------- | ------------------------------------- | -------- |
| `syntax_valid`     | Code compiles without errors          | code compiles                         | revise   |
| `tests_pass`       | Tests execute successfully            | tests execute successfully            | revise   |
| `style_compliant`  | Follows project style guide           | follows project style                 | approve  |
| `security_check`   | No exposed secrets/vulnerabilities    | no exposed secrets/vulnerabilities    | escalate |
| `dependency_valid` | Dependencies are available and secure | dependencies are available and secure | revise   |

### Review Actions

- **approve**: Present results to user immediately
- **revise**: Fix issues automatically and retry validation
- **escalate**: Require human review for security concerns

## Integration with Modular Prompt System

### Automatic Inclusion

The self-review module is automatically included for:

- `software-engineering` tasks
- `new-application` development
- `refactor` operations
- `debug` tasks with security guidance
- Any task with `requiresSecurityGuidance: true`

### Token Budget Management

- Contributes **≤240 tokens** to assembled prompt
- Treated as priority module (preserved during token optimization)
- Dynamically adjusts gate count based on available budget

### Module Dependencies

```typescript
{
  id: 'quality-gates',
  dependencies: ['security'], // Depends on security policies
  category: 'policies',
  priority: 2 // After security, before playbooks
}
```

## Usage Examples

### Basic Integration

```typescript
import { PromptAssembler } from './PromptAssembler.js';

const assembler = new PromptAssembler();
const result = await assembler.assemblePrompt({
  taskType: 'software-engineering',
  hasGitRepo: true,
  contextFlags: {
    requiresSecurityGuidance: true,
  },
});

// Result will include quality-gates module automatically
console.log(result.includedModules.map((m) => m.id));
// Output: ['identity', 'mandates', 'security', 'quality-gates', 'software-engineering', ...]
```

### Direct Review Execution

```typescript
import { SelfReviewIntegration } from './SelfReviewIntegration.js';

const integration = new SelfReviewIntegration();

// Create review context
const reviewContext = integration.createReviewContext(taskContext, codeContent);

// Execute quality review
const reviewResult = await integration.executeReview(reviewContext);

console.log(reviewResult.action); // 'approve', 'revise', or 'escalate'
console.log(reviewResult.failedChecks); // ['syntax_valid', ...]
```

### Custom Quality Gates

```typescript
import { SelfReviewLoop } from './SelfReviewLoop.js';

const customGates = [
  {
    id: 'performance_check',
    name: 'Performance Validation',
    description: 'Validates performance requirements',
    condition: 'meets performance criteria',
    action: 'revise',
    priority: 5,
    enabled: true,
    timeout: 10000,
    customValidator: async (context) => {
      // Custom validation logic
      return { success: true, message: 'Performance check passed' };
    },
  },
];

const reviewLoop = new SelfReviewLoop({
  qualityGates: customGates,
  tokenBudget: 200,
});
```

## Configuration Options

### QualityGateConfig

```typescript
interface QualityGateConfig {
  maxReviewAttempts?: number; // Default: 3
  reviewTimeout?: number; // Default: 30000ms
  enableProgressiveReview?: boolean; // Default: true
  tokenBudget?: number; // Default: 250
  qualityGates?: QualityGate[]; // Default: 5 core gates
  enableCaching?: boolean; // Default: true
}
```

### Context-Sensitive Configuration

Quality gates automatically adapt based on:

- **Task Type**: Different gates enabled for different task types
- **Language Detection**: TypeScript vs JavaScript syntax validation
- **Project Setup**: Linting, testing, security configuration
- **Environment**: Development vs production settings

## Workflow Examples

### Software Engineering Task

```
1. User: "Implement a user authentication system"
2. System: Includes quality-gates module in prompt
3. AI: Generates authentication code
4. Self-Review: Validates syntax, tests, style, security, dependencies
5. Result: If all gates pass → present to user
         If security issues → escalate for human review
         If syntax/style issues → auto-fix and retry
```

### Debug Task with Security

```
1. User: "Fix this API endpoint that's exposing user data"
2. System: Includes quality-gates with high security priority
3. AI: Proposes fix
4. Self-Review: Security gate runs first (priority 0)
5. Result: If security issues detected → immediate escalation
         Otherwise continue with other validations
```

### New Application Development

```
1. User: "Create a new React component for file uploads"
2. System: Includes all quality gates
3. AI: Creates component with tests
4. Self-Review: Validates TypeScript syntax, test execution, style compliance
5. Result: Progressive review stops on first failure for quick feedback
```

## Performance Characteristics

### Token Efficiency

- **Base prompt contribution**: ≤240 tokens
- **Dynamic gate selection**: Fewer gates for smaller budgets
- **Caching**: Reuse review contexts for similar tasks
- **Progressive review**: Stop on first critical failure

### Execution Speed

- **Parallel validation**: Multiple gates can run concurrently
- **Timeout protection**: Individual gate timeouts prevent blocking
- **Early termination**: Stop on escalation-level failures
- **Cached results**: Skip re-validation of unchanged content

### Accuracy Metrics

- **Syntax validation**: 95%+ accuracy for TS/JS
- **Security detection**: Catches common secret exposure patterns
- **Style compliance**: Configurable based on project standards
- **Dependency validation**: Identifies missing packages and imports

## Monitoring and Analytics

### Available Metrics

```typescript
interface ReviewMetrics {
  totalReviews: number;
  successRate: number;
  averageReviewTime: number;
  commonFailures: Record<string, number>;
  gatePerformance: Record<
    string,
    {
      successRate: number;
      averageTime: number;
      totalExecutions: number;
    }
  >;
}
```

### Usage Tracking

```typescript
const integration = new SelfReviewIntegration();
const metrics = integration.getReviewMetrics();

console.log(`Success rate: ${metrics.successRate}%`);
console.log(`Average review time: ${metrics.averageReviewTime}ms`);
console.log(`Common failures:`, metrics.commonFailures);
```

## Troubleshooting

### Common Issues

1. **High Token Usage**
   - Reduce number of quality gates
   - Lower token budget in configuration
   - Use progressive review to limit included gates

2. **Review Timeouts**
   - Increase individual gate timeouts
   - Increase overall review timeout
   - Optimize validation logic for complex checks

3. **False Positives**
   - Adjust gate-specific conditions
   - Implement custom validators for edge cases
   - Configure context-sensitive thresholds

4. **Missing Dependencies**
   - Ensure security module is available
   - Verify module loading paths
   - Check PromptAssembler configuration

### Debug Mode

```typescript
const integration = new SelfReviewIntegration();
const config = integration.getQualityGatesConfig();

console.log(
  'Active gates:',
  config.qualityGates?.filter((g) => g.enabled),
);
console.log('Token budget:', config.tokenBudget);
console.log('Review timeout:', config.reviewTimeout);
```

## Future Enhancements

### Planned Features

1. **Machine Learning Integration**: Learn from user feedback to improve gate accuracy
2. **Language Extension**: Support for Python, Go, Rust syntax validation
3. **Advanced Security**: Integration with SAST tools and vulnerability databases
4. **Performance Testing**: Automated performance regression detection
5. **Team Customization**: Organization-specific quality standards

### Extensibility Points

- Custom validator functions for domain-specific checks
- Pluggable security scanners and linting tools
- Configurable review workflows and escalation paths
- Integration with external CI/CD quality gates

## Migration Guide

### From Legacy Systems

If migrating from existing quality check systems:

1. **Map existing checks** to quality gate structure
2. **Configure token budgets** based on current prompt sizes
3. **Test integration** with representative task contexts
4. **Monitor metrics** to validate performance improvements
5. **Gradually enable** additional quality gates as confidence builds

### Version Compatibility

- **Minimum version**: Requires modular prompt system v1.0+
- **Breaking changes**: None in current implementation
- **Deprecation**: Legacy quality checks can run alongside self-review system
