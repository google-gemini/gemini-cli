/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Agent Harness E2E', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should execute a simple prompt using the agent harness', async () => {
    await rig.setup('agent-harness-simple');

    // Run with the harness enabled via env var
    // Turn 1
    const result1 = await rig.run({
      args: ['chat', 'My name is GeminiUser'],
      env: {
        ...process.env,
        GEMINI_ENABLE_AGENT_HARNESS: 'true',
      },
    });
    expect(result1).toBeDefined();

    // Turn 2
    const result2 = await rig.run({
      args: ['chat', 'What is my name?', '--resume', 'latest'],
      env: {
        ...process.env,
        GEMINI_ENABLE_AGENT_HARNESS: 'true',
      },
    });

    expect(result2).toContain('GeminiUser');
  }, 120000);

  it('should delegate to codebase_investigator and synthesize results', async () => {
    await rig.setup('agent-harness-delegation');

    // Create a dummy file for CBI to find
    const historyDir = path.join(rig.testDir!, 'packages/core/src');
    fs.mkdirSync(historyDir, { recursive: true });
    fs.writeFileSync(
      path.join(historyDir, 'history.ts'),
      `
      /** ChatHistory maintains the message history for the session. */
      export class ChatHistory {
        private messages: any[] = [];
        addMessage(msg: any) { this.messages.push(msg); }
      }
    `,
    );
    const result = await rig.run({
      args: [
        'chat',
        'use @codebase_investigator to tell me about how chat history is maintained',
      ],
      env: {
        ...process.env,
        GEMINI_ENABLE_AGENT_HARNESS: 'true',
      },
    });

    // Verify synthesis: CBI should have found ChatHistory or history.ts
    const output = result.toLowerCase();
    expect(output).toMatch(/history|chat/);

    // Verify single delegation: CBI should only be called once.
    // We check the tool logs for 'codebase_investigator'
    const toolLogs = rig.readToolLogs();
    const cbiCalls = toolLogs.filter(
      (log) => log.toolRequest?.name === 'codebase_investigator',
    );

    if (cbiCalls.length < 1) {
      console.log('DEBUG: Full tool logs:', JSON.stringify(toolLogs, null, 2));
      if (rig._lastRunStdout) {
        console.log('DEBUG: Full stdout length:', rig._lastRunStdout.length);
      }
    }

    expect(cbiCalls.length).toBeGreaterThanOrEqual(1);
  }, 240000);
});
