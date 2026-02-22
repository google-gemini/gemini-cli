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
const RECORD_MODE = process.env['RECORD_NEW_RESPONSES'] === 'true';

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

    const session = agent.session();
    expect(session.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    const events = [];
    const stream = session.sendStream('Say hello.');

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

    const session = agent.session();

    // First turn
    const events1 = [];
    const stream1 = session.sendStream('What is the secret number?');
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
    const stream2 = session.sendStream('What is the secret number now?');
    for await (const event of stream2) {
      events2.push(event);
    }
    const responseText2 = events2
      .filter((e) => e.type === 'content')
      .map((e) => (typeof e.value === 'string' ? e.value : ''))
      .join('');

    expect(responseText2).toContain('2');
  }, 30000);

  it('resumes a session', async () => {
    const goldenFile = getGoldenPath('agent-resume-session');

    // Create initial session
    const agent = new GeminiCliAgent({
      instructions: 'You are a memory test. Remember the word "BANANA".',
      model: 'gemini-2.0-flash',
      recordResponses: RECORD_MODE ? goldenFile : undefined,
      fakeResponses: RECORD_MODE ? undefined : goldenFile,
    });

    const session1 = agent.session({ sessionId: 'resume-test-fixed-id' });
    const sessionId = session1.id;
    const stream1 = session1.sendStream('What is the word?');
    for await (const _ of stream1) {
      // consume stream
    }

    // Resume session
    // Allow some time for async writes if any
    await new Promise((resolve) => setTimeout(resolve, 500));

    const session2 = await agent.resumeSession(sessionId);
    expect(session2.id).toBe(sessionId);

    const events2 = [];
    const stream2 = session2.sendStream('What is the word again?');
    for await (const event of stream2) {
      events2.push(event);
    }

    const responseText = events2
      .filter((e) => e.type === 'content')
      .map((e) => (typeof e.value === 'string' ? e.value : ''))
      .join('');

    expect(responseText).toContain('BANANA');
  }, 30000);

  it('throws on invalid instructions', () => {
    // Missing instructions should be fine
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new GeminiCliAgent({} as any).session()).not.toThrow();

    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new GeminiCliAgent({ instructions: 123 as any }).session(),
    ).toThrow('Instructions must be a string or a function.');
  });

  it('propagates errors from dynamic instructions', async () => {
    const agent = new GeminiCliAgent({
      instructions: () => {
        throw new Error('Dynamic instruction failure');
      },
      model: 'gemini-2.0-flash',
    });

    const session = agent.session();
    const stream = session.sendStream('Say hello.');

    await expect(async () => {
      for await (const _event of stream) {
        // Just consume the stream
      }
    }).rejects.toThrow('Dynamic instruction failure');
  });
});
