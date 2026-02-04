# Automate tasks with headless mode

Headless mode lets you run Gemini CLI programmatically from scripts and
automation tools. It is ideal for CI/CD pipelines, batch processing, and
building custom AI-powered terminal tools.

## Basic usage

You can invoke headless mode by providing a query as a positional argument or by
piping text into the command.

- **Positional query:** `gemini "Summarize this codebase"`
- **Piping input:** `cat logs.txt | gemini "Find error patterns"`

Headless mode automatically exits once the model provides a final response or
completes its tool executions.

## Example: Code review script

You can create a simple bash script to review changed files in a Git branch:

```bash
#!/bin/bash
FILES=$(git diff --name-only main)
for FILE in $FILES; do
  echo "Reviewing $FILE..."
  gemini "Review this file for bugs: @$FILE" > "reviews/${FILE}.txt"
done
```

## Example: Structured data extraction

Use the JSON output format to extract information for further processing:

```bash
gemini "Extract the version number from package.json" --output-format json | jq '.response'
```

## Next steps

- Explore the [Headless mode technical reference](../cli/headless.md) for JSON
  schemas and event types.
- Learn about [Shell commands](./shell-commands.md) for deeper system
  integration.
- See the [Cheatsheet](../cli/cli-reference.md) for more command-line options.
