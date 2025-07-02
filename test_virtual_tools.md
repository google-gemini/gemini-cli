# Test Virtual Tools

This is a test project to verify virtual tools functionality.

### Tools

#### echo_test

A simple echo tool for testing the virtual tools system.

```sh
echo "$GEMINI_TOOL_ARGS" | jq -r '.message'
```

```json
{
  "name": "echo_test",
  "description": "Echoes a message back to test virtual tools",
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

#### create_file_test

Creates a simple test file with given content.

```sh
#!/bin/bash
FILENAME=$(echo "$GEMINI_TOOL_ARGS" | jq -r '.filename')
CONTENT=$(echo "$GEMINI_TOOL_ARGS" | jq -r '.content')
echo "$CONTENT" > "$FILENAME"
echo "Created file: $FILENAME with content: $CONTENT"
```

```json
{
  "name": "create_file_test",
  "description": "Creates a test file with specified content",
  "parameters": {
    "type": "object",
    "properties": {
      "filename": {
        "type": "string",
        "description": "Name of the file to create"
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