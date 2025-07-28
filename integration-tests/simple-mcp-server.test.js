/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, describe, before } from 'node:test';
import { strict as assert } from 'node:assert';
import { TestRig } from './test-helper.js';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const serverScript = `/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'addition-server',
  version: '1.0.0',
});

server.registerTool(
  'add',
  {
    title: 'Addition Tool',
    description: 'Add two numbers',
    inputSchema: { a: z.number(), b: z.number() },
  },
  async ({ a, b }) => ({
    content: [{ type: 'text', text: String(a + b) }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
`;

describe('simple-mcp-server', () => {
  const rig = new TestRig();

  before(async () => {
    // Setup test directory with MCP server configuration
    await rig.setup('simple-mcp-server', {
      settings: {
        mcpServers: {
          'addition-server': {
            command: 'node',
            args: ['mcp-server.js'],
          },
        },
      },
    });

    // Create server script in the test directory
    const testServerPath = join(rig.testDir, 'mcp-server.js');
    writeFileSync(testServerPath, serverScript);
  });

  test('should add two numbers', async () => {
    // Test directory is already set up in before hook
    // Just run the command - MCP server config is in settings.json
    const output = await rig.run('add 5 and 10');

    const foundToolCall = await rig.waitForToolCall('add');

    assert.ok(foundToolCall, 'Expected to find an add tool call');
    assert.ok(output.includes('15'));
  });
});
