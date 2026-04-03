/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import { GeminiChat } from '../packages/core/src/core/geminiChat.js';
import { Config } from '../packages/core/src/config/config.js';
import { ToolRegistry } from '../packages/core/src/tools/tool-registry.js';
import { MessageBus } from '../packages/core/src/confirmation-bus/message-bus.js';
import { PromptRegistry } from '../packages/core/src/prompts/prompt-registry.js';
import { ResourceRegistry } from '../packages/core/src/resources/resource-registry.js';
import { NoopSandboxManager } from '../packages/core/src/services/sandboxManager.js';
import type { AgentLoopContext } from '../packages/core/src/config/agent-loop-context.js';

// Helper to force GC if run with --expose-gc
const runGC = () => {
  if (global.gc) {
    global.gc();
  }
};

const printMemory = (turn: number) => {
  runGC();
  const usage = process.memoryUsage();
  console.log(
    `Turn ${turn} - RSS: ${(usage.rss / 1024 / 1024).toFixed(2)} MB, ` +
      `HeapUsed: ${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB, ` +
      `External: ${(usage.external / 1024 / 1024).toFixed(2)} MB`,
  );
};

async function runReproduction() {
  console.log(
    'Starting memory growth reproduction (ChatRecordingService focus)...',
  );

  const config = new Config({
    sessionId: 'reproduction-session',
    targetDir: process.cwd(),
    cwd: process.cwd(),
    debugMode: false,
    model: 'gemini-2.0-flash',
  });
  await config.initialize();

  const context: AgentLoopContext = {
    config,
    promptId: 'reproduction-session',
    toolRegistry: new ToolRegistry(config),
    promptRegistry: new PromptRegistry(),
    resourceRegistry: new ResourceRegistry(),
    messageBus: new MessageBus(),
    sandboxManager: new NoopSandboxManager(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    geminiClient: null as any,
  };

  const chat = new GeminiChat(context);

  for (let i = 1; i <= 200; i++) {
    const LARGE_STRING = crypto.randomBytes(512 * 1024).toString('hex'); // 1MB string
    // 1. User message
    chat.addHistory({
      role: 'user',
      parts: [{ text: `Turn ${i}: Get the large data.` }],
    });

    // 2. Model message with tool call
    chat.addHistory({
      role: 'model',
      parts: [
        {
          functionCall: {
            name: 'get_large_data',
            args: {},
          },
        },
      ],
    });

    // 3. User message with tool response (LARGE)
    chat.addHistory({
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: 'get_large_data',
            response: { output: LARGE_STRING },
          },
        },
      ],
    });

    // 4. Model message with final text
    chat.addHistory({
      role: 'model',
      parts: [{ text: 'I have processed the large data.' }],
    });

    // Trigger ChatRecordingService update (as GeminiClient does)
    await chat
      .getChatRecordingService()
      ?.updateMessagesFromHistory(chat.getHistory());

    if (i % 20 === 0) {
      const history = chat.getHistory();
      console.log(`Turn ${i}: History size: ${history.length}`);
      printMemory(i);
    }
  }

  console.log('Reproduction complete.');
}

runReproduction().catch(console.error);
