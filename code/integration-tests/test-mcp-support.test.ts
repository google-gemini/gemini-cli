/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TestRig,
  assertModelHasOutput,
  TestMcpServerBuilder,
} from './test-helper.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('test-mcp-support', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should discover and call a tool on the test server', async () => {
    await rig.setup('test-mcp-test', {
      settings: {
        tools: { core: [] }, // disable core tools to force using MCP
        model: {
          name: 'gemini-3-flash-preview',
        },
      },
      fakeResponsesPath: join(__dirname, 'test-mcp-support.responses'),
    });

    // Workaround for ProjectRegistry save issue
    const userGeminiDir = join(rig.homeDir!, '.gemini');
    fs.writeFileSync(join(userGeminiDir, 'projects.json'), '{"projects":{}}');

    const builder = new TestMcpServerBuilder('weather-server').addTool(
      'get_weather',
      'Get the weather for a location',
      'The weather in London is always rainy.',
      {
        type: 'object',
        properties: {
          location: { type: 'string' },
        },
      },
    );

    rig.addTestMcpServer('weather-server', builder.build());

    // Run the CLI asking for weather
    const output = await rig.run({
      args: 'What is the weather in London? Answer with the raw tool response snippet.',
      env: { GEMINI_API_KEY: 'dummy' },
    });

    // Assert tool call
    const foundToolCall = await rig.waitForToolCall(
      'mcp_weather-server_get_weather',
    );
    expect(
      foundToolCall,
      'Expected to find a get_weather tool call',
    ).toBeTruthy();

    assertModelHasOutput(output);
    expect(output.toLowerCase()).toContain('rainy');
  }, 30000);
});
