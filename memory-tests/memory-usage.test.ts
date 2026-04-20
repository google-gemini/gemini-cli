/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeAll, afterAll, afterEach } from 'vitest';
import { TestRig, MemoryTestHarness } from '@google/gemini-cli-test-utils';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createWriteStream,
  copyFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINES_PATH = join(__dirname, 'baselines.json');
const UPDATE_BASELINES = process.env['UPDATE_MEMORY_BASELINES'] === 'true';
const TOLERANCE_PERCENT = 10;

// Fake API key for tests using fake responses
const TEST_ENV = { GEMINI_API_KEY: 'fake-memory-test-key' };

describe('Memory Usage Tests', () => {
  let harness: MemoryTestHarness;
  let rig: TestRig;

  beforeAll(() => {
    harness = new MemoryTestHarness({
      baselinesPath: BASELINES_PATH,
      defaultTolerancePercent: TOLERANCE_PERCENT,
      gcCycles: 3,
      gcDelayMs: 100,
      sampleCount: 3,
    });
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  afterAll(async () => {
    // Generate the summary report after all tests
    await harness.generateReport();
  });

  it('idle-session-startup: memory usage within baseline', async () => {
    rig = new TestRig();
    rig.setup('memory-idle-startup', {
      fakeResponsesPath: join(__dirname, 'memory.idle-startup.responses'),
    });

    const result = await harness.runScenario(
      'idle-session-startup',
      async (recordSnapshot) => {
        await rig.run({
          args: ['hello'],
          timeout: 120000,
          env: TEST_ENV,
        });

        await recordSnapshot('after-startup');
      },
    );

    if (UPDATE_BASELINES) {
      harness.updateScenarioBaseline(result);
      console.log(
        `Updated baseline for idle-session-startup: ${(result.finalHeapUsed / (1024 * 1024)).toFixed(1)} MB`,
      );
    } else {
      harness.assertWithinBaseline(result);
    }
  });

  it('simple-prompt-response: memory usage within baseline', async () => {
    rig = new TestRig();
    rig.setup('memory-simple-prompt', {
      fakeResponsesPath: join(__dirname, 'memory.simple-prompt.responses'),
    });

    const result = await harness.runScenario(
      'simple-prompt-response',
      async (recordSnapshot) => {
        await rig.run({
          args: ['What is the capital of France?'],
          timeout: 120000,
          env: TEST_ENV,
        });

        await recordSnapshot('after-response');
      },
    );

    if (UPDATE_BASELINES) {
      harness.updateScenarioBaseline(result);
      console.log(
        `Updated baseline for simple-prompt-response: ${(result.finalHeapUsed / (1024 * 1024)).toFixed(1)} MB`,
      );
    } else {
      harness.assertWithinBaseline(result);
    }
  });

  it('multi-turn-conversation: memory remains stable over turns', async () => {
    rig = new TestRig();
    rig.setup('memory-multi-turn', {
      fakeResponsesPath: join(__dirname, 'memory.multi-turn.responses'),
    });

    const prompts = [
      'Hello, what can you help me with?',
      'Tell me about JavaScript',
      'How is TypeScript different?',
      'Can you write a simple TypeScript function?',
      'What are some TypeScript best practices?',
    ];

    const result = await harness.runScenario(
      'multi-turn-conversation',
      async (recordSnapshot) => {
        // Run through all turns as a piped sequence
        const stdinContent = prompts.join('\n');
        await rig.run({
          stdin: stdinContent,
          timeout: 120000,
          env: TEST_ENV,
        });

        // Take snapshots after the conversation completes
        await recordSnapshot('after-all-turns');
      },
    );

    if (UPDATE_BASELINES) {
      harness.updateScenarioBaseline(result);
      console.log(
        `Updated baseline for multi-turn-conversation: ${(result.finalHeapUsed / (1024 * 1024)).toFixed(1)} MB`,
      );
    } else {
      harness.assertWithinBaseline(result);
    }
  });

  it('multi-function-call-repo-search: memory after tool use', async () => {
    rig = new TestRig();
    rig.setup('memory-multi-func-call', {
      fakeResponsesPath: join(
        __dirname,
        'memory.multi-function-call.responses',
      ),
    });

    // Create directories first, then files in the workspace so the tools have targets
    rig.mkdir('packages/core/src/telemetry');
    rig.createFile(
      'packages/core/src/telemetry/memory-monitor.ts',
      'export class MemoryMonitor { constructor() {} }',
    );
    rig.createFile(
      'packages/core/src/telemetry/metrics.ts',
      'export function recordMemoryUsage() {}',
    );

    const result = await harness.runScenario(
      'multi-function-call-repo-search',
      async (recordSnapshot) => {
        await rig.run({
          args: [
            'Search this repository for MemoryMonitor and tell me what it does',
          ],
          timeout: 120000,
          env: TEST_ENV,
        });

        await recordSnapshot('after-tool-calls');
      },
    );

    if (UPDATE_BASELINES) {
      harness.updateScenarioBaseline(result);
      console.log(
        `Updated baseline for multi-function-call-repo-search: ${(result.finalHeapUsed / (1024 * 1024)).toFixed(1)} MB`,
      );
    } else {
      harness.assertWithinBaseline(result);
    }
  });

  describe('Large Chat Scenarios', () => {
    let sharedResumeResponsesPath: string;
    let sharedActiveResponsesPath: string;
    let sharedHistoryPath: string;
    let sharedPrompts: string;
    let tempDir: string;

    beforeAll(async () => {
      tempDir = join(__dirname, `large-chat-tmp-${randomUUID()}`);
      mkdirSync(tempDir, { recursive: true });

      const { resumeResponsesPath, activeResponsesPath, historyPath, prompts } =
        await generateSharedLargeChatData(tempDir);
      sharedActiveResponsesPath = activeResponsesPath;
      sharedResumeResponsesPath = resumeResponsesPath;
      sharedHistoryPath = historyPath;
      sharedPrompts = prompts;
    }, 60000);

    afterAll(() => {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    afterEach(async () => {
      await rig.cleanup();
    });

    it('large-chat: memory usage within baseline', async () => {
      rig = new TestRig();
      rig.setup('memory-large-chat', {
        fakeResponsesPath: sharedActiveResponsesPath,
      });

      const result = await harness.runScenario(
        'large-chat',
        async (recordSnapshot) => {
          await rig.run({
            stdin: sharedPrompts,
            timeout: 600000,
            env: TEST_ENV,
          });

          await recordSnapshot('after-large-chat');
        },
      );

      if (UPDATE_BASELINES) {
        harness.updateScenarioBaseline(result);
        console.log(
          `Updated baseline for large-chat: ${(result.finalHeapUsed / (1024 * 1024)).toFixed(1)} MB`,
        );
      } else {
        harness.assertWithinBaseline(result);
      }
    });

    it('resume-large-chat: memory usage within baseline', async () => {
      rig = new TestRig();
      rig.setup('memory-resume-large-chat', {
        fakeResponsesPath: sharedResumeResponsesPath,
      });

      const result = await harness.runScenario(
        'resume-large-chat',
        async (recordSnapshot) => {
          // Ensure the history file is linked
          const targetChatsDir = join(
            rig.testDir!,
            'tmp',
            'test-project-hash',
            'chats',
          );
          mkdirSync(targetChatsDir, { recursive: true });
          const targetHistoryPath = join(
            targetChatsDir,
            'large-chat-session.json',
          );
          if (existsSync(targetHistoryPath)) rmSync(targetHistoryPath);
          copyFileSync(sharedHistoryPath, targetHistoryPath);

          await rig.run({
            // add a prompt to make sure it does not hang there and exits immediately
            args: ['--resume', 'latest', '--prompt', 'hello'],
            timeout: 600000,
            env: TEST_ENV,
          });

          await recordSnapshot('after-resume-large-chat');
        },
      );

      if (UPDATE_BASELINES) {
        harness.updateScenarioBaseline(result);
        console.log(
          `Updated baseline for resume-large-chat: ${(result.finalHeapUsed / (1024 * 1024)).toFixed(1)} MB`,
        );
      } else {
        harness.assertWithinBaseline(result);
      }
    });

    it('resume-large-chat-with-messages: memory usage within baseline', async () => {
      rig = new TestRig();
      rig.setup('memory-resume-large-chat-msgs', {
        fakeResponsesPath: sharedResumeResponsesPath,
      });

      const result = await harness.runScenario(
        'resume-large-chat-with-messages',
        async (recordSnapshot) => {
          // Ensure the history file is linked
          const targetChatsDir = join(
            rig.testDir!,
            'tmp',
            'test-project-hash',
            'chats',
          );
          mkdirSync(targetChatsDir, { recursive: true });
          const targetHistoryPath = join(
            targetChatsDir,
            'large-chat-session.json',
          );
          if (existsSync(targetHistoryPath)) rmSync(targetHistoryPath);
          copyFileSync(sharedHistoryPath, targetHistoryPath);

          const stdinContent = 'new prompt 1\nnew prompt 2\n';

          await rig.run({
            args: ['--resume', 'latest'],
            stdin: stdinContent,
            timeout: 600000,
            env: TEST_ENV,
          });

          await recordSnapshot('after-resume-and-append');
        },
      );

      if (UPDATE_BASELINES) {
        harness.updateScenarioBaseline(result);
        console.log(
          `Updated baseline for resume-large-chat-with-messages: ${(result.finalHeapUsed / (1024 * 1024)).toFixed(1)} MB`,
        );
      } else {
        harness.assertWithinBaseline(result);
      }
    });
  });
});

async function generateSharedLargeChatData(tempDir: string) {
  const resumeResponsesPath = join(tempDir, 'large-chat-resume-chat.responses');
  const activeResponsesPath = join(tempDir, 'large-chat-active-chat.responses');
  const historyPath = join(tempDir, 'large-chat-history.json');
  const sourceSessionPath = join(__dirname, 'large-chat-session.json');

  const session = JSON.parse(readFileSync(sourceSessionPath, 'utf8'));
  const messages = session.messages;

  copyFileSync(sourceSessionPath, historyPath);

  // Generate fake responses for active chat
  const promptsList: string[] = [];
  const activeResponsesStream = createWriteStream(activeResponsesPath);
  const complexityResponse = {
    method: 'generateContent',
    response: {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"complexity_reasoning":"simple","complexity_score":1}',
              },
            ],
            role: 'model',
          },
          finishReason: 'STOP',
          index: 0,
        },
      ],
    },
  };
  const summaryResponse = {
    method: 'generateContent',
    response: {
      candidates: [
        {
          content: {
            parts: [
              { text: '{"originalSummary":"large chat summary","events":[]}' },
            ],
            role: 'model',
          },
          finishReason: 'STOP',
          index: 0,
        },
      ],
    },
  };

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.type === 'user') {
      promptsList.push(msg.content[0].text);

      // Start of a new turn
      activeResponsesStream.write(JSON.stringify(complexityResponse) + '\n');

      // Find all subsequent gemini messages until the next user message
      let j = i + 1;
      while (j < messages.length && messages[j].type === 'gemini') {
        const geminiMsg = messages[j];
        const parts = [];
        if (geminiMsg.content) {
          parts.push({ text: geminiMsg.content });
        }
        if (geminiMsg.toolCalls) {
          for (const tc of geminiMsg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.args,
              },
            });
          }
        }

        activeResponsesStream.write(
          JSON.stringify({
            method: 'generateContentStream',
            response: [
              {
                candidates: [
                  {
                    content: { parts, role: 'model' },
                    finishReason: 'STOP',
                    index: 0,
                  },
                ],
                usageMetadata: {
                  promptTokenCount: 100,
                  candidatesTokenCount: 100,
                  totalTokenCount: 200,
                  promptTokensDetails: [{ modality: 'TEXT', tokenCount: 100 }],
                },
              },
            ],
          }) + '\n',
        );
        j++;
      }
      // End of turn
      activeResponsesStream.write(JSON.stringify(summaryResponse) + '\n');
      // Skip the gemini messages we just processed
      i = j - 1;
    }
  }
  activeResponsesStream.end();

  // Generate responses for resumed chat
  const resumeResponsesStream = createWriteStream(resumeResponsesPath);
  for (let i = 0; i < 5; i++) {
    resumeResponsesStream.write(JSON.stringify(complexityResponse) + '\n');
    resumeResponsesStream.write(
      JSON.stringify({
        method: 'generateContentStream',
        response: [
          {
            candidates: [
              {
                content: {
                  parts: [{ text: `Resume response ${i}` }],
                  role: 'model',
                },
                finishReason: 'STOP',
                index: 0,
              },
            ],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 10,
              totalTokenCount: 20,
              promptTokensDetails: [{ modality: 'TEXT', tokenCount: 10 }],
            },
          },
        ],
      }) + '\n',
    );
    resumeResponsesStream.write(JSON.stringify(summaryResponse) + '\n');
  }
  resumeResponsesStream.end();

  // Wait for streams to finish
  await Promise.all([
    new Promise((res) =>
      activeResponsesStream.on('finish', () => res(undefined)),
    ),
    new Promise((res) =>
      resumeResponsesStream.on('finish', () => res(undefined)),
    ),
  ]);

  return {
    resumeResponsesPath,
    activeResponsesPath,
    historyPath,
    prompts: promptsList.join('\n'),
  };
}
