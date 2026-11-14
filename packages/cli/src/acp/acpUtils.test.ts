/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  type AnsiOutput,
  type AnsiToken,
  type Config,
  type FileDiff,
  type ToolResult,
  type ToolResultDisplay,
  AuthType,
  LATEST_GEMINI_FLASH_MODEL,
  setFlashModels,
  resetModelsForTesting,
} from '@google/gemini-cli-core';
import type { LoadedSettings } from '../config/settings.js';
import { toToolCallContent, buildAvailableModels } from './acpUtils.js';

function createToken(
  text: string,
  overrides: Partial<AnsiToken> = {},
): AnsiToken {
  return {
    text,
    bold: false,
    italic: false,
    underline: false,
    dim: false,
    inverse: false,
    isUninitialized: false,
    fg: '',
    bg: '',
    ...overrides,
  };
}

function createToolResult(returnDisplay: ToolResultDisplay): ToolResult {
  return { llmContent: '', returnDisplay };
}

describe('toToolCallContent', () => {
  describe('AnsiOutput returnDisplay', () => {
    it('should flatten AnsiOutput into text content', () => {
      const ansiOutput: AnsiOutput = [
        [createToken('hello '), createToken('world')],
      ];

      expect(toToolCallContent(createToolResult(ansiOutput))).toEqual({
        type: 'content',
        content: { type: 'text', text: 'hello world' },
      });
    });

    it('should join lines with newlines and drop styling', () => {
      const ansiOutput: AnsiOutput = [
        [createToken('line 1', { bold: true, fg: '#ff0000' })],
        [
          createToken('line '),
          createToken('2', { underline: true, bg: '#00ff00' }),
        ],
      ];

      expect(toToolCallContent(createToolResult(ansiOutput))).toEqual({
        type: 'content',
        content: { type: 'text', text: 'line 1\nline 2' },
      });
    });

    it('should trim surrounding whitespace and blank lines', () => {
      const ansiOutput: AnsiOutput = [
        [createToken('   ')],
        [createToken('output'), createToken('    ', { isUninitialized: true })],
        [],
      ];

      expect(toToolCallContent(createToolResult(ansiOutput))).toEqual({
        type: 'content',
        content: { type: 'text', text: 'output' },
      });
    });

    it.each<{ name: string; ansiOutput: AnsiOutput }>([
      { name: 'no lines', ansiOutput: [] },
      { name: 'only empty lines', ansiOutput: [[], []] },
      {
        name: 'only whitespace tokens',
        ansiOutput: [[createToken('')], [createToken('  '), createToken('\t')]],
      },
    ])('should return null for AnsiOutput with $name', ({ ansiOutput }) => {
      expect(toToolCallContent(createToolResult(ansiOutput))).toBeNull();
    });
  });

  describe('string returnDisplay', () => {
    it('should return text content for a string', () => {
      expect(toToolCallContent(createToolResult('some output'))).toEqual({
        type: 'content',
        content: { type: 'text', text: 'some output' },
      });
    });

    it('should return null for an empty string', () => {
      expect(toToolCallContent(createToolResult(''))).toBeNull();
    });
  });

  describe('FileDiff returnDisplay', () => {
    it.each<{
      kind: string;
      originalContent: string | null;
      newContent: string;
    }>([
      { kind: 'add', originalContent: null, newContent: 'new' },
      { kind: 'modify', originalContent: 'old', newContent: 'new' },
      { kind: 'delete', originalContent: 'old', newContent: '' },
    ])(
      'should return a diff with kind $kind',
      ({ kind, originalContent, newContent }) => {
        const fileDiff: FileDiff = {
          fileDiff: 'diff',
          fileName: 'file.txt',
          filePath: '/path/to/file.txt',
          originalContent,
          newContent,
        };

        expect(toToolCallContent(createToolResult(fileDiff))).toEqual({
          type: 'diff',
          path: '/path/to/file.txt',
          oldText: originalContent,
          newText: newContent,
          _meta: { kind },
        });
      },
    );
  });

  it('should return null for unsupported returnDisplay objects', () => {
    expect(
      toToolCallContent(
        createToolResult({
          todos: [{ description: 'task', status: 'pending' }],
        }),
      ),
    ).toBeNull();
  });
});

describe('buildAvailableModels', () => {
  afterEach(() => {
    resetModelsForTesting();
  });

  it('deduplicates manual options when preview and default Flash both resolve to gemini-3.8-flash', () => {
    const mockConfig = {
      getModel: () => 'auto',
      getHasAccessToPreviewModel: () => true,
      getGemini31LaunchedSync: () => true,
      hasLatestFlashGAAccess: () => {
        setFlashModels(LATEST_GEMINI_FLASH_MODEL, LATEST_GEMINI_FLASH_MODEL);
        return true;
      },
      hasLatestFlashLiteGAAccess: () => false,
      getExperimentalDynamicModelConfiguration: () => false,
    } as unknown as Config;

    const settings = {
      merged: {
        security: {
          auth: {
            selectedType: AuthType.LOGIN_WITH_GOOGLE,
          },
        },
      },
    } as unknown as LoadedSettings;

    const { availableModels, currentModelId } = buildAvailableModels(
      mockConfig,
      settings,
    );

    expect(currentModelId).toBe('auto');
    expect(availableModels.map((m) => m.modelId)).toEqual([
      'auto',
      'gemini-3.1-pro-preview',
      'gemini-3.8-flash',
      'gemini-2.5-pro',
      'gemini-3.1-flash-lite',
    ]);
  });

  it('falls back to contentGeneratorConfig.authType when settings.merged.security is undefined', () => {
    const mockConfig = {
      getModel: () => 'auto',
      getHasAccessToPreviewModel: () => true,
      getGemini31LaunchedSync: () => true,
      hasLatestFlashGAAccess: () => {
        setFlashModels('gemini-3-flash-preview', LATEST_GEMINI_FLASH_MODEL);
        return true;
      },
      hasLatestFlashLiteGAAccess: () => false,
      getExperimentalDynamicModelConfiguration: () => false,
      getContentGeneratorConfig: () => ({
        authType: AuthType.USE_GEMINI,
      }),
    } as unknown as Config;

    const settings = {
      merged: {},
    } as unknown as LoadedSettings;

    const { availableModels } = buildAvailableModels(mockConfig, settings);

    expect(availableModels.map((m) => m.modelId)).toEqual([
      'auto',
      'gemini-3.1-pro-preview-customtools',
      'gemini-3-flash-preview',
      'gemini-2.5-pro',
      'gemini-3.8-flash',
      'gemini-3.1-flash-lite',
    ]);
  });
});
