# Adding Examples to the Example Library

**Audience**: Developers, Contributors
**Difficulty**: Beginner
**Time**: 10-15 minutes

---

## Overview

This guide explains how to add new examples to the Gemini CLI Example Library. Whether you're contributing to the main library or creating custom examples for your team, this guide will walk you through the process step-by-step.

## Prerequisites

- Basic TypeScript knowledge
- Familiarity with Gemini CLI
- Text editor or IDE
- (For contributions) Git and GitHub account

---

## Quick Start

### 1. Create Example File

Navigate to the appropriate category directory:

```bash
cd packages/core/src/examples/examples/<category>/
```

Create a new TypeScript file:

```bash
touch my-new-example.ts
```

### 2. Define Your Example

```typescript
/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Example } from '../../types.js';

const example: Example = {
  // Unique ID (use kebab-case)
  id: 'my-example-id',

  // Short, clear title
  title: 'My Example Title',

  // One sentence description
  description: 'Brief description of what this example does',

  // Choose appropriate category
  category: 'development', // or 'code-understanding', 'file-operations', etc.

  // Add relevant tags
  tags: ['keyword1', 'keyword2', 'keyword3'],

  // Set difficulty level
  difficulty: 'beginner', // or 'intermediate', 'advanced'

  // Estimated completion time
  estimatedTime: '2-3 minutes',

  // Tools this example uses
  requiredTools: ['read_files', 'write_files'],

  // Permissions needed
  requiredPermissions: ['file-write'],

  // The actual prompt users will run
  examplePrompt: `Your clear, well-structured prompt here.

Include:
1. What to do
2. How to structure output
3. Any specific requirements`,

  // What users should expect to see
  expectedOutcome: 'Description of the expected result',

  // Helpful tips for users
  tips: [
    'Tip 1: Something helpful',
    'Tip 2: Another useful tip',
  ],

  // Related examples (optional)
  relatedExamples: ['similar-example-id'],

  // Documentation links (optional)
  documentationLinks: ['/docs/relevant-page.md'],

  // Mark as featured (optional, only for exceptional examples)
  featured: false,
};

export default example;
```

### 3. Register Your Example

Add import to `packages/core/src/examples/examples/index.ts`:

```typescript
// In the imports section
import myNewExample from './<category>/my-new-example.js';

// In the BUILT_IN_EXAMPLES array
export const BUILT_IN_EXAMPLES: Example[] = [
  // ... existing examples
  myNewExample,
];
```

### 4. Test Your Example

```bash
# Build the project
npm run build

# Test your example
gemini /examples show my-example-id
gemini /examples run my-example-id
```

---

## Example Anatomy

### Required Fields

Every example MUST have these fields:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | string | Unique identifier (kebab-case) | `generate-unit-tests` |
| `title` | string | Display name | `Generate Unit Tests` |
| `description` | string | One-line summary | `Create comprehensive unit tests` |
| `category` | ExampleCategory | Primary category | `development` |
| `tags` | string[] | Keywords for search | `['testing', 'tdd']` |
| `difficulty` | ExampleDifficulty | Skill level | `beginner` |
| `estimatedTime` | string | Time to complete | `3-5 minutes` |
| `requiredTools` | string[] | Gemini CLI tools needed | `['read_files']` |
| `requiredPermissions` | string[] | Permissions needed | `['file-write']` |
| `examplePrompt` | string | The actual prompt | See below |
| `expectedOutcome` | string | What should happen | See below |
| `tips` | string[] | Helpful advice | See below |
| `relatedExamples` | string[] | Similar example IDs | `['other-example']` |
| `documentationLinks` | string[] | Relevant docs | `['/docs/page.md']` |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `featured` | boolean | Show in featured list |
| `contextFiles` | string[] | Files to include with @ |
| `prerequisites` | string[] | Steps before running |
| `resources` | ExampleResource[] | Additional resources |

---

## Categories

Choose the most appropriate category:

### code-understanding
For examples that help understand code:
- Explain architecture
- Find bugs
- Understand flow
- Code review

