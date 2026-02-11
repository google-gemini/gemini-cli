# Automate tasks with headless mode

Build custom AI tools with Gemini CLI scripting. In this guide, you'll learn how
to pipe data into the agent, automate workflows with shell scripts, and generate
structured JSON output for other programs.

## Prerequisites

- Gemini CLI installed and authenticated.
- Familiarity with shell scripting (Bash/Zsh).

## Why headless mode?

Headless mode runs Gemini once and exits. It's perfect for:
- **CI/CD:** Analyzing pull requests automatically.
- **Batch processing:** Summarizing 100 log files.
- **Tool building:** Creating your own "AI wrapper" scripts.

## Piping input to Gemini CLI

You can feed data into Gemini using the standard Unix pipe `|`.

**Example:**
`cat error.log | gemini "Explain why this failed"`

Gemini reads the standard input (stdin) as context and answers your question using
standard output (stdout).

**Example:**
`git diff | gemini "Write a commit message for these changes"`

## Using Gemini output in scripts

Because Gemini prints to stdout, you can chain it with other tools or save the
results to a file.

### Scenario: Bulk documentation generator

Imagine you have a folder of python scripts and want to generate a `README.md` for each
one.

**Create the script:**

Save the following code as `generate_docs.sh`:

```bash
#!/bin/bash

# Loop through all Python files
for file in *.py; do
  echo "Generating docs for $file..."
  
  # Ask Gemini CLI to generate the documentation and print it to stdout
  gemini "Generate a Markdown documentation summary for @$file. Print the result to standard output." > "${file%.py}.md"
done
```

**Run the script:**

Make the script executable and run it in your directory:

```bash
chmod +x generate_docs.sh
./generate_docs.sh
```

This will create a corresponding markdown file for every Python file in the
folder.

## Extracting structured JSON data

If you're writing a script, you often need structured data (JSON) to pass to
tools like `jq`. To get pure JSON data from the model, you combine the
`--output-format json` flag with `jq` to parse the response field.

**Workflow:**

Ask Gemini to output raw JSON, then use `jq` to extract the content.

```bash
gemini "Return a raw JSON object with keys 'version' and 'deps' from @package.json" \
  --output-format json \
  | jq -r '.response' \
  > data.json
```

**Result (`data.json`):**

```json
{
  "version": "1.0.0",
  "deps": {
    "react": "^18.2.0"
  }
}
```

## Creating a "Smart Commit" alias

You can add this function to your `.bashrc` or `.zshrc` to create a `git commit`
wrapper that writes the message for you.

**Add the alias:**

```bash
function gcommit() {
  # Get the diff of staged changes
  diff=$(git diff --staged)

  if [ -z "$diff" ]; then
    echo "No staged changes to commit."
    return 1
  fi

  # Ask Gemini to write the message
  echo "Generating commit message..."
  msg=$(echo "$diff" | gemini "Write a concise Conventional Commit message for this diff. Output ONLY the message.")

  # Commit with the generated message
  git commit -m "$msg"
}
```

**Use the alias:**

After sourcing your config (`source ~/.zshrc`), simply type:

```bash
gcommit
```

Gemini will analyze your staged changes and commit them with a generated message.

## Next steps

- Explore the [Headless mode reference](../../cli/headless.md) for full JSON schema
  details.
- Learn about [Shell commands](shell-commands.md) to let the agent run scripts
  instead of just writing them.