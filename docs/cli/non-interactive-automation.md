# Non-Interactive Automation

Gemini CLI can be used in non-interactive mode for automation, CI/CD pipelines,
and scripting. This guide explains how to enable tool execution in
non-interactive environments.

## Basic Usage

```bash
# Pipe input to gemini
echo "List files in current directory" | gemini

# Use with heredoc
gemini <<EOF
Analyze the package.json file and suggest improvements
EOF

# Read from file
gemini < prompt.txt
```

## Tool Approval in Non-Interactive Mode

By default, tools that require user approval (like shell commands) are
**denied** in non-interactive mode because there's no way to prompt the user.

### Solution: Use Approval Modes

To enable tool execution in non-interactive mode, use one of these approval
modes:

#### 1. YOLO Mode (Auto-approve all tools)

```bash
echo "Run terraform plan" | gemini --yolo
```

Or using the long form:

```bash
echo "Run terraform plan" | gemini --approval-mode=yolo
```

#### 2. AUTO_EDIT Mode (Auto-approve edit tools)

```bash
echo "Fix the typo in README.md" | gemini --approval-mode=auto_edit
```

## CI/CD Integration Examples

### GitHub Actions

```yaml
name: Code Review
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Gemini CLI
        run: npm install -g @google/gemini-cli
      - name: Run code review
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
        run: |
          echo "Review the changes in this PR and suggest improvements" | gemini --yolo
```

### GitLab CI

```yaml
code_review:
  script:
    - npm install -g @google/gemini-cli
    - echo "Analyze the code changes" | gemini --yolo
  only:
    - merge_requests
```

### Jenkins

```groovy
pipeline {
    agent any
    stages {
        stage('Code Analysis') {
            steps {
                sh '''
                    npm install -g @google/gemini-cli
                    echo "Run static analysis on src/" | gemini --yolo
                '''
            }
        }
    }
}
```

## Terraform Automation Example

```bash
#!/bin/bash
# terraform-drift-check.sh

# Check for drift
DRIFT=$(terraform plan -detailed-exitcode 2>&1 || true)

# Ask Gemini to analyze and propose fixes
echo "Terraform detected drift: $DRIFT. Propose changes to resolve it." | \
  gemini --yolo --output-format=json > analysis.json

# Parse and apply suggestions
# ... your automation logic here
```

## Security Considerations

### YOLO Mode Risks

Using `--yolo` mode auto-approves **all** tools, including:

- Shell command execution
- File modifications
- Network requests

**Best practices:**

1. Only use in trusted environments
2. Review generated commands before execution
3. Use policy files to restrict specific tools
4. Consider using `--approval-mode=auto_edit` for safer automation

### Policy-Based Automation

For more control, create a policy file that explicitly allows specific tools:

```toml
# .gemini/policies/automation.toml
[[rules]]
name = "Allow safe commands"
toolName = "run_shell_command"
argsPattern = "^(ls|cat|grep|find).*"
decision = "allow"
priority = 100

[[rules]]
name = "Deny dangerous commands"
toolName = "run_shell_command"
argsPattern = ".*(rm|sudo|chmod).*"
decision = "deny"
priority = 200
```

Then run without `--yolo`:

```bash
echo "List files" | gemini --policy=automation
```

## Output Formats

### JSON Output

```bash
echo "Analyze this code" | gemini --yolo --output-format=json
```

Output:

```json
{
  "session_id": "abc123",
  "response": "The code looks good...",
  "stats": {
    "input_tokens": 150,
    "output_tokens": 200
  }
}
```

### Stream JSON

```bash
echo "Generate code" | gemini --yolo --output-format=stream-json
```

## Error Handling

```bash
#!/bin/bash
set -e

if ! echo "Run tests" | gemini --yolo; then
    echo "Gemini CLI failed"
    exit 1
fi

echo "Success!"
```

## Environment Variables

```bash
# Set API key
export GEMINI_API_KEY="your-api-key"

# Set project for Vertex AI
export GOOGLE_CLOUD_PROJECT="your-project-id"

# Run non-interactively
echo "Your prompt" | gemini --yolo
```

## Limitations

1. **No user interaction**: Cannot use features that require user input
2. **No visual feedback**: Progress indicators and spinners are disabled
3. **Session management**: Cannot use interactive commands like `/chat save`

## Troubleshooting

### "Tool execution denied in non-interactive mode"

**Solution**: Add `--yolo` or `--approval-mode=yolo` flag

```bash
echo "Run command" | gemini --yolo
```

### "Cannot prompt user in non-interactive mode"

**Solution**: Use an approval mode that doesn't require prompts

```bash
echo "Your prompt" | gemini --approval-mode=auto_edit
```

## Related Documentation

- [Approval Modes](./generation-settings.md#approval-modes)
- [Policy Engine](../core/policy-engine.md)
- [Authentication](./authentication.md)
