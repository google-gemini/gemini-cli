# Example Library

**Status**: Implemented ✅
**Version**: 1.0
**Last Updated**: January 2025

---

## Overview

The Example Library is a searchable collection of 50+ real-world use cases that help you discover what's possible with Gemini CLI. Each example is executable, well-documented, and ready to adapt for your needs.

## Quick Start

### Browse All Examples

```bash
gemini /examples
```

### Search for Examples

```bash
# Search by keyword
gemini /examples search git

# Filter by category
gemini /examples category development

# Filter by difficulty
gemini /examples difficulty beginner

# Filter by tags
gemini /examples tag testing
```

### Run an Example

```bash
# View example details
gemini /examples show generate-commit-message

# Run an example directly
gemini /examples run generate-commit-message

# Save an example as a custom command
gemini /examples save generate-commit-message mycommit
```

---

## Features

### 🔍 Powerful Search

Find examples using:
- **Full-text search**: Search titles, descriptions, and tags
- **Category filtering**: Browse by use case category
- **Tag filtering**: Find examples by specific technologies
- **Difficulty filtering**: Filter by skill level
- **Tool filtering**: Find examples using specific tools

### 📚 Comprehensive Coverage

Examples span 6 major categories:

1. **Code Understanding** (15 examples)
   - Explain architecture
   - Find vulnerabilities
   - Understand code flow
   - Generate documentation

2. **Development** (20 examples)
   - Write unit tests
   - Generate commit messages
   - Refactor code
   - Code reviews

3. **File Operations** (15 examples)
   - Batch rename files
   - Combine CSV files
   - Organize directories
   - Convert file formats

4. **Data Analysis** (10 examples)
   - Parse log files
   - Analyze CSV data
   - Extract insights
   - Generate reports

5. **Automation** (12 examples)
   - Git workflows
   - Deployment scripts
   - Batch processing
   - Task automation

6. **Documentation** (10 examples)
   - Generate README files
   - Create API docs
   - Write tutorials
   - Document code

### ⚡ Instant Execution

Run any example with one command. Examples include:
- Clear prompts optimized for best results
- Required tools and permissions
- Expected outcomes
- Helpful tips
- Related examples

### 🎓 Educational

Learn by doing:
- Beginner-friendly examples to get started
- Progressive difficulty levels
- Tips and best practices
- Links to relevant documentation

---

## Example Structure

Each example includes:

```typescript
{
  id: 'unique-identifier',
  title: 'Human-Readable Title',
  description: 'What this example does',
  category: 'development' | 'file-operations' | ...,
  tags: ['relevant', 'keywords'],
  difficulty: 'beginner' | 'intermediate' | 'advanced',
  estimatedTime: 'How long it takes',
  requiredTools: ['tools', 'needed'],
  requiredPermissions: ['permissions', 'required'],
  examplePrompt: 'The actual prompt to run',
  expectedOutcome: 'What you should expect',
  tips: ['Helpful tips'],
  relatedExamples: ['similar-example-ids'],
  documentationLinks: ['/docs/relevant/page.md']
}
```

---

## Usage Examples

### Example 1: Find and Run

```bash
# Search for git-related examples
$ gemini /examples search git

Found 8 examples matching "git":

1. generate-commit-message (Beginner, 1 min)
   Generate meaningful git commit messages

2. automated-git-workflow (Beginner, 2 min)
   Complete git workflow: stage, commit, push

3. find-large-files (Intermediate, 3 min)
   Find large files in git history

# Run example #1
$ gemini /examples run generate-commit-message

# Your changes will be analyzed and a commit message generated
```

### Example 2: Browse by Category

```bash
# See all development examples
$ gemini /examples category development

Development Examples (20 total):

Beginner:
- generate-commit-message: Git commit messages
- write-unit-tests: Generate unit tests
- code-formatter: Format code consistently

Intermediate:
- refactor-function: Refactor code for clarity
- generate-mocks: Create test mocks
...
```

### Example 3: Save as Custom Command

```bash
# Save frequently used example as command
$ gemini /examples save generate-commit-message commit

Saved as custom command: commit

# Now you can use it directly
$ gemini commit
```

---

## Detailed Examples

### Example: Generate Commit Message

**ID**: `generate-commit-message`
**Category**: Development
**Difficulty**: Beginner
**Time**: 1 minute

**What it does**:
Analyzes your staged git changes and generates a well-formatted commit message following conventional commits format.

**Prerequisites**:
- Stage your changes: `git add <files>`
- Ensure you're in a git repository

**Prompt**:
```
Look at my git staged changes and write a clear, concise commit message.

Follow these guidelines:
1. Use conventional commits format (feat:, fix:, docs:, etc.)
2. First line: brief summary (50 chars or less)
3. Blank line, then detailed explanation if needed
4. Explain WHAT and WHY, not HOW
5. Reference issue numbers if applicable

Format as a complete commit message I can copy-paste.
```

**Expected Outcome**:
A well-formatted commit message like:
```
feat: add user authentication system

- Implement JWT-based authentication
- Add login/logout endpoints
- Create user session management
- Add password hashing with bcrypt

Closes #123
```

