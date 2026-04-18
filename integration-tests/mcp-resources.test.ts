/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('mcp-resources-integration', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should list mcp resources', async () => {
    await rig.setup('mcp-list-resources-test', {
      settings: {
        model: {
          name: 'gemini-3-flash-preview',
        },
      },
      fakeResponsesPath: join(__dirname, 'mcp-list-resources.responses'),
    });

    // Workaround for ProjectRegistry save issue
    const userGeminiDir = join(rig.homeDir!, '.gemini');
    fs.writeFileSync(join(userGeminiDir, 'projects.json'), '{"projects":{}}');

    // Add a dummy server to get setup done
    rig.addTestMcpServer('resource-server', {
      name: 'resource-server',
      tools: [],
    });

    // Overwrite the script with resource support
    const scriptPath = join(rig.testDir!, 'test-mcp-resource-server.mjs');
    const scriptContent = `
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListResourcesRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'resource-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      resources: {},
    },
  },
);

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'test://resource1',
        name: 'Resource 1',
        mimeType: 'text/plain',
        description: 'A test resource',
      }
    ],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
`;
    fs.writeFileSync(scriptPath, scriptContent);

    const output = await rig.run({
      args: 'List all available MCP resources.',
      env: { GEMINI_API_KEY: 'dummy' },
    });

    const foundCall = await rig.waitForToolCall('list_mcp_resources');
    expect(foundCall).toBeTruthy();
    expect(output).toContain('test://resource1');
  }, 60000);

  it('should read mcp resource', async () => {
    await rig.setup('mcp-read-resource-test', {
      settings: {
        model: {
          name: 'gemini-3-flash-preview',
        },
      },
      fakeResponsesPath: join(__dirname, 'mcp-read-resource.responses'),
    });

    // Workaround for ProjectRegistry save issue
    const userGeminiDir = join(rig.homeDir!, '.gemini');
    fs.writeFileSync(join(userGeminiDir, 'projects.json'), '{"projects":{}}');

    // Add a dummy server to get setup done
    rig.addTestMcpServer('resource-server', {
      name: 'resource-server',
      tools: [],
    });

    // Overwrite the script with resource support
    const scriptPath = join(rig.testDir!, 'test-mcp-resource-server.mjs');
    const scriptContent = `
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'resource-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      resources: {},
    },
  },
);

// Need to provide list resources so the tool is active!
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'test://resource1',
        name: 'Resource 1',
        mimeType: 'text/plain',
        description: 'A test resource',
      }
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === 'test://resource1') {
    return {
      contents: [
        {
          uri: 'test://resource1',
          mimeType: 'text/plain',
          text: 'This is the content of resource 1',
        }
      ],
    };
  }
  throw new Error('Resource not found');
});

const transport = new StdioServerTransport();
await server.connect(transport);
`;
    fs.writeFileSync(scriptPath, scriptContent);

    const output = await rig.run({
      args: 'Read the MCP resource test://resource1.',
      env: { GEMINI_API_KEY: 'dummy' },
    });

    const foundCall = await rig.waitForToolCall('read_mcp_resource');
    expect(foundCall).toBeTruthy();
    expect(output).toContain('content of resource 1');
  }, 60000);
});
