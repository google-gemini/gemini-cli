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

import { describe, it, beforeAll, expect } from 'vitest';
import { TestRig, poll, validateModelOutput } from './test-helper.js';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

const serverScript = `#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const readline = require('readline');
const fs = require('fs');

const debugEnabled = process.env['MCP_DEBUG'] === 'true' || process.env['VERBOSE'] === 'true';
function debug(msg) {
  if (debugEnabled) {
    fs.writeSync(2, '[MCP-DEBUG] ' + msg + '\n');
  }
}

debug('MCP sampling server starting...');

class SimpleJSONRPC {
  constructor() {
    this.handlers = new Map();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });
    
    this.rl.on('line', (line) => {
      debug('Received line: ' + line);
      try {
        const message = JSON.parse(line);
        debug('Parsed message: ' + JSON.stringify(message));
        this.handleMessage(message);
      } catch (e) {
        debug('Parse error: ' + e.message);
      }
    });
  }
  
  send(message) {
    const msgStr = JSON.stringify(message);
    debug('Sending message: ' + msgStr);
    process.stdout.write(msgStr + '\n');
  }

  request(method, params) {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substring(2);
      this.handlers.set(id, (response) => {
        if (response.error) {
          reject(new Error(response.error.message));
        }
        else {
          resolve(response.result);
        }
      });
      this.send({
        jsonrpc: '2.0',
        id,
        method,
        params
      });
    });
  }
  
  async handleMessage(message) {
    if (message.id && this.handlers.has(message.id)) {
      this.handlers.get(message.id)(message);
      this.handlers.delete(message.id);
      return;
    }

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
      }
      catch (error) {
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
    }
    else if (message.id !== undefined) {
      this.send({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32601,
          message: 'Method not found'
        }
      });
    }
  }
  
  on(method, handler) {
    this.handlers.set(method, handler);
  }
}

const rpc = new SimpleJSONRPC();

rpc.on('initialize', async (params) => {
  debug('Handling initialize request');
  return {
    protocolVersion: '2024-11-05',
    capabilities: {
      sampling: true,
    },
    serverInfo: {
      name: 'sampler-server',
      version: '1.0.0'
    }
  };
});

rpc.on('tools/list', async () => {
  debug('Handling tools/list request');
  return {
    tools: [{
      name: 'sample',
      description: 'Uses the LLM to sample a response to a prompt.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The prompt to sample' },
        },
        required: ['prompt']
      }
    }]
  };
});

rpc.on('tools/call', async (params) => {
  debug('Handling tools/call request for tool: ' + params.name);
  if (params.name === 'sample') {
    const { prompt } = params.arguments;
    
    debug('Requesting sampling from client...');
    // MCP spec: messages at top level, content is a single object (not array)
    const result = await rpc.request('sampling/createMessage', {
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: prompt }
        }
      ]
    });
    debug('Received sampling result: ' + JSON.stringify(result));

    return result;
  }
  throw new Error('Unknown tool: ' + params.name);
});

rpc.send({
  jsonrpc: '2.0',
  method: 'initialized'
});
`;

describe('mcp-sampling', () => {
  const rig = new TestRig();

  beforeAll(async () => {
    await rig.setup('mcp-sampling', {
      settings: {
        mcpServers: {
          'sampler-server': {
            command: 'node',
            args: ['mcp-server.cjs'],
          },
        },
      },
    });

    const testServerPath = join(rig.testDir!, 'mcp-server.cjs');
    writeFileSync(testServerPath, serverScript);

    if (process.platform !== 'win32') {
      const { chmodSync } = await import('node:fs');
      chmodSync(testServerPath, 0o755);
    }

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
      5000,
      100,
    );

    if (!isReady) {
      throw new Error('MCP server script was not ready in time.');
    }
  });

  it('should use the sample tool and get a response', async () => {
    const child = rig.run(
      "Use the sample tool to ask 'what is the capital of France?'",
      ['--auto-confirm-mcp-sampling'],
    );

    const foundToolCall = await rig.waitForToolCall('sample');
    expect(foundToolCall, 'Expected to find a sample tool call').toBeTruthy();

    const output = await child;

    validateModelOutput(output, 'Paris', 'MCP sampling test');
    expect(
      output.includes('Paris'),
      'Expected output to contain the capital of France (Paris)',
    ).toBeTruthy();
  });
});
