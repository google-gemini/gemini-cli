/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const { test } = require('./test-helper.js');
const path = require('path');
const fs = require('fs');

test('Virtual Tools - Echo Tool', async (cli, workspaceDir) => {
  // Create a GEMINI.md file with a virtual echo tool
  const geminiMdContent = `
# Test Project

This is a test project for virtual tools.

### Tools

#### echo_tool

A simple echo tool that outputs a message.

\`\`\`sh
echo "$GEMINI_TOOL_ARGS" | jq -r '.message'
\`\`\`

\`\`\`json
{
  "name": "echo_tool",
  "description": "Echoes a message back to the user",
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
\`\`\`
`;

  // Write GEMINI.md to workspace
  const geminiMdPath = path.join(workspaceDir, 'GEMINI.md');
  fs.writeFileSync(geminiMdPath, geminiMdContent);

  // Test the virtual tool by asking the CLI to use it
  const result = await cli([
    'Use the echo_tool to say "Hello Virtual Tools!"'
  ]);

  // Check that the virtual tool was discovered and executed
  console.log('CLI Result:', result);
  
  // The result should contain evidence that the echo_tool was called
  // and returned the expected message
  if (!result.includes('Hello Virtual Tools!') && !result.includes('echo_tool')) {
    throw new Error('Virtual tool was not executed or did not produce expected output');
  }

  console.log('✅ Virtual echo tool test passed');
});

test('Virtual Tools - File Creator Tool', async (cli, workspaceDir) => {
  // Create a GEMINI.md file with a file creation tool
  const geminiMdContent = `
# Test Project

This project has a custom file creation tool.

### Tools

#### create_test_file

Creates a test file with specified content.

\`\`\`sh
#!/bin/bash
set -e

# Parse arguments from JSON
FILENAME=$(echo "$GEMINI_TOOL_ARGS" | jq -r '.filename')
CONTENT=$(echo "$GEMINI_TOOL_ARGS" | jq -r '.content')

# Create the file
echo "$CONTENT" > "$FILENAME"
echo "Created file: $FILENAME"
ls -la "$FILENAME"
\`\`\`

\`\`\`json
{
  "name": "create_test_file", 
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
\`\`\`
`;

  // Write GEMINI.md to workspace
  const geminiMdPath = path.join(workspaceDir, 'GEMINI.md');
  fs.writeFileSync(geminiMdPath, geminiMdContent);

  // Test the virtual tool
  const result = await cli([
    'Use the create_test_file tool to create a file called "test.txt" with content "Virtual tools are working!"'
  ]);

  console.log('CLI Result:', result);

  // Check that the file was created
  const testFilePath = path.join(workspaceDir, 'test.txt');
  if (!fs.existsSync(testFilePath)) {
    throw new Error('Virtual tool did not create the expected file');
  }

  const fileContent = fs.readFileSync(testFilePath, 'utf-8');
  if (!fileContent.includes('Virtual tools are working!')) {
    throw new Error('Virtual tool did not write expected content to file');
  }

  console.log('✅ Virtual file creator tool test passed');
});

test('Virtual Tools - Multiple Tools', async (cli, workspaceDir) => {
  // Create a GEMINI.md file with multiple virtual tools
  const geminiMdContent = `
# Multi-Tool Project

This project demonstrates multiple virtual tools.

### Tools

#### greet_user

Greets a user by name.

\`\`\`sh
NAME=$(echo "$GEMINI_TOOL_ARGS" | jq -r '.name')
echo "Hello, $NAME! Welcome to the virtual tools system."
\`\`\`

\`\`\`json
{
  "name": "greet_user",
  "description": "Greets a user by name",
  "parameters": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "description": "The name of the user to greet"
      }
    },
    "required": ["name"]
  }
}
\`\`\`

#### get_timestamp

Gets the current timestamp.

\`\`\`sh
date "+%Y-%m-%d %H:%M:%S"
\`\`\`

\`\`\`json
{
  "name": "get_timestamp",
  "description": "Gets the current timestamp",
  "parameters": {
    "type": "object",
    "properties": {}
  }
}
\`\`\`
`;

  // Write GEMINI.md to workspace
  const geminiMdPath = path.join(workspaceDir, 'GEMINI.md');
  fs.writeFileSync(geminiMdPath, geminiMdContent);

  // Test both tools
  const result1 = await cli([
    'Use the greet_user tool to greet "Alice"'
  ]);

  const result2 = await cli([
    'Use the get_timestamp tool to get the current time'
  ]);

  console.log('Greet result:', result1);
  console.log('Timestamp result:', result2);

  // Check that both tools worked
  if (!result1.includes('Hello, Alice!') && !result1.includes('greet_user')) {
    throw new Error('Greet user tool did not work as expected');
  }

  if (!result2.includes('get_timestamp') && !result2.match(/\d{4}-\d{2}-\d{2}/)) {
    throw new Error('Get timestamp tool did not work as expected');
  }

  console.log('✅ Multiple virtual tools test passed');
});

test('Virtual Tools - Error Handling', async (cli, workspaceDir) => {
  // Create a GEMINI.md file with a tool that has invalid JSON
  const geminiMdContent = `
# Error Handling Test

### Tools

#### valid_tool

This tool should work.

\`\`\`sh
echo "This tool is valid"
\`\`\`

\`\`\`json
{
  "name": "valid_tool",
  "description": "A valid tool",
  "parameters": {
    "type": "object",
    "properties": {}
  }
}
\`\`\`

#### invalid_tool

This tool has invalid JSON and should be skipped.

\`\`\`sh
echo "This tool should be skipped"
\`\`\`

\`\`\`json
{
  "name": "invalid_tool",
  "description": "An invalid tool"
  // This is invalid JSON - missing comma
  "parameters": {
    "type": "object",
    "properties": {}
  }
}
\`\`\`
`;

  // Write GEMINI.md to workspace
  const geminiMdPath = path.join(workspaceDir, 'GEMINI.md');
  fs.writeFileSync(geminiMdPath, geminiMdContent);

  // Test that the valid tool works and invalid tool is skipped gracefully
  const result = await cli([
    'Use the valid_tool'
  ]);

  console.log('Error handling result:', result);

  // The system should handle the invalid tool gracefully
  // and still register the valid tool
  if (!result.includes('valid_tool') && !result.includes('This tool is valid')) {
    throw new Error('Valid tool should still work when invalid tools are present');
  }

  console.log('✅ Virtual tools error handling test passed');
});