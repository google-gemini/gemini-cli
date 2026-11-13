/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  AnsiOutput,
  AnsiToken,
  Config,
  FileDiff,
  ToolCallConfirmationDetails,
  ToolResult,
  ToolResultDisplay,
} from '@google/gemini-cli-core';
import { toPermissionOptions, toToolCallContent } from './acpUtils.js';

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

describe('toPermissionOptions', () => {
  const config = {
    getDisableAlwaysAllow: vi.fn().mockReturnValue(false),
  } as unknown as Config;

  function createExecConfirmation(
    overrides: Partial<
      Extract<ToolCallConfirmationDetails, { type: 'exec' }>
    > = {},
  ): ToolCallConfirmationDetails {
    return {
      type: 'exec',
      title: 'Confirm Shell Command',
      command: 'npm install',
      rootCommand: 'npm',
      rootCommands: ['npm'],
      onConfirm: vi.fn(),
      ...overrides,
    };
  }

  it('should offer always-allow options for shell commands', () => {
    const optionIds = toPermissionOptions(
      createExecConfirmation(),
      config,
      true,
    ).map((option) => option.optionId);

    expect(optionIds).toEqual([
      'proceed_always',
      'proceed_always_and_save',
      'proceed_once',
      'cancel',
    ]);
  });

  it.each([
    { name: 'untrusted flags', risk: { untrustedFlags: ['--registry=x'] } },
    {
      name: 'modified build files',
      risk: { modifiedBuildFiles: ['package.json'] },
    },
  ])(
    'should only offer one-time options for shell commands with $name',
    ({ risk }) => {
      const optionIds = toPermissionOptions(
        createExecConfirmation(risk),
        config,
        true,
      ).map((option) => option.optionId);

      expect(optionIds).toEqual(['proceed_once', 'cancel']);
    },
  );
});
