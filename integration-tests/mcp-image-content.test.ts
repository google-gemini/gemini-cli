/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig, validateModelOutput, poll } from './test-helper.js';
import { join } from 'node:path';
import { writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';

describe('MCP Image Content', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should successfully handle image content from MCP server', async () => {
    const serverScript = `#!/usr/bin/env node
const readline = require('readline');
const fs = require('fs');

const log = (msg) => fs.appendFileSync('mcp-server.log', msg + '\\n');

log('Server starting...');

process.on('uncaughtException', (err) => {
  log('UNCAUGHT EXCEPTION: ' + err.stack);
  process.exit(1);
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  if (!line.trim()) return;
  log('RECEIVED: ' + line);
  try {
    const request = JSON.parse(line);
    if (request.method === 'initialize') {
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'image-server', version: '1.0.0' }
        }
      };
      log('SENDING INITIALIZE RESPONSE: ' + JSON.stringify(response));
      process.stdout.write(JSON.stringify(response) + '\\n');
    } else if (request.method === 'notifications/initialized') {
      log('RECEIVED INITIALIZED NOTIFICATION');
    } else if (request.method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: [{
            name: 'get_image',
            description: 'Returns a tiny 1x1 image',
            inputSchema: { type: 'object', properties: {} }
          }]
        }
      };
      log('SENDING TOOLS/LIST RESPONSE: ' + JSON.stringify(response));
      process.stdout.write(JSON.stringify(response) + '\\n');
    } else if (request.method === 'tools/call') {
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            { type: 'text', text: '1x1 image' },
            {
              type: 'image',
              data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
              mimeType: 'image/png'
            }
          ]
        }
      };
      log('SENDING TOOLS/CALL RESPONSE: ' + JSON.stringify(response));
      process.stdout.write(JSON.stringify(response) + '\\n');
    } else {
      log('RECEIVED UNKNOWN METHOD: ' + request.method);
    }
  } catch (e) {
    log('ERROR processing line: ' + e.message);
  }
});

rl.on('close', () => {
  log('Readline interface CLOSED');
});
`;
    const tempFakeResponsesPath = join(
      os.tmpdir(),
      `fake-responses-${Date.now()}.json`,
    );
    const fakeResponses = [
      JSON.stringify({
        method: 'generateContentStream',
        response: [
          {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      functionCall: {
                        name: 'image-server__get_image',
                        args: {},
                      },
                    },
                  ],
                  role: 'model',
                },
                finishReason: 'STOP',
                index: 0,
              },
            ],
          },
        ],
      }),
      JSON.stringify({
        method: 'generateContentStream',
        response: [
          {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: 'I see the image. It is a 1x1 transparent PNG.',
                    },
                  ],
                  role: 'model',
                },
                finishReason: 'STOP',
                index: 0,
              },
            ],
          },
        ],
      }),
      JSON.stringify({
        method: 'generateContentStream',
        response: [
          {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: 'Final response after tool description.',
                    },
                  ],
                  role: 'model',
                },
                finishReason: 'STOP',
                index: 0,
              },
            ],
          },
        ],
      }),
    ].join('\n');
    writeFileSync(tempFakeResponsesPath, fakeResponses);

    await rig.setup('mcp-image-content', {
      settings: {
        mcpServers: {
          'image-server': {
            command: process.execPath,
            args: ['mcp-server.cjs'], // Placeholder, will be absolute below
            timeout: 5000,
          },
        },
        telemetry: {
          logPrompts: true,
        },
        tools: {
          enableHooks: true,
        },
        allowedTools: ['image-server__get_image'],
        hooks: {
          AfterTool: [
            {
              matcher: '*',
              hooks: [
                {
                  type: 'command',
                  command: 'echo "{"decision": "allow"}"',
                },
              ],
            },
          ],
          BeforeModel: [
            {
              matcher: '*', // Apply to all model calls
              hooks: [
                {
                  type: 'command',
                  command: `node -e "const fs=require('fs'); let input=''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => { try { const data = JSON.parse(input); if (data.llm_request?.messages) { fs.appendFileSync('history.log', JSON.stringify(data.llm_request.messages) + '\\n'); } console.log(JSON.stringify({decision: 'allow'})); } catch (e) { console.error(e); process.exit(1); } });"`,
                },
              ],
            },
          ],
        },
      },
      fakeResponsesPath: tempFakeResponsesPath,
    });

    const testServerPath = join(rig.testDir!, 'mcp-server.cjs');
    writeFileSync(testServerPath, serverScript);

    if (process.platform !== 'win32') {
      chmodSync(testServerPath, 0o755);
    }

    // Rewrite settings.json with absolute path to the server script
    const settingsPath = join(rig.testDir!, '.gemini', 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    settings.mcpServers['image-server'].args = [testServerPath];
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // Wait for MCP tools to be discovered
    await poll(
      async () => {
        const output = await rig.run({
          args: ['/mcp list'],
          yolo: false,
        });
        return output.includes('image-server__get_image');
      },
      30000,
      1000,
    );

    try {
      const output = await rig.run({
        args: [
          'Call image-server__get_image and describe what you see.',
          '--allowed-tools',
          'image-server__get_image',
        ],
        yolo: false,
      });

      const foundToolCall = await rig.waitForToolCall(
        'image-server__get_image',
      );
      expect(
        foundToolCall,
        `Expected to find image-server__get_image tool call. Output: ${output}`,
      ).toBeTruthy();

      // Verify model output
      validateModelOutput(output, 'Final response', 'MCP image test');

      // Verify history surfacing via BeforeModel hook recording
      await poll(
        () => {
          const historyEntries = rig.readHistoryLog();
          return (historyEntries as unknown[][]).some(
            (messages) =>
              Array.isArray(messages) &&
              messages.some((m) => {
                const msg = m as Record<string, unknown>;
                return (
                  msg.role === 'user' &&
                  Array.isArray(msg.content) &&
                  msg.content.some((p) => {
                    const part = p as Record<string, unknown>;
                    return part.type === 'image' || part.inlineData;
                  })
                );
              }),
          );
        },
        30000,
        500,
      );

      const historyEntries = rig.readHistoryLog();

      let imagePartInHistory: unknown = undefined;
      for (const messages of historyEntries as unknown[][]) {
        if (!Array.isArray(messages)) continue;
        for (const message of messages) {
          const msg = message as Record<string, unknown>;
          if (msg.role !== 'user' || !Array.isArray(msg.content)) continue;
          const imagePart = msg.content.find((p) => {
            const part = p as Record<string, unknown>;
            return part.type === 'image' || part.inlineData;
          });
          if (imagePart) {
            imagePartInHistory = imagePart;
            break;
          }
        }
        if (imagePartInHistory) break;
      }

      expect(
        imagePartInHistory,
        'Expected to find image data in model history',
      ).toBeDefined();

      const inlineData =
        (imagePartInHistory as Record<string, unknown>).inlineData ||
        imagePartInHistory;
      expect((inlineData as Record<string, unknown>).mimeType).toBe(
        'image/png',
      );
      expect((inlineData as Record<string, unknown>).data).toBe(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      );
    } catch (e) {
      // Print logs for debugging
      const historyLogPath = join(rig.testDir!, 'history.log');
      if (existsSync(historyLogPath)) {
        console.error(
          'History Log Content:\n',
          readFileSync(historyLogPath, 'utf-8'),
        );
      }

      const mcpLogPath = join(rig.testDir!, 'mcp-server.log');
      if (existsSync(mcpLogPath)) {
        console.error(
          'MCP Server Log Content:\n',
          readFileSync(mcpLogPath, 'utf-8'),
        );
      }
      throw e;
    }
  });
});
