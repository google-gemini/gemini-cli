/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, test, expect, vi } from 'vitest';
import { ManifestParser } from './manifest-parser.js';

describe('ManifestParser', () => {
  test('should return empty array when no Tools section exists', async () => {
    const content = `
# Project Instructions

This is a regular GEMINI.md file without a Tools section.
`;
    const result = await ManifestParser.parse(content, 'test.md');
    expect(result).toEqual([]);
  });

  test('should parse a single tool definition correctly', async () => {
    const content = `
# Project Instructions

Some regular content here.

### Tools

#### echo_tool

This tool echoes a message.

\`\`\`sh
echo "$GEMINI_TOOL_ARGS" | jq -r '.message'
\`\`\`

\`\`\`json
{
  "name": "echo_tool",
  "description": "Echoes a message",
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
    const result = await ManifestParser.parse(content, 'test.md');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('echo_tool');
    expect(result[0].script).toBe(
      'echo "$GEMINI_TOOL_ARGS" | jq -r \'.message\'',
    );
    expect(result[0].schema.name).toBe('echo_tool');
    expect(result[0].schema.description).toBe('Echoes a message');
  });

  test('should parse multiple tool definitions', async () => {
    const content = `
### Tools

#### tool_one

\`\`\`sh
echo "tool one"
\`\`\`

\`\`\`json
{
  "name": "tool_one",
  "description": "First tool",
  "parameters": {
    "type": "object",
    "properties": {}
  }
}
\`\`\`

#### tool_two

\`\`\`sh
echo "tool two"
\`\`\`

\`\`\`json
{
  "name": "tool_two",
  "description": "Second tool",
  "parameters": {
    "type": "object",
    "properties": {}
  }
}
\`\`\`
`;
    const result = await ManifestParser.parse(content, 'test.md');

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('tool_one');
    expect(result[1].name).toBe('tool_two');
  });

  test('should skip tool with missing sh block', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const content = `
### Tools

#### bad_tool

Only has JSON, no shell script.

\`\`\`json
{
  "name": "bad_tool",
  "description": "Missing shell script",
  "parameters": {
    "type": "object",
    "properties": {}
  }
}
\`\`\`
`;
    const result = await ManifestParser.parse(content, 'test.md');

    expect(result).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping tool 'bad_tool'"),
    );

    consoleSpy.mockRestore();
  });

  test('should skip tool with missing json block', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const content = `
### Tools

#### bad_tool

Only has shell script, no JSON.

\`\`\`sh
echo "hello"
\`\`\`
`;
    const result = await ManifestParser.parse(content, 'test.md');

    expect(result).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping tool 'bad_tool'"),
    );

    consoleSpy.mockRestore();
  });

  test('should skip tool with invalid JSON', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const content = `
### Tools

#### bad_tool

\`\`\`sh
echo "hello"
\`\`\`

\`\`\`json
{
  "name": "bad_tool",
  "description": "Invalid JSON"
  // missing comma, invalid JSON
}
\`\`\`
`;
    const result = await ManifestParser.parse(content, 'test.md');

    expect(result).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse JSON schema'),
    );

    consoleSpy.mockRestore();
  });

  test('should skip tool with mismatched name in schema', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const content = `
### Tools

#### correct_name

\`\`\`sh
echo "hello"
\`\`\`

\`\`\`json
{
  "name": "wrong_name",
  "description": "Name mismatch",
  "parameters": {
    "type": "object",
    "properties": {}
  }
}
\`\`\`
`;
    const result = await ManifestParser.parse(content, 'test.md');

    expect(result).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Name in schema ('wrong_name') does not match header name",
      ),
    );

    consoleSpy.mockRestore();
  });

  test('should handle different code block formats', async () => {
    const content = `
### Tools

#### format_test

\`\`\`sh
echo "format 1"
\`\`\`

\`\`\` json
{
  "name": "format_test",
  "description": "Testing different formats",
  "parameters": {
    "type": "object",
    "properties": {}
  }
}
\`\`\`
`;
    const result = await ManifestParser.parse(content, 'test.md');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('format_test');
    expect(result[0].script).toBe('echo "format 1"');
  });

  test('should handle tools with complex shell scripts', async () => {
    const content = `
### Tools

#### complex_tool

\`\`\`sh
#!/bin/bash
set -e

# Parse arguments
ARGS=$(echo "$GEMINI_TOOL_ARGS" | jq -r '.file_path')

# Do something complex
if [ -f "$ARGS" ]; then
  echo "File exists: $ARGS"
else
  echo "File not found: $ARGS"
fi
\`\`\`

\`\`\`json
{
  "name": "complex_tool",
  "description": "A tool with a complex shell script",
  "parameters": {
    "type": "object",
    "properties": {
      "file_path": {
        "type": "string",
        "description": "Path to check"
      }
    },
    "required": ["file_path"]
  }
}
\`\`\`
`;
    const result = await ManifestParser.parse(content, 'test.md');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('complex_tool');
    expect(result[0].script).toContain('#!/bin/bash');
    expect(result[0].script).toContain('GEMINI_TOOL_ARGS');
    expect(result[0].script).toContain("jq -r '.file_path'");
  });
});
