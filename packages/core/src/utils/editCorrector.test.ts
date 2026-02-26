/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Mock, Mocked } from 'vitest';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { EDIT_TOOL_NAME } from '../tools/tool-names.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';

// MOCKS
let callCount = 0;
const mockResponses: any[] = [];

let mockGenerateJson: any;
let mockStartChat: any;
let mockSendMessageStream: any;

vi.mock('fs', () => ({
  statSync: vi.fn(),
  mkdirSync: vi.fn(),
  createWriteStream: vi.fn(() => ({
    write: vi.fn(),
    on: vi.fn(),
  })),
}));

vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(function (
    this: any,
    _config: Config,
  ) {
    this.startChat = (...params: any[]) => mockStartChat(...params);
    this.sendMessageStream = (...params: any[]) =>
      mockSendMessageStream(...params);
    return this;
  }),
}));
// END MOCKS

import {
  countOccurrences,
  ensureCorrectEdit,
  ensureCorrectFileContent,
  unescapeStringForGeminiBug,
  resetEditCorrectorCaches_TEST_ONLY,
} from './editCorrector.js';
import { GeminiClient } from '../core/client.js';
import type { Config } from '../config/config.js';
import { ToolRegistry } from '../tools/tool-registry.js';

vi.mock('../tools/tool-registry.js');

