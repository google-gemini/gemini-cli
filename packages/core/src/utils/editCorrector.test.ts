/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Mock } from 'vitest';
import { vi, describe, it, expect, beforeEach, type Mocked } from 'vitest';
import * as fs from 'node:fs';
import { EditTool } from '../tools/edit.js';

// MOCKS
let callCount = 0;
const mockResponses: any[] = [];

let mockGenerateJson: any;
let mockStartChat: any;
let mockSendMessageStream: any;

vi.mock('fs', () => ({
  statSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(function (
    this: any,
    _config: Config,
  ) {
    this.generateJson = (...params: any[]) => mockGenerateJson(...params); // Corrected: use mockGenerateJson
    this.startChat = (...params: any[]) => mockStartChat(...params); // Corrected: use mockStartChat
    this.sendMessageStream = (...params: any[]) =>
      mockSendMessageStream(...params); // Corrected: use mockSendMessageStream
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
    it('should unescape common sequences', () => {
      expect(unescapeStringForGeminiBug('\\n')).toBe('\n');
      expect(unescapeStringForGeminiBug('\\t')).toBe('\t');
      expect(unescapeStringForGeminiBug("\\'")).toBe("'");
      expect(unescapeStringForGeminiBug('\\"')).toBe('"');
      expect(unescapeStringForGeminiBug('\\`')).toBe('`');
    });
    it('should handle multiple escaped sequences', () => {
      expect(unescapeStringForGeminiBug('Hello\\nWorld\\tTest')).toBe(
        'Hello\nWorld\tTest',
      );
    });
    it('should not alter already correct sequences', () => {
      expect(unescapeStringForGeminiBug('\n')).toBe('\n');
      expect(unescapeStringForGeminiBug('Correct string')).toBe(
        'Correct string',
      );
    });
    it('should handle mixed correct and incorrect sequences', () => {
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
    it('should handle multiple backslashes before an escapable character (aggressive unescaping)', () => {
      expect(unescapeStringForGeminiBug('\\\\n')).toBe('\n');
      expect(unescapeStringForGeminiBug('\\\\\\t')).toBe('\t');
      expect(unescapeStringForGeminiBug('\\\\\\\\`')).toBe('`');
    });
    it('should return empty string for empty input', () => {
      expect(unescapeStringForGeminiBug('')).toBe('');
    });
    it('should not alter strings with no targeted escape sequences', () => {
      expect(unescapeStringForGeminiBug('abc def')).toBe('abc def');
      expect(unescapeStringForGeminiBug('C:\\Folder\\File')).toBe(
        'C:\\Folder\\File',
      );
    });
    it('should correctly process strings with some targeted escapes', () => {
      expect(unescapeStringForGeminiBug('C:\\Users\\name')).toBe(
        'C:\\Users\name',
      );
    });
    it('should handle complex cases with mixed slashes and characters', () => {
      expect(
        unescapeStringForGeminiBug('\\\\\\\nLine1\\\nLine2\\tTab\\\\`Tick\\"'),
      ).toBe('\nLine1\nLine2\tTab`Tick"');
    });
    it('should handle escaped backslashes', () => {
      expect(unescapeStringForGeminiBug('\\\\')).toBe('\\');
      expect(unescapeStringForGeminiBug('C:\\\\Users')).toBe('C:\\Users');
      expect(unescapeStringForGeminiBug('path\\\\to\\\\file')).toBe(
        'path\to\\file',
      );
    });
    it('should handle escaped backslashes mixed with other escapes (aggressive unescaping)', () => {
      expect(unescapeStringForGeminiBug('line1\\\\\\nline2')).toBe(
        'line1\nline2',
      );
      expect(unescapeStringForGeminiBug('quote\\\\"text\\\\nline')).toBe(
        'quote"text\nline',
      );
    });
  });

  describe('ensureCorrectEdit', () => {
    let mockGeminiClientInstance: Mocked<GeminiClient>;
    let mockToolRegistry: Mocked<ToolRegistry>;
    let mockConfigInstance: Config;
    const abortSignal = new AbortController().signal;

    beforeEach(() => {
      mockToolRegistry = new ToolRegistry({} as Config) as Mocked<ToolRegistry>;
      const configParams = {
        apiKey: 'test-api-key',
        model: 'test-model',
        sandbox: false as boolean | string,
        targetDir: '/test',
        debugMode: false,
        question: undefined as string | undefined,
        fullContext: false,
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
        getFullContext: vi.fn(() => configParams.fullContext),
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
      mockGeminiClientInstance.getHistory = vi.fn().mockResolvedValue([]);
      resetEditCorrectorCaches_TEST_ONLY();
    });

    describe('Scenario Group 1: originalParams.old_string matches currentContent directly', () => {
      it('Test 1.1: old_string (no literal \\), new_string (escaped by Gemini) -> new_string unescaped', async () => {
        const currentContent = 'This is a test string to find me.';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'find me',
          new_string: 'replace with \\"this\\"',
        };
        mockResponses.push({
          corrected_new_string_escaping: 'replace with "this"',
        });
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          abortSignal,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(1);
        expect(result.params.new_string).toBe('replace with "this"');
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
          abortSignal,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(0);
        expect(result.params.new_string).toBe('replace with this');
        expect(result.params.old_string).toBe('find me');
        expect(result.occurrences).toBe(1);
      });
      it('Test 1.3: old_string (with literal \\), new_string (escaped by Gemini) -> new_string unchanged (still escaped)', async () => {
        const currentContent = 'This is a test string to find\\me.';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'find\\me',
          new_string: 'replace with \\"this\\"',
        };
        mockResponses.push({
          corrected_new_string_escaping: 'replace with "this"',
        });
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          abortSignal,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(1);
        expect(result.params.new_string).toBe('replace with "this"');
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
          abortSignal,
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
          abortSignal,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(1);
        expect(result.params.new_string).toBe('replace with "this"');
        expect(result.params.old_string).toBe('find "me"');
        expect(result.occurrences).toBe(1);
      });
      it('Test 2.2: old_string (over-escaped, no intended literal \\), new_string (correctly formatted) -> new_string unescaped (harmlessly)', async () => {
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
          abortSignal,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(0);
        expect(result.params.new_string).toBe('replace with this');
        expect(result.params.old_string).toBe('find "me"');
        expect(result.occurrences).toBe(1);
      });
      it('Test 2.3: old_string (over-escaped, with intended literal \\), new_string (simple) -> new_string corrected', async () => {
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
          abortSignal,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(0);
        expect(result.params.new_string).toBe('replace with foobar');
        expect(result.params.old_string).toBe('find \\me');
        expect(result.occurrences).toBe(1);
      });
    });

    describe('Scenario Group 3: LLM Correction Path', () => {
      it('Test 3.1: old_string (no literal \\), new_string (escaped by Gemini), LLM re-escapes new_string -> final new_string is double unescaped', async () => {
        const currentContent = 'This is a test string to corrected find me.';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'find me',
          new_string: 'replace with \\\\"this\\\\"',
        };
        const llmNewString = 'LLM says replace with "that"';
        mockResponses.push({ corrected_new_string_escaping: llmNewString });
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          abortSignal,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(1);
        expect(result.params.new_string).toBe(llmNewString);
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
          abortSignal,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(2);
        expect(result.params.new_string).toBe(llmNewString);
        expect(result.params.old_string).toBe(llmCorrectedOldString);
        expect(result.occurrences).toBe(1);
      });
      it('Test 3.3: old_string needs LLM, new_string is fine -> old_string corrected, new_string original', async () => {
        const currentContent = 'This is a test string to be corrected.';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'fiiind me',
          new_string: 'replace with "this"',
        };
        const llmCorrectedOldString = 'to be corrected';
        mockResponses.push({ corrected_target_snippet: llmCorrectedOldString });
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          abortSignal,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(1);
        expect(result.params.new_string).toBe('replace with "this"');
        expect(result.params.old_string).toBe(llmCorrectedOldString);
        expect(result.occurrences).toBe(1);
      });
      it('Test 3.4: LLM correction path, correctNewString returns the originalNewString it was passed (which was unescaped) -> final new_string is unescaped', async () => {
        const currentContent = 'This is a test string to corrected find me.';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'find me',
          new_string: 'replace with \\\\"this\\\\"',
        };
        const newStringForLLMAndReturnedByLLM = 'replace with "this"';
        mockResponses.push({
          corrected_new_string_escaping: newStringForLLMAndReturnedByLLM,
        });
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          abortSignal,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(1);
        expect(result.params.new_string).toBe(newStringForLLMAndReturnedByLLM);
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
          abortSignal,
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
          abortSignal,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(0);
        expect(result.params).toEqual(originalParams);
        expect(result.occurrences).toBe(2);
      });
    });

    describe('Scenario Group 5: Specific unescapeStringForGeminiBug checks (integrated into ensureCorrectEdit)', () => {
      it('Test 5.1: old_string needs LLM to become currentContent, new_string also needs correction', async () => {
        const currentContent = 'const x = "a\nbc\\"def\\"';
        const originalParams = {
          file_path: '/test/file.txt',
          old_string: 'const x = \\"a\\nbc\\\\"def\\\\"',
          new_string: 'const y = \\"new\\nval\\\\"content\\\\"',
        };
        const expectedFinalNewString = 'const y = "new\nval\\"content\\"';
        mockResponses.push({ corrected_target_snippet: currentContent });
        mockResponses.push({ corrected_new_string: expectedFinalNewString });
        const result = await ensureCorrectEdit(
          '/test/file.txt',
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          abortSignal,
        );
        expect(mockGenerateJson).toHaveBeenCalledTimes(2);
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
                  name: EditTool.Name,
                  id: `${EditTool.Name}-${lastEditTime}-123`,
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
        (mockGeminiClientInstance.getHistory as Mock).mockResolvedValue(
          history,
        );

        const result = await ensureCorrectEdit(
          filePath,
          currentContent,
          originalParams,
          mockGeminiClientInstance,
          abortSignal,
        );

        expect(result.occurrences).toBe(0);
        expect(result.params).toEqual(originalParams);
      });
    });
  });

  describe('ensureCorrectFileContent', () => {
    let mockGeminiClientInstance: Mocked<GeminiClient>;
    let mockToolRegistry: Mocked<ToolRegistry>;
    let mockConfigInstance: Config;
    const abortSignal = new AbortController().signal;

    beforeEach(() => {
      mockToolRegistry = new ToolRegistry({} as Config) as Mocked<ToolRegistry>;
      const configParams = {
        apiKey: 'test-api-key',
        model: 'test-model',
        sandbox: false as boolean | string,
        targetDir: '/test',
        debugMode: false,
        question: undefined as string | undefined,
        fullContext: false,
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
        getFullContext: vi.fn(() => configParams.fullContext),
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
          if (signal && signal.aborted) {
            return Promise.reject(new Error('Aborted'));
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
      resetEditCorrectorCaches_TEST_ONLY();
    });

    it('should return content unchanged if no escaping issues detected', async () => {
      const content = 'This is normal content without escaping issues';
      const result = await ensureCorrectFileContent(
        content,
        mockGeminiClientInstance,
        abortSignal,
      );
      expect(result).toBe(content);
      expect(mockGenerateJson).toHaveBeenCalledTimes(0);
    });

    it('should call correctStringEscaping for potentially escaped content', async () => {
      const content = 'console.log(\\"Hello World\\");';
      const correctedContent = 'console.log("Hello World");';
      mockResponses.push({
        corrected_string_escaping: correctedContent,
      });

      const result = await ensureCorrectFileContent(
        content,
        mockGeminiClientInstance,
        abortSignal,
      );

      expect(result).toBe(correctedContent);
      expect(mockGenerateJson).toHaveBeenCalledTimes(1);
    });

    it('should handle correctStringEscaping returning corrected content via correct property name', async () => {
      // This test specifically verifies the property name fix
      const content = 'const message = \\"Hello\\nWorld\\";';
      const correctedContent = 'const message = "Hello\nWorld";';

      // Mock the response with the correct property name
      mockResponses.push({
        corrected_string_escaping: correctedContent,
      });

      const result = await ensureCorrectFileContent(
        content,
        mockGeminiClientInstance,
        abortSignal,
      );

      expect(result).toBe(correctedContent);
      expect(mockGenerateJson).toHaveBeenCalledTimes(1);
    });

    it('should return original content if LLM correction fails', async () => {
      const content = 'console.log(\\"Hello World\\");';
      // Mock empty response to simulate LLM failure
      mockResponses.push({});

      const result = await ensureCorrectFileContent(
        content,
        mockGeminiClientInstance,
        abortSignal,
      );

      expect(result).toBe(content);
      expect(mockGenerateJson).toHaveBeenCalledTimes(1);
    });

    it('should handle various escape sequences that need correction', async () => {
      const content =
        'const obj = { name: \\"John\\", age: 30, bio: \\"Developer\\nEngineer\\" };';
      const correctedContent =
        'const obj = { name: "John", age: 30, bio: "Developer\nEngineer" };';

      mockResponses.push({
        corrected_string_escaping: correctedContent,
      });

      const result = await ensureCorrectFileContent(
        content,
        mockGeminiClientInstance,
        abortSignal,
      );

      expect(result).toBe(correctedContent);
    });
  });
});