**Tips**:
- Review the message before committing
- Adjust to match your team's conventions
- Can save as custom command for frequent use

---

### Example: Explain Codebase Architecture

**ID**: `explain-codebase-architecture`
**Category**: Code Understanding
**Difficulty**: Beginner
**Time**: 3-5 minutes

**What it does**:
Provides a high-level overview of how a codebase is organized, perfect for onboarding to a new project.

**Prerequisites**:
- Navigate to the project root directory

**Prompt**:
```
Analyze this repository structure and explain:
1. Overall architecture and patterns used
2. Main components and their purposes
3. How data flows through the system
4. Entry points for new developers
5. Key directories and what they contain

Focus on giving me a mental model I can use to navigate this codebase.
```

**Expected Outcome**:
Comprehensive architecture overview with:
- System architecture description
- Component breakdown
- Data flow diagrams (textual)
- Navigation guidance

**Tips**:
- Run from project root for best results
- Include README.md for additional context: `@README.md`
- Ask follow-up questions for specific components

---

### Example: Rename Photos by Content

**ID**: `rename-photos-by-content`
**Category**: File Operations
**Difficulty**: Beginner
**Time**: 2-5 minutes

**What it does**:
Uses AI vision to analyze images and rename them with descriptive names.

**Prompt**:
```
Look at all images in ./photos/ and rename them based on what you see.
Use descriptive names like 'beach-sunset.jpg' or 'mountain-hike.jpg'.
Keep original file extensions. Show me the list of renames before applying.
```

**Expected Outcome**:
Photos renamed with AI-generated descriptive names:
- `IMG_1234.jpg` → `beach-sunset.jpg`
- `IMG_1235.jpg` → `mountain-landscape.jpg`
- `IMG_1236.jpg` → `family-picnic.jpg`

**Tips**:
- Review suggested names before confirming
- Works best with JPG and PNG
- Can process 50+ images in one run
- Backup created automatically

---

## Adding Your Own Examples

You can create custom examples for your team or project:

### 1. Create Example File

Create a new file in your project:
```
.gemini/examples/my-custom-example.ts
```

### 2. Define Example

```typescript
import type { Example } from '@google/gemini-cli-core';

const example: Example = {
  id: 'my-custom-example',
  title: 'My Custom Workflow',
  description: 'Description of what this does',
  category: 'automation',
  tags: ['custom', 'workflow'],
  difficulty: 'intermediate',
  estimatedTime: '5 minutes',
  requiredTools: ['run_shell_command'],
  requiredPermissions: [],
  examplePrompt: `Your custom prompt here...`,
  expectedOutcome: 'What should happen',
  tips: ['Helpful tip 1', 'Helpful tip 2'],
  relatedExamples: [],
  documentationLinks: []
};

export default example;
```

### 3. Load Custom Examples

```bash
# Custom examples are automatically loaded from .gemini/examples/
gemini /examples
```

See [Adding Examples Guide](./adding-examples.md) for detailed instructions.

---

## Best Practices

### When to Use Examples

**Do use examples when**:
- Learning a new feature
- Looking for inspiration
- Need a starting point
- Want to see best practices
- Trying something new

**Consider customizing when**:
- Example is close but not exact
- You need specific variations
- Adapting for your workflow

### Making Examples Work for You

1. **Start with featured examples** - These are curated for quality
2. **Read the tips** - They contain important context
3. **Check prerequisites** - Ensure you meet requirements
4. **Review before running** - Understand what will happen
5. **Adapt the prompt** - Customize for your specific needs
6. **Save frequently used ones** - Convert to custom commands

### Troubleshooting

**Example doesn't work as expected**:
1. Check prerequisites are met
2. Verify required tools are available
3. Review the example prompt
4. Try in a test directory first
5. Check error messages

**Can't find the right example**:
1. Try different search terms
2. Browse by category
3. Filter by tags
4. Check related examples
5. Create a custom example

---

## Frequently Asked Questions

### How many examples are there?

Currently 50+ examples across 6 categories. More are added regularly.

### Can I contribute examples?

Yes! See the [Contributing Guide](../contributing/examples.md) for details.

### Are examples safe to run?

Yes. Examples request confirmation before making changes. Always review what an example does before running.

### Can I modify examples?

Yes. You can customize prompts or save modified versions as custom commands.

### Do examples work offline?

Examples require an internet connection to run through Gemini AI.

### Can I share examples with my team?

Yes. Examples can be committed to your repository in `.gemini/examples/`.

---

## Related Documentation

- [Custom Commands](./custom-commands.md) - Save examples as commands
- [Tutorial Mode](./tutorial-mode.md) - Interactive learning
- [Workflow Templates](./workflow-templates.md) - Multi-step automation
- [Adding Examples](./adding-examples.md) - Create custom examples

---

## Feedback

Found an issue with an example? Have suggestions for new examples?

```bash
gemini /bug
```

Or open an issue on [GitHub](https://github.com/google-gemini/gemini-cli/issues).

---

**Last Updated**: January 2025
**Version**: 1.0
