/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { GeminiCliAgent } from './agent.js';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set this to true locally when you need to update snapshots
const RECORD_MODE = process.env.RECORD_NEW_RESPONSES === 'true';

const getGoldenPath = (name: string) =>
  path.resolve(__dirname, '../test-data', `${name}.json`);

describe('GeminiCliAgent Integration', () => {
  it('handles static instructions', async () => {
    const goldenFile = getGoldenPath('agent-static-instructions');

    const agent = new GeminiCliAgent({
      instructions: 'You are a pirate. Respond in pirate speak.',
      model: 'gemini-2.0-flash',
      recordResponses: RECORD_MODE ? goldenFile : undefined,
      fakeResponses: RECORD_MODE ? undefined : goldenFile,
    });

    const events = [];
    const stream = agent.sendStream('Say hello.');

    for await (const event of stream) {
      events.push(event);
    }

    const textEvents = events.filter((e) => e.type === 'content');
    const responseText = textEvents
      .map((e) => (typeof e.value === 'string' ? e.value : ''))
      .join('');

    // Expect pirate speak
    expect(responseText.toLowerCase()).toMatch(/ahoy|matey|arrr/);
  }, 30000);

  it('handles dynamic instructions', async () => {
    const goldenFile = getGoldenPath('agent-dynamic-instructions');

    let callCount = 0;
    const agent = new GeminiCliAgent({
      instructions: (_ctx) => {
        callCount++;
        return `You are a helpful assistant. The secret number is ${callCount}. Always mention the secret number when asked.`;
      },
      model: 'gemini-2.0-flash',
      recordResponses: RECORD_MODE ? goldenFile : undefined,
      fakeResponses: RECORD_MODE ? undefined : goldenFile,
    });

    // First turn
    const events1 = [];
    const stream1 = agent.sendStream('What is the secret number?');
    for await (const event of stream1) {
      events1.push(event);
    }
    const responseText1 = events1
      .filter((e) => e.type === 'content')
      .map((e) => (typeof e.value === 'string' ? e.value : ''))
      .join('');

    expect(responseText1).toContain('1');

    // Second turn
    const events2 = [];
    const stream2 = agent.sendStream('What is the secret number now?');
    for await (const event of stream2) {
      events2.push(event);
    }
    const responseText2 = events2
      .filter((e) => e.type === 'content')
      .map((e) => (typeof e.value === 'string' ? e.value : ''))
      .join('');

    expect(responseText2).toContain('2');
  }, 30000);
});
