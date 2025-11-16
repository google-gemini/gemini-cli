# `/examples` Command - Example Library

The `/examples` command provides access to a curated library of example prompts that demonstrate Gemini CLI's capabilities. Use examples to learn by doing, discover new features, and accelerate your workflow.

## Overview

The Example Library contains 50+ real-world examples across 6 categories:
- **Code Understanding**: Analyze and explain code
- **Development**: Generate code, tests, and documentation
- **File Operations**: Manipulate files with AI
- **Data Analysis**: Process and analyze data
- **Automation**: Automate workflows and tasks
- **Documentation**: Create and improve documentation

Each example is tagged, categorized by difficulty, and comes with clear instructions.

## Quick Start

### Browse Featured Examples
```bash
/examples
```

Shows beginner-friendly featured examples to get you started.

### Run an Example
```bash
/examples run <example-id>
```

Executes an example by submitting its prompt directly to Gemini.

## Command Reference

### `/examples` (default)
Shows featured examples recommended for new users.

**Example:**
```bash
/examples
```

### `/examples list [category] [difficulty]`
Lists all available examples, optionally filtered by category or difficulty.

**Options:**
- `category`: `code-understanding`, `development`, `file-operations`, `data-analysis`, `automation`, `documentation`
- `difficulty`: `beginner`, `intermediate`, `advanced`

**Examples:**
```bash
/examples list                     # All examples
/examples list beginner            # All beginner examples
/examples list development         # All development examples
/examples list development beginner # Beginner development examples
```

### `/examples search <query>`
Searches examples by keywords in title, description, or tags.

**Example:**
```bash
/examples search git              # Find git-related examples
/examples search "unit test"      # Find testing examples
```

### `/examples run <example-id>`
Runs an example by submitting its prompt to Gemini.

**Tab Completion:** Type `/examples run ` and press `Tab` to see all example IDs.

**Example:**
```bash
/examples run generate-commit-message
```

### `/examples show <example-id>`
Displays detailed information about a specific example including:
- Full description
- Category and difficulty
- Estimated time
- Prerequisites
- Complete prompt
- Expected outcome
- Tips and tricks
- Related examples

**Example:**
```bash
/examples show explain-architecture
```

### `/examples featured`
Shows curated featured examples perfect for getting started.

**Example:**
```bash
/examples featured
```

### `/examples random`
Displays a random example to discover something new.

**Example:**
```bash
/examples random
```

### `/examples stats`
Shows statistics about the example library including count by category and difficulty.

**Example:**
```bash
/examples stats
```

## Common Workflows

### Learning a New Feature

1. **Browse by category:**
   ```bash
   /examples list development
   ```

2. **Get details on an interesting example:**
   ```bash
   /examples show write-tests
   ```

3. **Run the example:**
   ```bash
   /examples run write-tests
   ```

### Finding the Right Example

1. **Search by keyword:**
   ```bash
   /examples search security
   ```

2. **Filter by difficulty:**
   ```bash
   /examples list beginner
   ```

3. **Try a random example:**
   ```bash
   /examples random
   ```

## Example Structure

Each example includes:

- **ID**: Unique identifier for running the example
- **Title**: Short descriptive name
- **Description**: What the example demonstrates
- **Category**: Type of use case
- **Difficulty**: `beginner`, `intermediate`, or `advanced`
- **Estimated Time**: How long it typically takes
- **Tags**: Keywords for searching
- **Prerequisites**: What you need before running
- **Prompt**: The actual prompt template
- **Expected Outcome**: What results to expect
- **Tips**: Helpful hints for best results
- **Related Examples**: Similar examples to explore

## Tips for Using Examples

1. **Start with Featured Examples**: If you're new to Gemini CLI, start with `/examples featured` to see curated beginner-friendly examples.

2. **Read Before Running**: Use `/examples show <id>` to understand what an example does before running it.

3. **Check Prerequisites**: Some examples require specific files or project setup. Review prerequisites in the detailed view.

4. **Adapt Examples**: Examples are templates. Modify prompts to fit your specific needs.

5. **Use Tab Completion**: When typing `/examples run `, press Tab to see all available example IDs.

6. **Explore Related Examples**: After running an example, check "Related Examples" to deepen your learning.

## Examples by Category

### Code Understanding (Beginner-Friendly)
- `explain-architecture`: Understand codebase structure
- `find-vulnerabilities`: Identify security issues

### Development
- `write-tests`: Generate unit tests
- `generate-commit-message`: Create git commit messages

### File Operations
- `rename-photos`: AI-powered photo renaming
- `combine-csvs`: Merge CSV files intelligently

### Data Analysis
- `parse-logs`: Analyze log files
- `extract-data`: Extract structured data

### Automation
- `git-workflow`: Automated git operations
- `batch-process`: Process multiple files

### Documentation
- `generate-readme`: Create README files
- `api-docs`: Generate API documentation

## Troubleshooting

### "Example not found"
- Check the example ID spelling using `/examples list`
- Use tab completion: `/examples run ` + Tab

### "No examples found" when searching
- Try broader search terms
- Use `/examples list` to browse all examples
- Check category filters

### Example doesn't work as expected
- Review prerequisites with `/examples show <id>`
- Check if required files exist
- Verify you're in the right directory

## Contributing Examples

Examples are defined in `packages/core/src/examples/examples/`. To add a new example:

1. See `docs/contributing/adding-examples.md` for the complete guide
2. Each example is a TypeScript file exporting an `Example` object
3. Follow the template and include all required fields
4. Test your example before submitting
5. Examples should be educational and demonstrate best practices

## Related Commands

- `/help` - General help for all commands
- `/tools` - List available tools
- `/chat` - Manage conversation history

## Integration with Other Features

### Future Integrations (Coming Soon)

- **Tutorial Mode**: Examples will be referenced in interactive tutorials
- **Learning Path**: Running examples will award XP and achievements
- **Smart Suggestions**: Gemini will suggest relevant examples based on context
- **Custom Commands**: Save examples as reusable custom commands with `/examples save`

---

**Note**: The Example Library is actively growing. New examples are added regularly. Use `/examples stats` to see the current collection size.
