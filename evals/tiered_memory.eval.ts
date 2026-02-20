/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest, assertModelHasOutput } from './test-helper.js';

describe('tiered_memory_eval', () => {
  const CRITICAL_HEX = '0xDEADBEEF';
  const LOG_NOISE = '...rest of the log noise...'.repeat(1000); // Create a large log
  const LOG_CONTENT = `[ERROR] Server crash at memory address ${CRITICAL_HEX}
${LOG_NOISE}`;

  // Mode A: Baseline (Simulated Destructive Compression)
  evalTest('USUALLY_PASSES', {
    name: 'Mode A: Baseline - Destructive compression fails to retrieve buried detail',
    prompt: 'Read the server logs, summarize them, and then I will ask you a question.',
    files: {
      'server.log': LOG_CONTENT,
    },
    params: {
      settings: {
        compressionThreshold: 1000, 
      }
    },
    promptSuffix: ' (Note: To save space, please summarize the logs in your memory and do NOT keep the raw log text in context.)',
    assert: async (rig, result) => {
      assertModelHasOutput(result);
      
      // Now ask the follow-up question in a second turn
      const followUp = await rig.sendMessage('What was the exact hex memory address from the crash log?');
      
      const content = followUp.getResponseText();
      expect(content).not.toContain(CRITICAL_HEX);
    },
  });

  // Mode B: Tiered Memory (Stash and Retrieve)
  evalTest('USUALLY_PASSES', {
    name: 'Mode B: Tiered Memory - Successfully retrieves buried detail using stash and query',
    prompt: 'Read the server logs. Use stash_context to save the raw logs under the key "crash_logs" with a summary, and then I will ask you a question.',
    files: {
      'server.log': LOG_CONTENT,
    },
    assert: async (rig, result) => {
      // Wait for stash_context to be called
      const stashed = await rig.waitForToolCall('stash_context');
      expect(stashed, 'Expected stash_context to be called').toBe(true);
      
      assertModelHasOutput(result);

      // Now ask the follow-up question
      const followUp = await rig.sendMessage('What was the exact hex memory address from the crash log?');
      
      // The agent should realize it needs to query the archive
      const queried = await rig.waitForToolCall('query_archive');
      expect(queried, 'Expected query_archive to be called').toBe(true);

      const content = followUp.getResponseText();
      expect(content).toContain(CRITICAL_HEX);
    },
  });

  // Phase 1: The "Marathon" Eval (Token Cost & Scalability)
  describe('Marathon Eval', () => {
    const generateLargeLog = (index: number) => `[LOG ${index}] Initializing... ${'NOISE '.repeat(2000)} [LOG ${index}] Finished.`;
    const files = {
      'log_1.txt': generateLargeLog(1),
      'log_2.txt': generateLargeLog(2),
      'log_3.txt': generateLargeLog(3),
      'log_4.txt': generateLargeLog(4),
      'log_5.txt': generateLargeLog(5),
    };

    evalTest('USUALLY_PASSES', {
      name: 'Mode A: Marathon - Baseline accumulates tokens',
      prompt: 'Read log_1.txt through log_5.txt one by one. After reading all, tell me you are done.',
      files,
      assert: async (rig) => {
        // Wait for all 5 logs to be read
        for (let i = 1; i <= 5; i++) {
          await rig.waitForToolCall('read_file');
        }
        
        const history = rig.getChatHistory();
        // Calculate approximate token count from history
        const totalText = JSON.stringify(history);
        const approxTokens = totalText.length / 4; 
        
        console.log(`Mode A Marathon Tokens: ~${approxTokens}`);
        expect(approxTokens).toBeGreaterThan(10000); 
      },
    });

    evalTest('USUALLY_PASSES', {
      name: 'Mode B: Marathon - Tiered Memory keeps context small',
      prompt: 'Read log_1.txt through log_5.txt one by one. After each read, use stash_context to archive the log. After reading all, tell me you are done.',
      files,
      assert: async (rig) => {
        for (let i = 1; i <= 5; i++) {
          await rig.waitForToolCall('read_file');
          await rig.waitForToolCall('stash_context');
        }

        const history = rig.getChatHistory();
        const totalText = JSON.stringify(history);
        const approxTokens = totalText.length / 4;

        console.log(`Mode B Marathon Tokens: ~${approxTokens}`);
        // History should be much smaller because each 10k log was replaced by a summary
        expect(approxTokens).toBeLessThan(5000);
      },
    });
  });

  // Phase 2: The "Reasoning Focus" Eval (Preventing 'Lost in the Middle')
  describe('Reasoning Focus Eval', () => {
    const NOISY_CONTENT = `[SYSTEM_START] ${'REDUNDANT_CODE_BLOCK_'.repeat(5000)} [ERROR_CODE: E-999] [SYSTEM_END]`;
    const prompt = 'Step 1: Read noisy_file.txt. Step 2: Extract the error code. Step 3: MUST write the word "BANANA" at the very end of your final answer.';

    evalTest('USUALLY_PASSES', {
      name: 'Mode A: Reasoning Focus - Baseline fails focus',
      prompt: prompt + ' (Note: Keep all log output in your active context.)',
      files: { 'noisy_file.txt': NOISY_CONTENT },
      assert: async (rig, result) => {
        const response = result.toLowerCase();
        // Due to 40k tokens of noise, it's likely to forget the "BANANA" instruction
        expect(response).not.toContain('banana');
      },
    });

    evalTest('USUALLY_PASSES', {
      name: 'Mode B: Reasoning Focus - Tiered Memory maintains focus',
      prompt: prompt + ' (Note: Use stash_context to keep your active context clean of the noisy logs.)',
      files: { 'noisy_file.txt': NOISY_CONTENT },
      assert: async (rig, result) => {
        await rig.waitForToolCall('stash_context');
        const response = result.toUpperCase();
        expect(response).toContain('BANANA');
        expect(response).toContain('E-999');
      },
    });
  });
});