describe('editCorrector', () => {
  describe('countOccurrences', () => {
    it('should return 0 for empty string', () => {
      expect(countOccurrences('', 'a')).toBe(0);
    });
    it('should return 0 for empty substring', () => {
      expect(countOccurrences('abc', '')).toBe(0);
    });
    it('should return 0 if substring is not found', () => {
      expect(countOccurrences('abc', 'd')).toBe(0);
    });
    it('should return 1 if substring is found once', () => {
      expect(countOccurrences('abc', 'b')).toBe(1);
    });
    it('should return correct count for multiple occurrences', () => {
      expect(countOccurrences('ababa', 'a')).toBe(3);
      expect(countOccurrences('ababab', 'ab')).toBe(3);
    });
    it('should count non-overlapping occurrences', () => {
      expect(countOccurrences('aaaaa', 'aa')).toBe(2);
      expect(countOccurrences('ababab', 'aba')).toBe(1);
    });
    it('should correctly count occurrences when substring is longer', () => {
      expect(countOccurrences('abc', 'abcdef')).toBe(0);
    });
    it('should be case-sensitive', () => {
      expect(countOccurrences('abcABC', 'a')).toBe(1);
      expect(countOccurrences('abcABC', 'A')).toBe(1);
    });
  });

  describe('unescapeStringForGeminiBug', () => {
    // This function undoes exactly one level of JSON-style backslash escaping.
    // It is format-agnostic — it does NOT try to infer the target file format.
    // Callers are responsible for checking whether unescaping is appropriate
    // (e.g., by validating old_string against file content).

    it('should unescape common single-backslash sequences', () => {
      expect(unescapeStringForGeminiBug('\\n')).toBe('\n');
      expect(unescapeStringForGeminiBug('\\t')).toBe('\t');
      expect(unescapeStringForGeminiBug('\\r')).toBe('\r');
      expect(unescapeStringForGeminiBug("\\'")).toBe("'");
      expect(unescapeStringForGeminiBug('\\"')).toBe('"');
      expect(unescapeStringForGeminiBug('\\`')).toBe('`');
    });
    it('should handle multiple escaped sequences in one string', () => {
      expect(unescapeStringForGeminiBug('Hello\\nWorld\\tTest')).toBe(
        'Hello\nWorld\tTest',
      );
    });
    it('should not alter strings that are already correct', () => {
      expect(unescapeStringForGeminiBug('\n')).toBe('\n');
      expect(unescapeStringForGeminiBug('Correct string')).toBe(
        'Correct string',
      );
    });
    it('should handle mixed actual and escaped sequences', () => {
      expect(unescapeStringForGeminiBug('\\nCorrect\t\\`')).toBe(
        '\nCorrect\t`',
      );
    });
    it('should handle backslash followed by actual newline character', () => {
      expect(unescapeStringForGeminiBug('\\\n')).toBe('\n');
      expect(unescapeStringForGeminiBug('First line\\\nSecond line')).toBe(
        'First line\nSecond line',
      );
    });

    // ---- Single-backslash matching (\\+ → \\ fix) ----
    // The function matches exactly ONE backslash per replacement. This prevents
    // collapsing multi-backslash sequences that represent legitimately nested
    // escaping levels.
    it('should only consume one backslash level (not greedy \\\\+)', () => {
      // \\n (JS: \, \, n) → first \\ matches the \\-alternative → \
      //   remaining n has no preceding backslash → stays as n
      //   Result: \n (literal backslash + n)
      expect(unescapeStringForGeminiBug('\\\\n')).toBe('\\n');

      // \\\t (JS: \, \, \, t) → \\(pos 0-1) → \, then \t(pos 2-3) → tab
      expect(unescapeStringForGeminiBug('\\\\\\t')).toBe('\\\t');

      // \\\\` (JS: \, \, \, \, `) → \\(pos 0-1) → \, \\(pos 2-3) → \, ` stays
      expect(unescapeStringForGeminiBug('\\\\\\\\`')).toBe('\\\\`');
    });

    it('should return empty string for empty input', () => {
      expect(unescapeStringForGeminiBug('')).toBe('');
    });
    it('should not alter strings with no targeted escape sequences', () => {
      expect(unescapeStringForGeminiBug('abc def')).toBe('abc def');
      // \F is not in the capture group → no match
      expect(unescapeStringForGeminiBug('C:\\Folder\\File')).toBe(
        'C:\\Folder\\File',
      );
    });

    // The function is a raw unescaper — it does NOT try to be context-aware.
    // \n in \name is unescaped just like any other \n. The CALLERS are
    // responsible for deciding when this is appropriate.
    it('should unescape \\n even when followed by lowercase letters (format-agnostic)', () => {
      // This IS what "undo one level of JSON escaping" does — it converts
      // \n → newline regardless of what follows. The caller (ensureCorrectEdit
      // / ensureCorrectFileContent) decides whether to apply the result.
      expect(unescapeStringForGeminiBug('C:\\Users\\name')).toBe(
        'C:\\Users\name',
      );
      // \title → tab + itle (the function is format-agnostic)
      expect(unescapeStringForGeminiBug('\\title{Hello}')).toBe(
        '\title{Hello}',
      );
      // \newline → newline + ewline
      expect(unescapeStringForGeminiBug('\\newline')).toBe('\newline');
    });

    it('should handle escaped backslashes (double-backslash → single)', () => {
      expect(unescapeStringForGeminiBug('\\\\')).toBe('\\');
      expect(unescapeStringForGeminiBug('C:\\\\Users')).toBe('C:\\Users');
      // path\\to\\file → each \\ becomes \
      expect(unescapeStringForGeminiBug('path\\\\to\\\\file')).toBe(
        'path\\to\\file',
      );
    });

    it('should handle double-backslash adjacent to escapable chars (single-level only)', () => {
      // \\<actual newline> → \\ becomes \, actual newline stays
      expect(unescapeStringForGeminiBug('line1\\\\\nline2')).toBe(
        'line1\\\nline2',
      );
      // \\n (JS: \, \, n) → \\ becomes \, then n is just n → \n literal
      expect(unescapeStringForGeminiBug('line1\\\\nline2')).toBe(
        'line1\\nline2',
      );
      // \\"text → \\ becomes \, " is just a char, text is text
      // \\n → \\ becomes \, n just n
      expect(unescapeStringForGeminiBug('quote\\\\"text\\\\nline')).toBe(
        'quote\\"text\\nline',
      );
    });

    it('should correctly handle uniformly over-escaped content (the Gemini bug)', () => {
      // Simulates: model intended "line1\nline2" (with newline) but over-escaped
      // so JSON had \\n → JS received literal \n.
      const overEscaped = 'function foo() {\\n  return 1;\\n}';
      const expected = 'function foo() {\n  return 1;\n}';
      expect(unescapeStringForGeminiBug(overEscaped)).toBe(expected);
    });

    it('should correctly handle over-escaped content with backslash commands', () => {
      // When the LLM over-escapes a LaTeX file, every backslash is doubled:
      // \title → \\title, \n (newline) → \n (literal)
      // After unescapeStringForGeminiBug:
      //   \\title → \title (correct — \\ reduced to \, 'title' untouched)
      //   \n → newline (correct — over-escaped newline restored)
      const overEscapedLatex =
        '\\\\title{Hello}\\n\\\\textbf{bold}\\n\\\\newline';
      const expected = '\\title{Hello}\n\\textbf{bold}\n\\newline';
      expect(unescapeStringForGeminiBug(overEscapedLatex)).toBe(expected);
    });
  });

  describe('ensureCorrectEdit', () => {
    let mockGeminiClientInstance: Mocked<GeminiClient>;
    let mockBaseLlmClientInstance: Mocked<BaseLlmClient>;
    let mockToolRegistry: Mocked<ToolRegistry>;
    let mockConfigInstance: Config;
    const abortSignal = new AbortController().signal;

    beforeEach(() => {
      mockToolRegistry = new ToolRegistry(
        {} as Config,
        {} as any,
      ) as Mocked<ToolRegistry>;
      const configParams = {
        apiKey: 'test-api-key',
        model: 'test-model',
        sandbox: false as boolean | string,
        targetDir: '/test',
        debugMode: false,
        question: undefined as string | undefined,

        coreTools: undefined as string[] | undefined,
        toolDiscoveryCommand: undefined as string | undefined,
        toolCallCommand: undefined as string | undefined,
        mcpServerCommand: undefined as string | undefined,
        mcpServers: undefined as Record<string, any> | undefined,
        userAgent: 'test-agent',
        userMemory: '',
        geminiMdFileCount: 0,
        alwaysSkipModificationConfirmation: false,
      };
      mockConfigInstance = {
        ...configParams,
        getApiKey: vi.fn(() => configParams.apiKey),
        getModel: vi.fn(() => configParams.model),
        getSandbox: vi.fn(() => configParams.sandbox),
        getTargetDir: vi.fn(() => configParams.targetDir),
        getToolRegistry: vi.fn(() => mockToolRegistry),
        getDebugMode: vi.fn(() => configParams.debugMode),
        getQuestion: vi.fn(() => configParams.question),

        getCoreTools: vi.fn(() => configParams.coreTools),
        getToolDiscoveryCommand: vi.fn(() => configParams.toolDiscoveryCommand),
        getToolCallCommand: vi.fn(() => configParams.toolCallCommand),
        getMcpServerCommand: vi.fn(() => configParams.mcpServerCommand),
        getMcpServers: vi.fn(() => configParams.mcpServers),
        getUserAgent: vi.fn(() => configParams.userAgent),
        getUserMemory: vi.fn(() => configParams.userMemory),
        setUserMemory: vi.fn((mem: string) => {
          configParams.userMemory = mem;
        }),
        getGeminiMdFileCount: vi.fn(() => configParams.geminiMdFileCount),
        setGeminiMdFileCount: vi.fn((count: number) => {
          configParams.geminiMdFileCount = count;
        }),
        getAlwaysSkipModificationConfirmation: vi.fn(
          () => configParams.alwaysSkipModificationConfirmation,
        ),
        setAlwaysSkipModificationConfirmation: vi.fn((skip: boolean) => {
          configParams.alwaysSkipModificationConfirmation = skip;
        }),
        getQuotaErrorOccurred: vi.fn().mockReturnValue(false),
        setQuotaErrorOccurred: vi.fn(),
      } as unknown as Config;

      callCount = 0;
      mockResponses.length = 0;
      mockGenerateJson = vi
        .fn()
        .mockImplementation((_contents, _schema, signal) => {
          // Check if the signal is aborted. If so, throw an error or return a specific response.
          if (signal && signal.aborted) {
            return Promise.reject(new Error('Aborted')); // Or some other specific error/response
          }
          const response = mockResponses[callCount];
          callCount++;
          if (response === undefined) return Promise.resolve({});
          return Promise.resolve(response);
        });
      mockStartChat = vi.fn();
      mockSendMessageStream = vi.fn();

      mockGeminiClientInstance = new GeminiClient(
        mockConfigInstance,
      ) as Mocked<GeminiClient>;
      mockGeminiClientInstance.getHistory = vi.fn().mockReturnValue([]);
      mockBaseLlmClientInstance = {
        generateJson: mockGenerateJson,
        config: {
          generationConfigService: {
            getResolvedConfig: vi.fn().mockReturnValue({
              model: 'edit-corrector',
              generateContentConfig: {},
            }),
          },
        },
      } as unknown as Mocked<BaseLlmClient>;
      resetEditCorrectorCaches_TEST_ONLY();
    });

    describe('Scenario Group 1: originalParams.old_string matches currentContent directly', () => {
      it('Test 1.1: old_string (no literal \\), new_string (escaped by Gemini) -> new_string unchanged (no over-escaping evidence)', async () => {
        // old_string matches directly — no evidence of over-escaping.
        // new_string is left as-is (no LLM call).
        const currentContent = 'This is a test string to find me.';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'find me',
          new_string: 'replace with \\"this\\"',
        };
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          mockBaseLlmClientInstance,
          abortSignal,
          false,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(0);
        expect(result.params.new_string).toBe('replace with \\"this\\"');
        expect(result.params.old_string).toBe('find me');
        expect(result.occurrences).toBe(1);
      });
      it('Test 1.2: old_string (no literal \\), new_string (correctly formatted) -> new_string unchanged', async () => {
        const currentContent = 'This is a test string to find me.';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'find me',
          new_string: 'replace with this',
        };
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          mockBaseLlmClientInstance,
          abortSignal,
          false,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(0);
        expect(result.params.new_string).toBe('replace with this');
        expect(result.params.old_string).toBe('find me');
        expect(result.occurrences).toBe(1);
      });
      it('Test 1.3: old_string (with literal \\), new_string (escaped by Gemini) -> new_string unchanged (no over-escaping evidence)', async () => {
        // old_string matches directly — no evidence of over-escaping.
        // new_string is left as-is (no LLM call).
        const currentContent = 'This is a test string to find\\me.';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'find\\me',
          new_string: 'replace with \\"this\\"',
        };
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          mockBaseLlmClientInstance,
          abortSignal,
          false,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(0);
        expect(result.params.new_string).toBe('replace with \\"this\\"');
        expect(result.params.old_string).toBe('find\\me');
        expect(result.occurrences).toBe(1);
      });
      it('Test 1.4: old_string (with literal \\), new_string (correctly formatted) -> new_string unchanged', async () => {
        const currentContent = 'This is a test string to find\\me.';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'find\\me',
          new_string: 'replace with this',
        };
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          mockBaseLlmClientInstance,
          abortSignal,
          false,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(0);
        expect(result.params.new_string).toBe('replace with this');
        expect(result.params.old_string).toBe('find\\me');
        expect(result.occurrences).toBe(1);
      });
    });

    describe('Scenario Group 2: originalParams.old_string does NOT match, but unescapeStringForGeminiBug(originalParams.old_string) DOES match', () => {
      it('Test 2.1: old_string (over-escaped, no intended literal \\), new_string (escaped by Gemini) -> new_string unescaped', async () => {
        const currentContent = 'This is a test string to find "me".';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'find \\"me\\"',
          new_string: 'replace with \\"this\\"',
        };
        mockResponses.push({ corrected_new_string: 'replace with "this"' });
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          mockBaseLlmClientInstance,
          abortSignal,
          false,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(1);
        expect(result.params.new_string).toBe('replace with "this"');
        expect(result.params.old_string).toBe('find "me"');
        expect(result.occurrences).toBe(1);
      });
      it('Test 2.2: old_string (over-escaped, no intended literal \\), new_string (correctly formatted) -> new_string adjusted by LLM', async () => {
        // old_string needed unescaping → over-escaping confirmed → LLM is
        // asked to adjust new_string (even though it's already correct).
        // correctNewString sees original≠corrected old_string, calls LLM.
        // LLM returns empty → correctNewString returns original new_string.
        const currentContent = 'This is a test string to find "me".';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'find \\"me\\"',
          new_string: 'replace with this',
        };
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          mockBaseLlmClientInstance,
          abortSignal,
          false,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(1);
        expect(result.params.new_string).toBe('replace with this');
        expect(result.params.old_string).toBe('find "me"');
        expect(result.occurrences).toBe(1);
      });
      it('Test 2.3: old_string (over-escaped, with intended literal \\), new_string (simple) -> LLM adjusts new_string', async () => {
        // old_string needed unescaping → over-escaping confirmed → LLM is
        // asked to adjust new_string. LLM returns empty → original returned.
        const currentContent = 'This is a test string to find \\me.';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'find \\\\me',
          new_string: 'replace with foobar',
        };
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          mockBaseLlmClientInstance,
          abortSignal,
          false,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(1);
        expect(result.params.new_string).toBe('replace with foobar');
        expect(result.params.old_string).toBe('find \\me');
        expect(result.occurrences).toBe(1);
      });
    });

    describe('Scenario Group 3: LLM Correction Path', () => {
      it('Test 3.1: old_string matches directly -> no LLM correction, new_string unchanged', async () => {
        // old_string matches directly — no evidence of over-escaping.
        // new_string is left as-is regardless of its content.
        const currentContent = 'This is a test string to corrected find me.';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'find me',
          new_string: 'replace with \\\\"this\\\\"',
        };
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          mockBaseLlmClientInstance,
          abortSignal,
          false,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(0);
        expect(result.params.new_string).toBe('replace with \\\\"this\\\\"');
        expect(result.params.old_string).toBe('find me');
        expect(result.occurrences).toBe(1);
      });
      it('Test 3.2: old_string (with literal \\), new_string (escaped by Gemini), LLM re-escapes new_string -> final new_string is unescaped once', async () => {
        const currentContent = 'This is a test string to corrected find me.';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'find\\me',
          new_string: 'replace with \\\\"this\\\\"',
        };
        const llmCorrectedOldString = 'corrected find me';
        const llmNewString = 'LLM says replace with "that"';
        mockResponses.push({ corrected_target_snippet: llmCorrectedOldString });
        mockResponses.push({ corrected_new_string: llmNewString });
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          mockBaseLlmClientInstance,
          abortSignal,
          false,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(2);
        expect(result.params.new_string).toBe(llmNewString);
        expect(result.params.old_string).toBe(llmCorrectedOldString);
        expect(result.occurrences).toBe(1);
      });
      it('Test 3.3: old_string needs LLM, new_string also sent to LLM -> both corrected', async () => {
        // old_string needed LLM correction → new_string is also sent to LLM
        // for adjustment. LLM returns empty for new_string → original returned.
        const currentContent = 'This is a test string to be corrected.';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'fiiind me',
          new_string: 'replace with "this"',
        };
        const llmCorrectedOldString = 'to be corrected';
        mockResponses.push({ corrected_target_snippet: llmCorrectedOldString });
        // Second LLM call (correctNewString) gets no mock → returns original
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          mockBaseLlmClientInstance,
          abortSignal,
          false,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(2);
        expect(result.params.new_string).toBe('replace with "this"');
        expect(result.params.old_string).toBe(llmCorrectedOldString);
        expect(result.occurrences).toBe(1);
      });
      it('Test 3.4: old_string matches directly -> no LLM correction, new_string unchanged', async () => {
        // old_string matches directly — no evidence of over-escaping.
        // new_string is left as-is regardless of its content.
        const currentContent = 'This is a test string to corrected find me.';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'find me',
          new_string: 'replace with \\\\"this\\\\"',
        };
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          mockBaseLlmClientInstance,
          abortSignal,
          false,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(0);
        expect(result.params.new_string).toBe('replace with \\\\"this\\\\"');
        expect(result.occurrences).toBe(1);
      });
    });

    describe('Scenario Group 4: No Match Found / Multiple Matches', () => {
      it('Test 4.1: No version of old_string (original, unescaped, LLM-corrected) matches -> returns original params, 0 occurrences', async () => {
        const currentContent = 'This content has nothing to find.';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'nonexistent string',
          new_string: 'some new string',
        };
        mockResponses.push({ corrected_target_snippet: 'still nonexistent' });
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          mockBaseLlmClientInstance,
          abortSignal,
          false,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(1);
        expect(result.params).toEqual(originalParams);
        expect(result.occurrences).toBe(0);
      });
      it('Test 4.2: unescapedOldStringAttempt results in >1 occurrences -> returns original params, count occurrences', async () => {
        const currentContent =
          'This content has find "me" and also find "me" again.';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'find "me"',
          new_string: 'some new string',
        };
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          mockBaseLlmClientInstance,
          abortSignal,
          false,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(0);
        expect(result.params).toEqual(originalParams);
        expect(result.occurrences).toBe(2);
      });
    });

    describe('Scenario Group 5: Specific unescapeStringForGeminiBug checks (integrated into ensureCorrectEdit)', () => {
      it('Test 5.1: old_string matches via unescaping, new_string needs LLM correction', async () => {
        // With single-backslash matching (\\), unescapeStringForGeminiBug now
        // correctly converts old_string to match currentContent without LLM.
        // Only new_string correction needs LLM.
        const currentContent = 'const x = "a\nbc\\"def\\"';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'const x = \\"a\\nbc\\\\"def\\\\"',
          new_string: 'const y = \\"new\\nval\\\\"content\\\\"',
        };
        const expectedFinalNewString = 'const y = "new\nval\\"content\\"';
        // Only one LLM call needed: correctNewString (old_string matched via unescaping)
        mockResponses.push({ corrected_new_string: expectedFinalNewString });
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          mockBaseLlmClientInstance,
          abortSignal,
          false,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(1);
        expect(result.params.old_string).toBe(currentContent);
        expect(result.params.new_string).toBe(expectedFinalNewString);
        expect(result.occurrences).toBe(1);
      });
    });

    describe('Scenario Group 6: Concurrent Edits', () => {
      it('Test 6.1: should return early if file was modified by another process', async () => {
        const filePath = '/test/file.txt';
        const currentContent =
          'This content has been modified by someone else.';
        const originalParams = {
          file_path: filePath,
          old_string: 'nonexistent string',
          new_string: 'some new string',
        };

        const now = Date.now();
        const lastEditTime = now - 5000; // 5 seconds ago

        // Mock the file's modification time to be recent
        vi.spyOn(fs, 'statSync').mockReturnValue({
          mtimeMs: now,
        } as fs.Stats);

        // Mock the last edit timestamp from our history to be in the past
        const history = [
          {
            role: 'model',
            parts: [
              {
                functionResponse: {
                  name: EDIT_TOOL_NAME,
                  id: `${EDIT_TOOL_NAME}-${lastEditTime}-123`,
                  response: {
                    output: {
                      llmContent: `Successfully modified file: ${filePath}`,
                    },
                  },
                },
              },
            ],
          },
        ];
        (mockGeminiClientInstance.getHistory as Mock).mockReturnValue(history);

        const result = await ensureCorrectEdit(
          filePath,
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          mockBaseLlmClientInstance,
          abortSignal,
          false,
        );

        expect(result.occurrences).toBe(0);
        expect(result.params).toEqual(originalParams);
      });
    });

    describe('Scenario Group 7: Trimming with Newline Preservation', () => {
      it('Test 7.1: should preserve trailing newlines in new_string when trimming is applied', async () => {
        const currentContent = '  find me'; // Matches old_string initially
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: '  find me', // Matches, but has whitespace to trim
          new_string: '  replaced\n\n', // Needs trimming but preserve newlines
        };

        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          mockBaseLlmClientInstance,
          abortSignal,
          false,
        );

        // old_string should be trimmed to 'find me' because 'find me' also exists uniquely in '  find me'
        expect(result.params.old_string).toBe('find me');
        // new_string should be trimmed of spaces but keep ALL newlines
        expect(result.params.new_string).toBe('replaced\n\n');
        expect(result.occurrences).toBe(1);
      });

      it('Test 7.2: should handle trailing newlines separated by spaces (regression fix)', async () => {
        const currentContent = 'find me '; // Matches old_string initially
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'find me ', // Trailing space
          new_string: 'replaced \n \n', // Trailing newlines with spaces
        };

        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          mockBaseLlmClientInstance,
          abortSignal,
          false,
        );

        expect(result.params.old_string).toBe('find me');
        // Should capture both newlines and join them, stripping the space between
        expect(result.params.new_string).toBe('replaced\n\n');
        expect(result.occurrences).toBe(1);
      });
    });
  });

  describe('ensureCorrectFileContent', () => {
    let mockBaseLlmClientInstance: Mocked<BaseLlmClient>;
    const abortSignal = new AbortController().signal;

    beforeEach(() => {
      callCount = 0;
      mockResponses.length = 0;
      mockGenerateJson = vi
        .fn()
        .mockImplementation((_contents, _schema, signal) => {
          if (signal && signal.aborted) {
            return Promise.reject(new Error('Aborted'));
          }
          const response = mockResponses[callCount];
          callCount++;
          if (response === undefined) return Promise.resolve({});
          return Promise.resolve(response);
        });

      mockBaseLlmClientInstance = {
        generateJson: mockGenerateJson,
        config: {
          generationConfigService: {
            getResolvedConfig: vi.fn().mockReturnValue({
              model: 'edit-corrector',
              generateContentConfig: {},
            }),
          },
        },
      } as unknown as Mocked<BaseLlmClient>;
      resetEditCorrectorCaches_TEST_ONLY();
    });

    // Detection uses unescapeStringForGeminiBug as a cheap probe: if unescaping
    // would change the content, the LLM is asked to decide. When LLM is
    // disabled, content is returned unchanged (no ground truth to validate).

    it('should return content unchanged if no escaping signal detected', async () => {
      const content = 'This is normal content without escaping issues';
      const result = await ensureCorrectFileContent(
        content,
        mockBaseLlmClientInstance,
        abortSignal,
        false,
      );
      expect(result).toBe(content);
      expect(mockGenerateJson).toHaveBeenCalledTimes(0);
    });

    it('should call LLM when content has \\" (unescaping probe detects change)', async () => {
      // Content has \" which unescapeStringForGeminiBug would change → LLM
      // is asked to decide. LLM returns empty → original content returned.
      const content = 'console.log(\\"Hello World\\");';
      const result = await ensureCorrectFileContent(
        content,
        mockBaseLlmClientInstance,
        abortSignal,
        false,
      );
      expect(result).toBe(content);
      expect(mockGenerateJson).toHaveBeenCalledTimes(1);
    });

    it('should call LLM when content has \\n (unescaping probe detects change)', async () => {
      const content = 'const message = \\"Hello\\nWorld\\";';
      const correctedContent = 'const message = "Hello\nWorld";';
      mockResponses.push({
        corrected_string_escaping: correctedContent,
      });

      const result = await ensureCorrectFileContent(
        content,
        mockBaseLlmClientInstance,
        abortSignal,
        false,
      );

      expect(result).toBe(correctedContent);
      expect(mockGenerateJson).toHaveBeenCalledTimes(1);
    });

    it('should return original content if LLM correction fails', async () => {
      // This content triggers detection (has \n, no actual newlines)
      const content = 'console.log(\\"Hello\\nWorld\\");';
      mockResponses.push({});

      const result = await ensureCorrectFileContent(
        content,
        mockBaseLlmClientInstance,
        abortSignal,
        false,
      );

      expect(result).toBe(content);
      expect(mockGenerateJson).toHaveBeenCalledTimes(1);
    });

    it('should handle various escape sequences when \\n signal is present', async () => {
      const content =
        'const obj = { name: \\"John\\", age: 30, bio: \\"Developer\\nEngineer\\" };';
      const correctedContent =
        'const obj = { name: "John", age: 30, bio: "Developer\nEngineer" };';

      mockResponses.push({
        corrected_string_escaping: correctedContent,
      });

      const result = await ensureCorrectFileContent(
        content,
        mockBaseLlmClientInstance,
        abortSignal,
        false,
      );

      expect(result).toBe(correctedContent);
    });

    it('should call LLM for LaTeX content (probe detects \\t in \\title), LLM returns unchanged', async () => {
      // LaTeX content has \t in \title and \n in \newline which the unescaping
      // probe detects. LLM is asked to decide — it correctly identifies the
      // content as LaTeX and returns it unchanged.
      const content = '\\title{Hello}\n\\textbf{bold}\n\\newline';
      mockResponses.push({
        corrected_string_escaping: content,
      });
      const result = await ensureCorrectFileContent(
        content,
        mockBaseLlmClientInstance,
        abortSignal,
        false,
      );
      expect(result).toBe(content);
      expect(mockGenerateJson).toHaveBeenCalledTimes(1);
    });

    it('should return content unchanged when LLM is disabled (no ground truth)', async () => {
      // Over-escaped content, but LLM is disabled and there is no ground truth
      // (no file content to compare against). Return as-is rather than risk
      // silent corruption.
      const content = 'function foo() {\\n  return 1;\\n}';
      const result = await ensureCorrectFileContent(
        content,
        mockBaseLlmClientInstance,
        abortSignal,
        true, // LLM disabled
      );
      expect(result).toBe(content);
      expect(mockGenerateJson).toHaveBeenCalledTimes(0);
    });

    it('should return LaTeX content unchanged when LLM is disabled', async () => {
      // LLM disabled — content returned as-is regardless of escape sequences.
      const content = '\\title{Hello}\n\\textbf{bold}';
      const result = await ensureCorrectFileContent(
        content,
        mockBaseLlmClientInstance,
        abortSignal,
        true, // LLM disabled
      );
      expect(result).toBe(content);
      expect(mockGenerateJson).toHaveBeenCalledTimes(0);
    });
  });
});
