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
  existsSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINES_PATH = join(__dirname, 'baselines.json');
const UPDATE_BASELINES = process.env['UPDATE_MEMORY_BASELINES'] === 'true';
const TOLERANCE_PERCENT = 10;

// Fake API key for tests using fake responses
const TEST_ENV = { GEMINI_API_KEY: 'fake-memory-test-key' };

// Numbers for the large chat scenarios
const MSG_PAYLOAD_SIZE = 1.15 * 1024 * 1024; // 1.15MB
const LARGE_CHAT_MSG_NUM = 1400; // 1400 turns * ~1.15 MB per response = ~1.61GB

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
    let sharedGrowthResponsesPath: string;
    let sharedHistoryPath: string;
    let tempDir: string;

    beforeAll(async () => {
      tempDir = join(__dirname, `large-chat-tmp-${randomUUID()}`);
      mkdirSync(tempDir, { recursive: true });

      const { resumeResponsesPath, growthResponsesPath, historyPath } =
        await generateSharedLargeChatData(tempDir);
      sharedGrowthResponsesPath = growthResponsesPath;
      sharedResumeResponsesPath = resumeResponsesPath;
      sharedHistoryPath = historyPath;
    });

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
        fakeResponsesPath: sharedGrowthResponsesPath,
      });

      const result = await harness.runScenario(
        'large-chat',
        async (recordSnapshot) => {
          // Ensure the history file is linked
          const targetChatsDir = join(
            rig.testDir!,
            'tmp',
            'test-project-hash',
            'chats',
          );
          mkdirSync(targetChatsDir, { recursive: true });

          const prompts = Array.from(
            { length: LARGE_CHAT_MSG_NUM },
            (_, i) => `prompt ${i}`,
          );
          const stdinContent = prompts.join('\n');

          await rig.run({
            stdin: stdinContent,
            timeout: 600000, // 10 minutes
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
  const growthResponsesPath = join(tempDir, 'large-chat-growth-chat.responses');
  const historyPath = join(tempDir, 'large-chat-history.json');

  if (
    existsSync(resumeResponsesPath) &&
    existsSync(growthResponsesPath) &&
    existsSync(historyPath)
  ) {
    return { resumeResponsesPath, growthResponsesPath, historyPath };
  }

  const baseString = randomBytes(Math.ceil(MSG_PAYLOAD_SIZE * 0.75))
    .toString('base64')
    .slice(0, MSG_PAYLOAD_SIZE);

  const resumeResponsesStream = createWriteStream(resumeResponsesPath);
  const growthResponsesStream = createWriteStream(growthResponsesPath);
  const historyStream = createWriteStream(historyPath);

  historyStream.write(`{
  "sessionId": "large-chat-session",
  "projectHash": "test-project-hash",
  "startTime": "${new Date().toISOString()}",
  "lastUpdated": "${new Date().toISOString()}",
  "summary": "A very large chat session",
  "kind": "main",
  "messages": [\n`);

  for (let i = 0; i < LARGE_CHAT_MSG_NUM; i++) {
    const prompt = `prompt ${i}`;
    const response = `${baseString} - response ${i}`;

    historyStream.write(`    {
      "id": "msg-user-${i}",
      "role": "user",
      "parts": [{"text": "${prompt}"}],
      "timestamp": "${new Date().toISOString()}",
      "type": "user"
    },\n`);

    historyStream.write(`    {
      "id": "msg-model-${i}",
      "role": "model",
      "parts": [{"text": "${response}"}],
      "timestamp": "${new Date().toISOString()}",
      "type": "gemini"
    }${i === LARGE_CHAT_MSG_NUM - 1 ? '' : ','}\n`);

    growthResponsesStream.write(
      `{"method":"generateContent","response":{"candidates":[{"content":{"parts":[{"text":"{\\"complexity_reasoning\\":\\"simple\\",\\"complexity_score\\":1}"}],"role":"model"},"finishReason":"STOP","index":0}]}}\n`,
    );
    growthResponsesStream.write(
      `{"method":"generateContentStream","response":[{"candidates":[{"content":{"parts":[{"text":"${response}"}],"role":"model"},"finishReason":"STOP","index":0}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":10,"totalTokenCount":15,"promptTokensDetails":[{"modality":"TEXT","tokenCount":5}]}}]}\n`,
    );
    growthResponsesStream.write(
      `{"method":"generateContent","response":{"candidates":[{"content":{"parts":[{"text":"{\\"originalSummary\\":\\"large chat summary\\",\\"events\\":[]}"}],"role":"model"},"finishReason":"STOP","index":0}]}}\n`,
    );
  }

  historyStream.write(`  ]\n}\n`);

  // Generate a few short responses for the resume tests
  resumeResponsesStream.write(
    `{"method":"generateContent","response":{"candidates":[{"content":{"parts":[{"text":"{\\"complexity_reasoning\\":\\"simple\\",\\"complexity_score\\":1}"}],"role":"model"},"finishReason":"STOP","index":0}]}}\n`,
  );
  resumeResponsesStream.write(
    `{"method":"generateContentStream","response":[{"candidates":[{"content":{"parts":[{"text":"Hello!"}],"role":"model"},"finishReason":"STOP","index":0}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":10,"totalTokenCount":15,"promptTokensDetails":[{"modality":"TEXT","tokenCount":5}]}}]}\n`,
  );
  resumeResponsesStream.write(
    `{"method":"generateContent","response":{"candidates":[{"content":{"parts":[{"text":"{\\"originalSummary\\":\\"large chat summary\\",\\"events\\":[]}"}],"role":"model"},"finishReason":"STOP","index":0}]}}\n`,
  );

  resumeResponsesStream.end();
  growthResponsesStream.end();
  historyStream.end();

  // Wait for stream to finish writing
  await new Promise((resolve) => {
    let finished = 0;
    resumeResponsesStream.on('finish', () => {
      if (++finished === 3) resolve(null);
    });
    growthResponsesStream.on('finish', () => {
      if (++finished === 3) resolve(null);
    });
    historyStream.on('finish', () => {
      if (++finished === 3) resolve(null);
    });
  });

  return { resumeResponsesPath, growthResponsesPath, historyPath };
}
