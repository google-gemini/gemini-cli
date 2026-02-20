/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect } from 'vitest';

/* =========================================================
   GLOBAL AUTH + OAUTH MOCKS
   MUST COME BEFORE ANY PROJECT IMPORTS
   ========================================================= */

// Mock Gemini OAuth (prevents real authentication)
vi.mock('../../core/src/code_assist/oauth2', () => ({
  getAccessToken: async () => ({
    token: 'fake-test-token',
  }),
  getOAuthClient: async () => ({
    getAccessToken: async () => ({
      token: 'fake-test-token',
    }),
  }),
}));

// Mock google-auth-library (prevents metadata server calls)
vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() {
      return {
        getAccessToken: async () => ({
          token: 'fake-test-token',
        }),
      };
    }
  },
}));

// Disable auth paths completely during tests
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'test';
process.env.GEMINI_DISABLE_AUTH = 'true';

/* =========================================================
   IMPORTS (AFTER MOCKS)
   ========================================================= */

import { GeminiCliAgent } from './agent.js';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Enable when recording new golden responses
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

    expect(session.id).toMatch(/^[0-9a-f-]{36}$/i);

    const events: unknown[] = [];
    const stream = session.sendStream('Say hello.');

    for await (const event of stream) {
      events.push(event);
    }

    const responseText = (events as Array<{ type: string; value: unknown }>)
      .filter((e) => e.type === 'content')
      .map((e) => (typeof e.value === 'string' ? e.value : ''))
      .join('');

    expect(responseText.toLowerCase()).toMatch(/ahoy|matey|arrr/);
  }, 30000);

  it('handles dynamic instructions', async () => {
    const goldenFile = getGoldenPath('agent-dynamic-instructions');

    let callCount = 0;

    const agent = new GeminiCliAgent({
      instructions: () => {
        callCount++;
        return `Secret number is ${callCount}`;
      },
      model: 'gemini-2.0-flash',
      recordResponses: RECORD_MODE ? goldenFile : undefined,
      fakeResponses: RECORD_MODE ? undefined : goldenFile,
    });

    const session = agent.session();

    const collect = async (prompt: string) => {
      const events: unknown[] = [];
      const stream = session.sendStream(prompt);

      for await (const e of stream) events.push(e);

      return (events as Array<{ type: string; value: unknown }>)
        .filter((e) => e.type === 'content')
        .map((e) => (typeof e.value === 'string' ? e.value : ''))
        .join('');
    };

    expect(await collect('What is the secret number?')).toContain('1');
    expect(await collect('What is the secret number now?')).toContain('2');
  }, 30000);

  it('resumes a session', async () => {
    const goldenFile = getGoldenPath('agent-resume-session');

    const agent = new GeminiCliAgent({
      instructions: 'Remember the word "BANANA".',
      model: 'gemini-2.0-flash',
      recordResponses: RECORD_MODE ? goldenFile : undefined,
      fakeResponses: RECORD_MODE ? undefined : goldenFile,
    });

    const session1 = agent.session({ sessionId: 'resume-test-fixed-id' });

    for await (const _ of session1.sendStream('What is the word?')) {
      // consume stream
    }

    await new Promise((r) => setTimeout(r, 500));

    const session2 = await agent.resumeSession(session1.id);

    const events: unknown[] = [];
    const stream2 = session2.sendStream('What is the word again?');

    for await (const e of stream2) {
      events.push(e);
    }

    const responseText = (events as Array<{ type: string; value: unknown }>)
      .filter((e) => e.type === 'content')
      .map((e) => (typeof e.value === 'string' ? e.value : ''))
      .join('');

    expect(responseText).toContain('BANANA');
  }, 30000);

  it('throws on invalid instructions', () => {
    expect(() =>
      new GeminiCliAgent(
        {} as unknown as Parameters<typeof GeminiCliAgent>[0],
      ).session(),
    ).not.toThrow();

    expect(() =>
      new GeminiCliAgent({
        instructions: 123 as unknown as string,
      }).session(),
    ).toThrow('Instructions must be a string or a function.');
  });

  it('propagates errors from dynamic instructions', async () => {
    const agent = new GeminiCliAgent({
      instructions: () => {
        throw new Error('Dynamic instruction failure');
      },

      // ⭐ CRITICAL: forces fake client → skips auth completely
      fakeResponses: getGoldenPath('agent-static-instructions'),

      model: 'gemini-2.0-flash',
    });

    const session = agent.session();
    const stream = session.sendStream('Say hello.');

    await expect(async () => {
      for await (const _ of stream) {
        void _;
      }
    }).rejects.toThrow('Dynamic instruction failure');
  });
});
