/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { GeminiClient } from '../core/client.js';
import { Config } from '../config/config.js';
import { summarizeToolOutput } from './summarizer.js';
import type { ModelConfigService } from '../services/modelConfigService.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { debugLogger } from './debugLogger.js';

vi.mock('../core/client.js');
vi.mock('../config/config.js');

/**
 * Regression tests for dollar-sign prompt template corruption.
 *
 * String.prototype.replace() treats $-sequences in the replacement string
 * as special patterns (ECMA-262 §22.1.3.18, GetSubstitution):
 *   $&  → inserts the matched substring
 *   $'  → inserts the portion of the string after the match
 *   $`  → inserts the portion of the string before the match
 *   $$  → inserts a literal '$'
 *
 * These tests verify that tool outputs and file contents containing such
 * sequences are inserted literally into LLM prompt templates, without
 * triggering GetSubstitution expansion.
 */
describe('Prompt template $-pattern safety', () => {
  let mockGeminiClient: GeminiClient;
  let MockConfig: Mock;
  let mockConfigInstance: Config;
  const abortSignal = new AbortController().signal;

  beforeEach(() => {
    MockConfig = vi.mocked(Config);
    mockConfigInstance = new MockConfig(
      'test-api-key',
      'gemini-pro',
      false,
      '.',
      false,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
    );
    (mockConfigInstance.modelConfigService as unknown) = {
      getResolvedConfig: vi.fn().mockReturnValue({
        model: 'gemini-pro',
        generateContentConfig: {
          maxOutputTokens: 100, // Small value so all test strings trigger summarization
        },
      }),
    } as unknown as ModelConfigService;

    mockGeminiClient = new GeminiClient(mockConfigInstance);
    (mockGeminiClient.generateContent as Mock) = vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'summary' }] } }],
    });

    vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const DOLLAR_PATTERNS = [
    {
      name: '$& (matched substring)',
      input: 'The value is $& here',
    },
    {
      name: "$' (portion after match)",
      input: "echo $'\\n' is ANSI-C quoting",
    },
    {
      name: '$` (portion before match)',
      input: 'template literal: `${variable}`',
    },
    {
      name: '$$ (literal dollar collapse)',
      input: "jQuery $$('.selector') call",
    },
    {
      name: '$1 $2 (capture group refs)',
      input: 'regex replace($1, $2) result',
    },
    {
      name: 'mixed $ patterns',
      input: "if ($x === $') { return $$val + $`rest$&; }",
    },
  ];

  for (const { name, input } of DOLLAR_PATTERNS) {
    it(`summarizeToolOutput preserves ${name} in tool output`, async () => {
      // Input must be longer than maxOutputTokens (100) to trigger summarization
      const longInput = input.repeat(20);

      await summarizeToolOutput(
        mockConfigInstance,
        { model: DEFAULT_GEMINI_MODEL },
        longInput,
        mockGeminiClient,
        abortSignal,
      );

      // Verify the prompt sent to generateContent contains the literal input
      const calledWith = (mockGeminiClient.generateContent as Mock).mock
        .calls[0];
      const contents = calledWith[1];
      const promptText = contents[0].parts[0].text as string;

      expect(promptText).toContain(longInput);
    });
  }

  it("summarizeToolOutput does not duplicate template tail via $'", async () => {
    // This is the exact corruption scenario: $' causes the text after
    // {textToSummarize} to be injected into the replacement position
    const payload = "$' should not inject template tail".repeat(10);

    await summarizeToolOutput(
      mockConfigInstance,
      { model: DEFAULT_GEMINI_MODEL },
      payload,
      mockGeminiClient,
      abortSignal,
    );

    const calledWith = (mockGeminiClient.generateContent as Mock).mock.calls[0];
    const contents = calledWith[1];
    const promptText = contents[0].parts[0].text as string;

    // The footer "Return the summary string..." should appear exactly once
    const footerFragment = 'Return the summary string';
    const firstIdx = promptText.indexOf(footerFragment);
    const secondIdx = promptText.indexOf(footerFragment, firstIdx + 1);
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBe(-1);
  });

  it('summarizeToolOutput does not collapse $$ to single $', async () => {
    const payload = 'price: $$100 total: $$200'.repeat(10);

    await summarizeToolOutput(
      mockConfigInstance,
      { model: DEFAULT_GEMINI_MODEL },
      payload,
      mockGeminiClient,
      abortSignal,
    );

    const calledWith = (mockGeminiClient.generateContent as Mock).mock.calls[0];
    const contents = calledWith[1];
    const promptText = contents[0].parts[0].text as string;

    // $$ must remain as $$ — not be collapsed to $
    expect(promptText).toContain('$$100');
    expect(promptText).toContain('$$200');
  });
});
