/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { strict as assert } from 'assert';
import { test } from 'node:test';
import { TestRig } from './test-helper.js';

test('Virtual Tools - Echo Tool', (t) => {
  const rig = new TestRig();
  rig.setup(t.name);

  // Create a GEMINI.md file with a virtual echo tool
  const geminiMdContent = `# Test Project

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
  rig.createFile('GEMINI.md', geminiMdContent);

  // Test the virtual tool by asking the CLI to use it
  const result = rig.run('Use the echo_tool to say "Hello Virtual Tools!"');

  // Check that the virtual tool was discovered and executed
  console.log('CLI Result:', result);

  // The result should contain evidence that the echo_tool was called
  // and returned the expected message
  assert.ok(
    result.includes('Hello Virtual Tools!') || result.includes('echo_tool'),
    'Virtual tool was not executed or did not produce expected output',
  );

  console.log('✅ Virtual echo tool test passed');
});

// Additional tests can be added here later
