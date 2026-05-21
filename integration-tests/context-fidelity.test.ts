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
import type { FakeResponse, HistoryTurn } from '@google/gemini-cli-core';

describe('Context Management Fidelity E2E', () => {
  let rig: TestRig;

  function generateRandomString(length: number): string {
    const characters =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(
        Math.floor(Math.random() * characters.length),
      );
    }
    return result;
  }

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should reproduce the exact context working buffer on resume', async () => {
    // Mock responses to trigger GC (summarization)
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
      response: { totalTokens: 1000 },
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

    await rig.setup('context-fidelity', {
      settings: {
        experimental: {
          stressTestProfile: true, // Lowers thresholds to trigger GC easily
        },
      },
    });

    const traceDir = path.join(rig.testDir!, 'traces');
    fs.mkdirSync(traceDir, { recursive: true });
    const traceLog = path.join(traceDir, 'trace.log');

    const commonEnv = {
      GEMINI_API_KEY: 'mock-key',
      GEMINI_CONTEXT_TRACE_DIR: traceDir,
      GEMINI_CONTEXT_TRACE_ENABLED: 'true',
      GEMINI_DEBUG_LOG_FILE: path.join(rig.testDir!, 'debug.log'),
    };

    const runMocks: FakeResponse[] = [
      streamResponse('Ack 1'),
      streamResponse('Ack 2'),
      streamResponse('Ack 3'),
      streamResponse('Ack 4'),
      streamResponse('Ack 5'),
      streamResponse('Ack 6'),
      streamResponse('Ack 7'),
      streamResponse('Ack 8'),
      streamResponse('Ack 9'),
      streamResponse('Ack 10'),
      streamResponse('Ack 11'),
      streamResponse('Ack 12'),
    ];
    for (let i = 0; i < 50; i++) {
      runMocks.push(snapshotResponse);
      runMocks.push(countTokensResponse);
    }

    // Turns 1-10: Build up history
    for (let i = 1; i <= 10; i++) {
      await rig.run({
        args: [
          '--debug',
          i === 1 ? '' : '--resume',
          i === 1 ? '' : 'latest',
          '--fake-responses-non-strict',
          setupResponses(`resp_init_${i}.json`, runMocks),
        ].filter(Boolean),
        stdin: `Turn ${i}: ` + generateRandomString(900),
        env: commonEnv,
      });
    }

    // Turn 11: Penultimate turn
    await rig.run({
      args: [
        '--debug',
        '--resume',
        'latest',
        '--fake-responses-non-strict',
        setupResponses('resp2.json', runMocks),
      ],
      stdin: 'Turn 11: ' + generateRandomString(900),
      env: commonEnv,
    });

    // Turn 12: Breach threshold and force GC
    await rig.run({
      args: [
        '--debug',
        '--resume',
        'latest',
        '--fake-responses-non-strict',
        setupResponses('resp3.json', runMocks),
      ],
      stdin: 'Turn 12: ' + generateRandomString(900),
      env: commonEnv,
    });

    // Extract the rendered context asset from the log
    const getRenderedContext = (logContent: string): HistoryTurn[] | null => {
      const lines = logContent.split('\n');
      const renderLines = lines.filter(
        (l) =>
          l.includes('[Render] Render Sanitized Context for LLM') ||
          l.includes('[Render] Render Context for LLM'),
      );
      if (renderLines.length === 0) return null;

      const lastRender = renderLines[renderLines.length - 1];
      const detailsMatch = lastRender.match(/\| Details: (.*)$/);
      if (!detailsMatch) return null;

      const details = JSON.parse(detailsMatch[1]);
      const assetInfo =
        details.renderedContextSanitized || details.renderedContext;
      if (assetInfo && assetInfo.$asset) {
        const assetPath = path.join(traceDir, 'assets', assetInfo.$asset);
        return JSON.parse(fs.readFileSync(assetPath, 'utf-8'));
      }
      return assetInfo;
    };

    const log1 = fs.readFileSync(traceLog, 'utf-8');
    const contextBeforeExit = getRenderedContext(log1);
    expect(contextBeforeExit).toBeDefined();
    console.log(
      'Context Before Exit (First 2 turns):',
      JSON.stringify(contextBeforeExit!.slice(0, 2), null, 2),
    );

    // Turn 4: Resume and run a small command
    await rig.run({
      args: [
        '--debug',
        '--resume',
        'latest',
        '--fake-responses-non-strict',
        setupResponses('resp4.json', runMocks),
        'continue',
      ],
      env: commonEnv,
    });

    const log2 = fs.readFileSync(traceLog, 'utf-8');
    const contextAfterResume = getRenderedContext(log2);
    expect(contextAfterResume).toBeDefined();
    console.log(
      'Context After Resume (First 2 turns):',
      JSON.stringify(contextAfterResume!.slice(0, 2), null, 2),
    );

    expect(contextAfterResume!.length).toBeGreaterThanOrEqual(
      contextBeforeExit!.length,
    );

    for (let i = 0; i < contextBeforeExit!.length; i++) {
      expect(contextAfterResume![i].id).toBe(contextBeforeExit![i].id);
      expect(contextAfterResume![i].content).toEqual(
        contextBeforeExit![i].content,
      );
    }

    // Most importantly, synthetic IDs (like summaries) must be stable.
    const syntheticTurns = contextBeforeExit!.filter(
      (t: HistoryTurn) =>
        t.content.parts?.some((p) => p.text?.includes('active_tasks')) ||
        (t.id && t.id.length === 32),
    );
    expect(syntheticTurns.length).toBeGreaterThan(0);

    const syntheticTurnsAfter = contextAfterResume!.filter(
      (t: HistoryTurn) =>
        t.content.parts?.some((p) => p.text?.includes('active_tasks')) ||
        (t.id && t.id.length === 32),
    );
    expect(syntheticTurnsAfter.length).toBeGreaterThanOrEqual(
      syntheticTurns.length,
    );

    // Check if the first synthetic turn is identical
    expect(syntheticTurnsAfter[0].id).toBe(syntheticTurns[0].id);
    expect(syntheticTurnsAfter[0].content).toEqual(syntheticTurns[0].content);
  });
});