### development
For examples that help write/modify code:
- Generate code
- Write tests
- Refactor
- Commit messages

### file-operations
For examples that manipulate files:
- Batch operations
- File organization
- Format conversion
- Rename/move files

### data-analysis
For examples that analyze data:
- Parse logs
- Analyze CSV
- Extract insights
- Generate reports

### automation
For examples that automate tasks:
- Workflows
- Scripts
- Batch processing
- CI/CD tasks

### documentation
For examples that create documentation:
- README files
- API docs
- Tutorials
- Comments

---

## Writing Great Prompts

### Structure

Good prompts have clear structure:

```
What to do (high level)

Specific requirements:
1. First requirement
2. Second requirement
3. Third requirement

Output format:
- How to structure the result
- What to include/exclude

Additional context:
- Any important constraints
- Edge cases to handle
```

### Example: Good Prompt

```typescript
examplePrompt: `Generate comprehensive unit tests for @src/utils/validator.ts

Requirements:
1. Test all exported functions
2. Include edge cases (null, undefined, empty values)
3. Add tests for error handling
4. Mock external dependencies
5. Use descriptive test names

Use the Jest framework (already configured).
Write tests to: tests/utils/validator.test.ts`,
```

### Example: Bad Prompt

```typescript
// Too vague
examplePrompt: `Write some tests`

// Too complex
examplePrompt: `Write tests and also refactor the code and add documentation and fix all bugs...`

// Missing context
examplePrompt: `Generate tests` // Which file? What framework?
```

### Best Practices

**Do**:
- Be specific about what to do
- Provide clear requirements
- Specify output format
- Include context (files, framework, etc.)
- Keep prompts focused on one task

**Don't**:
- Use vague language
- Combine multiple unrelated tasks
- Assume context
- Write novels (keep it concise)
- Use jargon without explanation

---

## Writing Good Descriptions

### Expected Outcome

Describe WHAT users will get, not HOW it works:

**Good**:
```typescript
expectedOutcome: 'Complete test file with 10+ test cases covering main functionality and edge cases'
```

**Bad**:
```typescript
expectedOutcome: 'Gemini will read the file and then write tests using the test framework'
```

### Tips

Tips should be actionable and helpful:

**Good Tips**:
```typescript
tips: [
  'Run tests after generation to verify they pass',
  'Review generated tests for project-specific logic',
  'Add more edge cases based on your requirements',
]
```

**Bad Tips**:
```typescript
tips: [
  'Tests are important',  // Too vague
  'Use this example',     // Not actionable
]
```

---

## Testing Your Example

### Manual Testing

1. **Build**: `npm run build`
2. **List**: `gemini /examples` (should appear)
3. **Show**: `gemini /examples show your-example-id`
4. **Run**: `gemini /examples run your-example-id`
5. **Verify**: Check the output matches expectations

### Automated Testing

Add a test in the appropriate test file:

```typescript
// packages/core/src/examples/registry.test.ts
it('should have my new example', () => {
  const example = registry.get('my-example-id');
  expect(example).toBeDefined();
  expect(example?.category).toBe('development');
});
```

### Validation Checklist

Before submitting:

- [ ] ID is unique and uses kebab-case
- [ ] Title is clear and concise
- [ ] Description is one clear sentence
- [ ] Category is appropriate
- [ ] Tags are relevant
- [ ] Difficulty level is accurate
- [ ] Time estimate is realistic
- [ ] Required tools are listed
- [ ] Prompt is well-structured
- [ ] Expected outcome is clear
- [ ] Tips are helpful
- [ ] Example actually works when run
- [ ] No typos or grammar errors

---

## Examples by Difficulty

### Beginner Examples

Characteristics:
- Single, focused task
- Common use case
- Minimal prerequisites
- 1-5 minute completion
- Uses basic tools

Example:
```typescript
{
  id: 'format-code',
  title: 'Format Code with Prettier',
  difficulty: 'beginner',
  estimatedTime: '1 minute',
  requiredTools: ['run_shell_command'],
  examplePrompt: 'Run prettier to format all TypeScript files in src/'
}
```

