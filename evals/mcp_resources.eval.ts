/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { appEvalTest } from './app-test-helper.js';

const MOCK_MCP_SERVER_CODE = `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.on('line', (line) => {
  try {
    const msg = JSON.parse(line);
    
    if (msg.method === 'initialize') {
      console.log(JSON.stringify({ 
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { resources: {} },
          serverInfo: { name: 'mock-server', version: '1.0.0' }
        } 
      }));
    } else if (msg.method === 'resources/list') {
      console.log(JSON.stringify({ 
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          resources: [
            {
              uri: 'mcp://mock-server/docs/api.md',
              name: 'API Documentation',
              mimeType: 'text/markdown'
            }
          ]
        } 
      }));
    } else if (msg.method === 'resources/read') {
      console.log(JSON.stringify({ 
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          contents: [
            {
              uri: msg.params.uri,
              mimeType: 'text/markdown',
              text: '# API Reference\\nThis is the API documentation for mock-server.'
            }
          ]
        } 
      }));
    }
  } catch (e) {}
});
`;

describe.sequential('mcp_resources', () => {
  appEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent lists MCP resources when asked what resources are available from MCP servers',
    files: {
      'mock_mcp_server.js': MOCK_MCP_SERVER_CODE,
    },
    configOverrides: {
      mcpServers: {
        'mock-server': {
          command: 'node',
          args: ['./mock_mcp_server.js'],
        },
      },
    },
    prompt: 'List all available MCP resources from the connected mock-server.',
    setup: async (rig) => {
      rig.setBreakpoint(['list_mcp_resources']);
    },
    assert: async (rig) => {
      const confirmation = await rig.waitForPendingConfirmation(
        ['list_mcp_resources'],
        30000,
      );

      expect(confirmation, 'Expected a tool call confirmation').toBeDefined();
      expect(
        confirmation.toolName,
        'Agent should use list_mcp_resources to discover available MCP resources',
      ).toBe('list_mcp_resources');

      await rig.resolveTool(confirmation);
      await rig.waitForIdle(30000);
    },
  });

  appEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent reads specified MCP resource when asked to fetch resource content',
    files: {
      'mock_mcp_server.js': MOCK_MCP_SERVER_CODE,
    },
    configOverrides: {
      mcpServers: {
        'mock-server': {
          command: 'node',
          args: ['./mock_mcp_server.js'],
        },
      },
    },
    prompt:
      'Read the MCP resource at mcp://mock-server/docs/api.md and summarize it.',
    setup: async (rig) => {
      rig.setBreakpoint(['read_mcp_resource']);
    },
    assert: async (rig) => {
      const confirmation = await rig.waitForPendingConfirmation(
        ['read_mcp_resource'],
        30000,
      );

      expect(confirmation, 'Expected a tool call confirmation').toBeDefined();
      expect(
        confirmation.toolName,
        'Agent should use read_mcp_resource to read the requested MCP resource URI',
      ).toBe('read_mcp_resource');

      await rig.resolveTool(confirmation);
      await rig.waitForIdle(30000);
    },
  });
});
