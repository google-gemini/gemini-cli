/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This test verifies MCP (Model Context Protocol) server integration.
 * It uses a minimal MCP server implementation that doesn't require
 * external dependencies, making it compatible with Docker sandbox mode.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig, poll } from './test-helper.js';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

// Create a minimal MCP server that doesn't require external dependencies
// This implements the MCP protocol directly using Node.js built-ins
const serverScript = `#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const readline = require('readline');
const fs = require('fs');

// Debug logging to stderr
function debug(msg) {
  try {
    fs.writeSync(2, \`[MCP-DEBUG] \${msg}\\n\`);
  } catch (e) {}
}

debug('MCP server starting...');

// Simple JSON-RPC implementation for MCP
class SimpleJSONRPC {
  constructor() {
    this.handlers = new Map();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });
    
    this.rl.on('line', (line) => {
      if (!line.trim()) return;
      debug(\`Received line: \${line}\`);
      try {
        const message = JSON.parse(line);
        this.handleMessage(message);
      } catch (e) {
        debug(\`Parse error: \${e.message}\`);
      }
    });
  }
  
  send(message) {
    const msgStr = JSON.stringify(message);
    debug(\`Sending message: \${msgStr}\`);
    process.stdout.write(msgStr + '\\n');
  }
  
  async handleMessage(message) {
    if (message.method && this.handlers.has(message.method)) {
      try {
        const result = await this.handlers.get(message.method)(message.params || {});
        if (message.id !== undefined) {
          this.send({
            jsonrpc: '2.0',
            id: message.id,
            result
          });
        }
      } catch (error) {
        debug(\`Handler error: \${error.message}\`);
        if (message.id !== undefined) {
          this.send({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32603,
              message: error.message
            }
          });
        }
      }
    } else {
      debug(\`No handler for method: \${message.method}\`);
      if (message.id !== undefined) {
        this.send({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32601,
            message: 'Method not found: ' + message.method
          }
        });
      }
    }
  }
  
  on(method, handler) {
    this.handlers.set(method, handler);
  }
}

// Create MCP server
const rpc = new SimpleJSONRPC();

// Handle initialize
rpc.on('initialize', async (params) => {
  debug('Handling initialize request');
  return {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {}
    },
    serverInfo: {
      name: 'addition-server',
      version: '1.0.0'
    }
  };
});

// Handle ping
rpc.on('ping', async () => {
  debug('Handling ping request');
  return {};
});

// Handle tools/list
rpc.on('tools/list', async () => {
  debug('Handling tools/list request');
  return {
    tools: [{
      name: 'add',
      description: 'Add two numbers',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number', description: 'First number' },
          b: { type: 'number', description: 'Second number' }
        },
        required: ['a', 'b']
      }
    }]
  };
});

// Handle tools/call
rpc.on('tools/call', async (params) => {
  debug(\`Handling tools/call request for tool: \${params.name}\`);
  if (params.name === 'add') {
    const { a, b } = params.arguments;
    return {
      content: [{
        type: 'text',
        text: String(a + b)
      }]
    };
  }
  throw new Error('Unknown tool: ' + params.name);
});

// Handle initialized notification
rpc.on('notifications/initialized', async () => {
  debug('Received initialized notification');
});
`;

describe('simple-mcp-server', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should add two numbers', async () => {
    // Pre-calculate test directory to get absolute path for MCP server
    const testName = 'simple-mcp-server';
    const sanitizedName = testName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-');
    const testFileDir =
      process.env['INTEGRATION_TEST_FILE_DIR'] ||
      join(os.tmpdir(), 'gemini-cli-tests');
    const testDir = join(testFileDir, sanitizedName);
    const testServerPath = join(testDir, 'mcp-server.cjs');

    // Setup test directory with MCP server configuration
    await rig.setup(testName, {
      settings: {
        mcpServers: {
          'addition-server': {
            command: 'node',
            args: [testServerPath],
          },
        },
        mcp: {
          allowed: ['addition-server'],
        },
        trustedFolder: true,
        tools: { core: [] },
        experimental: {
          codebaseInvestigatorSettings: {
            enabled: false,
          },
          cliHelpAgentSettings: {
            enabled: false,
          },
        },
      },
    });

    // Initialize git repo to make it a project root
    const { execSync } = await import('node:child_process');
    execSync('git init', { cwd: testDir });

    // Create server script in the test directory
    writeFileSync(testServerPath, serverScript);

    // Make the script executable (though running with 'node' should work anyway)
    if (process.platform !== 'win32') {
      const { chmodSync } = await import('node:fs');
      chmodSync(testServerPath, 0o755);
    }

    // Poll for script for up to 5s
    const { accessSync, constants } = await import('node:fs');
    const isReady = await poll(
      () => {
        try {
          accessSync(testServerPath, constants.F_OK);
          return true;
        } catch {
          return false;
        }
      },
      5000, // Max wait 5 seconds
      100, // Poll every 100ms
    );

    if (!isReady) {
      throw new Error('MCP server script was not ready in time.');
    }

    // Debug: List configured MCP servers
    try {
      const listMcpOutput = await rig.runCommand(['mcp', 'list']);
      console.log('MCP Servers Status:\n', listMcpOutput);
    } catch (e) {
      console.log('Failed to list MCP servers:', (e as Error).message);
    }

    const abortController = new AbortController();
    const runPromise = rig.run({
      args: "Use the 'add' tool to calculate 1234.5678 + 8765.4321. You must use the tool for this calculation. DO NOT use any other tool.",
    });

    // Ensure we stop polling if the run finishes (either success or failure)
    runPromise.finally(() => abortController.abort());

    // Wait for the tool call with a generous timeout (150s), but stop early if process exits
    const foundToolCall = await rig.waitForToolCall(
      'add',
      150000,
      undefined,
      abortController.signal,
    );

    if (!foundToolCall) {
      const toolLogs = rig.readToolLogs();
      console.log(
        'Actual tool calls found:',
        JSON.stringify(toolLogs, null, 2),
      );
      const result = await runPromise;
      console.log('Run output:', result);
    }

    expect(foundToolCall, 'Expected to find an add tool call').toBeTruthy();

    const result = await runPromise;
    expect(result).toContain('9999.9999');
  });
});