### Intermediate Examples

Characteristics:
- Multiple related tasks
- Requires some domain knowledge
- 5-10 minute completion
- May use multiple tools
- More complex prompts

Example:
```typescript
{
  id: 'add-feature-with-tests',
  title: 'Add Feature with Tests',
  difficulty: 'intermediate',
  estimatedTime: '8-10 minutes',
  requiredTools: ['read_files', 'write_files'],
  examplePrompt: '...' // More complex multi-step prompt
}
```

### Advanced Examples

Characteristics:
- Complex, multi-step processes
- Requires expert knowledge
- 10+ minute completion
- Uses advanced tools
- Sophisticated prompts

Example:
```typescript
{
  id: 'migrate-architecture',
  title: 'Migrate to Microservices',
  difficulty: 'advanced',
  estimatedTime: '20-30 minutes',
  requiredTools: ['read_files', 'write_files', 'grep_search'],
  examplePrompt: '...' // Complex architectural changes
}
```

---

## Contributing to Main Library

### Process

1. **Fork the repository**
   ```bash
   gh repo fork google-gemini/gemini-cli
   ```

2. **Create a branch**
   ```bash
   git checkout -b add-example-<name>
   ```

3. **Add your example** (following this guide)

4. **Test thoroughly**
   ```bash
   npm run build
   npm run test
   # Manual testing
   ```

5. **Commit with good message**
   ```bash
   git add .
   git commit -m "feat(examples): add <example-name>

   - Add example for <use-case>
   - Category: <category>
   - Difficulty: <level>"
   ```

6. **Push and create PR**
   ```bash
   git push origin add-example-<name>
   gh pr create
   ```

### PR Guidelines

Your PR should include:
- [ ] New example file
- [ ] Updated index.ts with import
- [ ] Tests (if adding new functionality)
- [ ] Clear description of what example does
- [ ] Verification that example works

PR template:
```markdown
## Summary
Add new example: <example-name>

## Category
<category>

## Use Case
Describe when someone would use this example

## Testing
- [ ] Built successfully
- [ ] Example shows in list
- [ ] Example runs successfully
- [ ] Output matches expectations

## Checklist
- [ ] Follows example template
- [ ] No typos or errors
- [ ] Appropriate difficulty level
- [ ] Clear, actionable prompt
```

---

## Custom Team Examples

For team-specific examples, you can create them locally:

### Project-Local Examples

Create in your project:
```
your-project/
├── .gemini/
│   └── examples/
│       ├── deploy-to-staging.ts
│       ├── run-migrations.ts
│       └── generate-changelog.ts
```

Examples are automatically loaded from `.gemini/examples/`.

### Sharing with Team

Commit `.gemini/examples/` to your repository:

```bash
git add .gemini/examples/
git commit -m "Add team-specific examples"
git push
```

Team members get the examples when they pull.

---

## FAQ

### How do I know if my example is good enough?

Ask yourself:
- Would this help a new user?
- Is it clear what this does?
- Does it work reliably?
- Is there similar documentation elsewhere?

### Can I have multiple examples for similar tasks?

Yes, if they serve different purposes or skill levels. For example:
- `write-tests-basic` (beginner)
- `write-tests-advanced` (with mocks, coverage, etc.)

### Should examples be framework-specific?

Prefer framework-agnostic when possible. If framework-specific, mention it clearly in title/description.

### How long should prompts be?

Aim for 5-15 lines. Enough to be clear, not so much it's overwhelming.

### Can examples chain together?

Yes! Use `relatedExamples` to link them. But each should work independently.

---

## Additional Resources

- [Example Library User Guide](../features/example-library.md)
- [TypeScript Types Reference](../../packages/core/src/examples/types.ts)
- [Existing Examples](../../packages/core/src/examples/examples/)
- [Contributing Guide](../CONTRIBUTING.md)

---

## Need Help?

- **Questions**: Open a discussion on GitHub
- **Bugs**: Report via `gemini /bug`
- **Ideas**: Open an issue with `enhancement` label

---

**Happy Contributing!** 🎉
