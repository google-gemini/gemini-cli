/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { FinishReason, GenerateContentResponse } from '@google/genai';
import type { FakeResponse } from '@google/gemini-cli-core';

describe('Context Management Resume E2E', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should preserve and utilize GC snapshot boundaries when resuming a session', async () => {
    const snapshotResponse: FakeResponse = {
      method: 'generateContent',
      response: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    new_facts: ['GC Triggered.'],
                    new_constraints: [],
                    new_tasks: [],
                    resolved_task_ids: [],
                    obsolete_fact_indices: [],
                    obsolete_constraint_indices: [],
                    chronological_summary: 'Snapshot created.',
                  }),
                },
              ],
              role: 'model',
            },
            finishReason: FinishReason.STOP,
            index: 0,
          },
        ],
      } as unknown as GenerateContentResponse,
    };

    const countTokensResponse: FakeResponse = {
      method: 'countTokens',
      response: { totalTokens: 50000 },
    };

    const streamResponse = (text: string): FakeResponse => ({
      method: 'generateContentStream',
      response: [
        {
          candidates: [
            {
              content: { parts: [{ text }], role: 'model' },
              finishReason: FinishReason.STOP,
              index: 0,
            },
          ],
        },
      ] as unknown as GenerateContentResponse[],
    });

    const setupResponses = (fileName: string, mocks: FakeResponse[]) => {
      const filePath = path.join(rig.testDir!, fileName);
      fs.writeFileSync(
        filePath,
        mocks.map((m) => JSON.stringify(m)).join('\n'),
      );
      return filePath;
    };

    await rig.setup('resume-gc-snapshot', {
      settings: {
        experimental: {
          stressTestProfile: true,
        },
      },
    });

    const massivePayload = 'X'.repeat(40000);
    const logFile = path.join(rig.testDir!, 'debug.log');
    const traceDir = path.join(rig.testDir!, 'traces');
    fs.mkdirSync(traceDir, { recursive: true });
    const traceLog = path.join(traceDir, 'trace.log');

    const commonEnv = {
      GEMINI_API_KEY: 'mock-key',
      GEMINI_DEBUG_LOG_FILE: logFile,
      GEMINI_CONTEXT_TRACE_DIR: traceDir,
    };

    // Provide a massive pool of responses to prevent exhaustion
    const runMocks: FakeResponse[] = [streamResponse('Acknowledged block.')];
    for (let i = 0; i < 50; i++) {
      runMocks.push(snapshotResponse);
      runMocks.push(countTokensResponse);
    }

    // Use stdin for the massive payload to avoid ENAMETOOLONG on Windows
    await rig.run({
      args: [
        '--debug',
        '--fake-responses-non-strict',
        setupResponses('resp1.json', runMocks),
      ],
      stdin: 'Turn 1: ' + massivePayload,
      env: commonEnv,
    });

    await rig.run({
      args: [
        '--debug',
        '--resume',
        'latest',
        '--fake-responses-non-strict',
        setupResponses('resp2.json', runMocks),
      ],
      stdin: 'Turn 2: ' + massivePayload,
      env: commonEnv,
    });

    const result3 = await rig.run({
      args: [
        '--debug',
        '--resume',
        'latest',
        '--fake-responses-non-strict',
        setupResponses('resp3.json', runMocks),
        'continue',
      ],
      env: commonEnv,
    });

    expect(result3).toContain('Acknowledged block');

    const traces = fs.readFileSync(traceLog, 'utf-8');
    expect(traces).toContain('Hitting Synchronous Pressure Barrier');
    expect(traces).toContain('GC Triggered.');
  });
});
