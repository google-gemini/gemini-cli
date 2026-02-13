# Automate tasks with headless mode

Automate tasks with Gemini CLI. Learn how to use headless mode, pipe data into
Gemini CLI, automate workflows with shell scripts, and generate structured JSON
output for other applications.

## Prerequisites

- Gemini CLI installed and authenticated.
- Familiarity with shell scripting (Bash/Zsh).

## Why headless mode?

Headless mode runs Gemini CLI once and exits. It's perfect for:

- **CI/CD:** Analyzing pull requests automatically.
- **Batch processing:** Summarizing a large number of log files.
- **Tool building:** Creating your own "AI wrapper" scripts.

## How to use headless mode

Run Gemini CLI in headless mode by providing a prompt as a positional argument.
This bypasses the interactive chat interface and prints the response to standard
output (stdout).

Run a single command:

```bash
gemini "Write a poem about TypeScript"
```

## How to pipe input to Gemini CLI

Feed data into Gemini using the standard Unix pipe `|`. Gemini reads the
standard input (stdin) as context and answers your question using standard
output.

Pipe a file:

```bash
cat error.log | gemini "Explain why this failed"
```

Pipe a command:

```bash
git diff | gemini "Write a commit message for these changes"
```

## Use Gemini CLI output in scripts

Because Gemini prints to stdout, you can chain it with other tools or save the
results to a file.

### Scenario: Bulk documentation generator

You have a folder of Python scripts and want to generate a `README.md` for each
one.

1.  Save the following code as `generate_docs.sh`:

    ```bash
    #!/bin/bash

    # Loop through all Python files
    for file in *.py; do
      echo "Generating docs for $file..."

      # Ask Gemini CLI to generate the documentation and print it to stdout
      gemini "Generate a Markdown documentation summary for @$file. Print the
      result to standard output." > "${file%.py}.md"
    done
    ```

2.  Make the script executable and run it in your directory:

    ```bash
    chmod +x generate_docs.sh
    ./generate_docs.sh
    ```

    This creates a corresponding Markdown file for every Python file in the
    folder.

## Extract structured JSON data

When writing a script, you often need structured data (JSON) to pass to tools
like `jq`. To get pure JSON data from the model, combine the
`--output-format json` flag with `jq` to parse the response field.

### Scenario: Extract and return structured data

1.  Save the following script as `generate_json.sh`:

    ```bash
    #!/bin/bash

    # Ensure we are in a project root
    if [ ! -f "package.json" ]; then
      echo "Error: package.json not found."
      exit 1
    fi

    # Extract data
    gemini --output-format json "Return a raw JSON object with keys 'version' and 'deps' from @package.json" | jq -r '.response' > data.json
    ```

2.  Run `generate_json.sh`:

    ```bash
    chmod +x generate_json.sh
    ./generate_json.sh
    ```

3.  Check `data.json`. The file should look like this:

    ```json
    {
      "version": "1.0.0",
      "deps": {
        "react": "^18.2.0"
      }
    }
    ```

## Build your own custom AI tools

Use headless mode to perform custom, automated AI tasks.

### Scenario: Create a "Smart Commit" alias

You can add a function to your shell configuration (like `.zshrc` or `.bashrc`)
to create a `git commit` wrapper that writes the message for you.

1.  Open your `.zshrc` file (or `.bashrc` if you use Bash) in your preferred
    text editor.

    ```bash
    nano ~/.zshrc
    ```

    **Note**: If you use VS Code, you can run `code ~/.zshrc`.

2.  Scroll to the very bottom of the file and paste this code:

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

    Save your file and exit.

3.  Run this command to make the function available immediately:

    ```bash
    source ~/.zshrc
    ```

4.  Use your new command:

    ```bash
    gcommit
    ```

    Gemini CLI will analyze your staged changes and commit them with a generated
    message.

## Next steps

- Explore the [Headless mode reference](../../cli/headless.md) for full JSON
  schema details.
- Learn about [Shell commands](shell-commands.md) to let the agent run scripts
  instead of just writing them.
