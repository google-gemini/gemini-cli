/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { GeminiCliAgent } from './agent.js';
import * as path from 'node:path';
import { z } from 'zod';
import { tool, ModelVisibleError } from './tool.js';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set this to true locally when you need to update snapshots
const RECORD_MODE = process.env['RECORD_NEW_RESPONSES'] === 'true';

const getGoldenPath = (name: string) =>
  path.resolve(__dirname, '../test-data', `${name}.json`);

describe('GeminiCliAgent Tool Integration', () => {
  it('handles tool execution success', async () => {
    const goldenFile = getGoldenPath('tool-success');

    const agent = new GeminiCliAgent({
      instructions: 'You are a helpful assistant.',
      // If recording, use real model + record path.
      // If testing, use auto model + fake path.
      model: RECORD_MODE ? 'gemini-2.0-flash' : undefined,
      recordResponses: RECORD_MODE ? goldenFile : undefined,
      fakeResponses: RECORD_MODE ? undefined : goldenFile,
      tools: [
        tool(
          {
            name: 'add',
            description: 'Adds two numbers',
            inputSchema: z.object({ a: z.number(), b: z.number() }),
          },
          async ({ a, b }) => a + b,
        ),
      ],
    });

    const events = [];
    const session = agent.session();
    const stream = session.sendStream('What is 5 + 3?');

    for await (const event of stream) {
      events.push(event);
    }

    const textEvents = events.filter((e) => e.type === 'content');
    const responseText = textEvents
      .map((e) => (typeof e.value === 'string' ? e.value : ''))
      .join('');

    expect(responseText).toContain('8');
  });

  it('handles ModelVisibleError correctly', async () => {
    const goldenFile = getGoldenPath('tool-error-recovery');

    const agent = new GeminiCliAgent({
      instructions: 'You are a helpful assistant.',
      model: RECORD_MODE ? 'gemini-2.0-flash' : undefined,
      recordResponses: RECORD_MODE ? goldenFile : undefined,
      fakeResponses: RECORD_MODE ? undefined : goldenFile,
      tools: [
        tool(
          {
            name: 'failVisible',
            description: 'Fails with a visible error if input is "fail"',
            inputSchema: z.object({ input: z.string() }),
          },
          async ({ input }) => {
            if (input === 'fail') {
              throw new ModelVisibleError('Tool failed visibly');
            }
            return 'Success';
          },
        ),
      ],
    });

    const events = [];
    const session = agent.session();
    // Force the model to trigger the error first, then hopefully recover or at least acknowledge it.
    // The prompt is crafted to make the model try 'fail' first.
    const stream = session.sendStream(
      'Call the tool with "fail". If it fails, tell me the error message.',
    );

    for await (const event of stream) {
      events.push(event);
    }

    const textEvents = events.filter((e) => e.type === 'content');
    const responseText = textEvents
      .map((e) => (typeof e.value === 'string' ? e.value : ''))
      .join('');

    // The model should see the error "Tool failed visibly" and report it back.
    expect(responseText).toContain('Tool failed visibly');
  });

  it('handles sendErrorsToModel: true correctly', async () => {
    const goldenFile = getGoldenPath('tool-catchall-error');

    const agent = new GeminiCliAgent({
      instructions: 'You are a helpful assistant.',
      model: RECORD_MODE ? 'gemini-2.0-flash' : undefined,
      recordResponses: RECORD_MODE ? goldenFile : undefined,
      fakeResponses: RECORD_MODE ? undefined : goldenFile,
      tools: [
        tool(
          {
            name: 'checkSystemStatus',
            description: 'Checks the current system status',
            inputSchema: z.object({}),
            sendErrorsToModel: true,
          },
          async () => {
            throw new Error('Standard error caught');
          },
        ),
      ],
    });

    const events = [];
    const session = agent.session();
    const stream = session.sendStream(
      'Check the system status and report any errors.',
    );

    for await (const event of stream) {
      events.push(event);
    }

    const textEvents = events.filter((e) => e.type === 'content');
    const responseText = textEvents
      .map((e) => (typeof e.value === 'string' ? e.value : ''))
      .join('');

    // The model should report the caught standard error.
    expect(responseText.toLowerCase()).toContain('error');
  });
});
