# Virtual Tools

Virtual tools allow you to define custom tools directly in your project's `GEMINI.md` file. These tools are automatically discovered and registered when the Gemini CLI starts, giving you the ability to extend the CLI's capabilities with project-specific functionality.

## Overview

Virtual tools are shell scripts paired with JSON schemas that define custom tools for the Gemini model. They execute within the same secure sandbox environment as built-in tools and require user confirmation before execution.

## How virtual tools work

1. **Definition**: You define tools in a `### Tools` section of any `GEMINI.md` file
2. **Discovery**: On startup, Gemini CLI automatically scans all `GEMINI.md` files for tool definitions
3. **Registration**: Valid tool definitions are registered alongside built-in tools
4. **Execution**: When the Gemini model calls a virtual tool, the CLI executes the associated shell script with arguments passed via the `GEMINI_TOOL_ARGS` environment variable

## Defining virtual tools

Virtual tools are defined using level-4 headers (`####`) within a `### Tools` section of your `GEMINI.md` file:

```markdown
# My Project

Project description and instructions here.

### Tools

#### my_custom_tool

A description of what this tool does.

```sh
#!/bin/bash
# Parse arguments from JSON
MESSAGE=$(echo "$GEMINI_TOOL_ARGS" | jq -r '.message')
echo "Custom tool says: $MESSAGE"
```

```json
{
  "name": "my_custom_tool",
  "description": "A custom tool that echoes a message",
  "parameters": {
    "type": "object",
    "properties": {
      "message": {
        "type": "string",
        "description": "The message to echo"
      }
    },
    "required": ["message"]
  }
}
```
```

### Tool definition structure

Each tool definition consists of:

1. **Tool Header**: `#### tool_name` - The name of your tool
2. **Description** (optional): Text describing what the tool does
3. **Shell Script**: A `sh` code block containing the script to execute
4. **JSON Schema**: A `json` code block with the tool's function declaration

#### Shell script requirements

- **Environment variable**: Arguments are passed via `GEMINI_TOOL_ARGS` as a JSON string
- **JSON parsing**: Use `jq` or similar tools to parse arguments
- **Output**: Write results to stdout; they'll be returned to the Gemini model
- **Error handling**: Use proper exit codes and stderr for error reporting

#### JSON schema requirements

- **Name matching**: The `name` field must exactly match the tool header
- **Standard schema**: Must follow the Google AI Function Declaration format
- **Parameter validation**: Define proper types and requirements for parameters

## Example: File creator tool

```markdown
### Tools

#### create_project_file

Creates a new file in the project with specified content.

```sh
#!/bin/bash
set -e

# Parse arguments
FILENAME=$(echo "$GEMINI_TOOL_ARGS" | jq -r '.filename')
CONTENT=$(echo "$GEMINI_TOOL_ARGS" | jq -r '.content')

# Validate filename (security)
if [[ "$FILENAME" == *".."* ]] || [[ "$FILENAME" == "/"* ]]; then
    echo "Error: Invalid filename" >&2
    exit 1
fi

# Create the file
echo "$CONTENT" > "$FILENAME"
echo "Created file: $FILENAME"
```

```json
{
  "name": "create_project_file",
  "description": "Creates a new file in the project directory",
  "parameters": {
    "type": "object",
    "properties": {
      "filename": {
        "type": "string",
        "description": "Name of the file to create (relative to project root)"
      },
      "content": {
        "type": "string",
        "description": "Content to write to the file"
      }
    },
    "required": ["filename", "content"]
  }
}
```
```

## Security considerations

Virtual tools execute within the same sandboxed environment as built-in tools:

- **User confirmation**: All virtual tools require user confirmation before execution
- **Sandboxing**: Scripts run within the configured sandbox (Docker, podman, or sandbox-exec)
- **Validation**: Input parameters are validated against the JSON schema
- **Whitelisting**: Tools can be permanently approved for the session

### Best practices for security

1. **Validate inputs**: Always validate and sanitize input parameters
2. **Avoid dangerous operations**: Be cautious with file operations and system commands
3. **Use relative paths**: Avoid absolute paths to stay within the project directory
4. **Error handling**: Provide clear error messages and proper exit codes

## Error handling

Virtual tools handle errors gracefully:

- **Parse errors**: Invalid JSON schemas or missing code blocks are logged and skipped
- **Runtime errors**: Script failures are reported with stdout/stderr output
- **Validation errors**: Invalid parameters are rejected before execution

## Limitations

- **Language**: Currently only shell scripts (`sh`) are supported
- **Dependencies**: External tools (like `jq`) must be available in the sandbox environment
- **Performance**: Each tool execution spawns a new shell process
- **Naming**: Tool names must be unique across all registered tools

## Use cases

Virtual tools are perfect for:

- **Project-specific utilities**: Custom build, test, or deployment scripts
- **API integrations**: Calling project-specific APIs or services
- **Data processing**: Custom data transformation or analysis scripts
- **Workflow automation**: Project-specific automation tasks
- **Integration bridges**: Connecting to project-specific tools or databases

## Troubleshooting

### Tool not discovered

- Check that the `### Tools` section exists in a `GEMINI.md` file
- Verify the tool header matches the `name` in the JSON schema
- Ensure both `sh` and `json` code blocks are present

### Tool execution fails

- Check that required dependencies (like `jq`) are available
- Verify script permissions and syntax
- Review error output in the CLI for specific issues

### Parameter validation errors

- Ensure the JSON schema accurately defines parameter types
- Check that required parameters are marked as such
- Verify parameter names match between schema and script

## Advanced example: API integration

```markdown
#### fetch_project_data

Fetches data from the project's API endpoint.

```sh
#!/bin/bash
set -e

# Parse arguments
ENDPOINT=$(echo "$GEMINI_TOOL_ARGS" | jq -r '.endpoint')
API_KEY="${PROJECT_API_KEY:-}" # From environment

if [ -z "$API_KEY" ]; then
    echo "Error: PROJECT_API_KEY environment variable not set" >&2
    exit 1
fi

# Make API call
curl -s -H "Authorization: Bearer $API_KEY" \
     "https://api.myproject.com/$ENDPOINT" | \
     jq '.'
```

```json
{
  "name": "fetch_project_data",
  "description": "Fetches data from the project's API",
  "parameters": {
    "type": "object",
    "properties": {
      "endpoint": {
        "type": "string",
        "description": "API endpoint to fetch (without leading slash)"
      }
    },
    "required": ["endpoint"]
  }
}
```
```

This example shows how to integrate with external APIs while maintaining security through environment variables and proper error handling.