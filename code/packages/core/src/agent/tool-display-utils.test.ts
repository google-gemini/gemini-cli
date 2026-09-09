/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type {
  ToolInvocation,
  ToolResult,
  ToolResultDisplay,
} from '../tools/tools.js';
import type { DisplayContent } from './types.js';
import {
  populateToolDisplay,
  renderDisplayDiff,
  displayContentToString,
} from './tool-display-utils.js';

describe('tool-display-utils', () => {
  describe('populateToolDisplay', () => {
    it('uses displayName if provided', () => {
      const mockInvocation = {
        getDescription: () => 'Doing something...',
      } as unknown as ToolInvocation<object, ToolResult>;

      const display = populateToolDisplay({
        name: 'raw-name',
        invocation: mockInvocation,
        displayName: 'Custom Display Name',
      });
      expect(display.name).toBe('Custom Display Name');
      expect(display.description).toBe('Doing something...');
    });

    it('falls back to raw name if no displayName provided', () => {
      const mockInvocation = {
        getDescription: () => 'Doing something...',
      } as unknown as ToolInvocation<object, ToolResult>;

      const display = populateToolDisplay({
        name: 'raw-name',
        invocation: mockInvocation,
      });
      expect(display.name).toBe('raw-name');
    });

    it('populates result from resultDisplay', () => {
      const display = populateToolDisplay({
        name: 'test',
        resultDisplay: 'hello world',
      });
      expect(display.result).toEqual({ type: 'text', text: 'hello world' });
    });

    it('translates FileDiff to DisplayDiff', () => {
      const fileDiff = {
        fileDiff: '@@ ...',
        fileName: 'test.ts',
        filePath: 'src/test.ts',
        originalContent: 'old',
        newContent: 'new',
      } as unknown as ToolResultDisplay;
      const display = populateToolDisplay({
        name: 'test',
        resultDisplay: fileDiff,
      });
      expect(display.result).toEqual({
        type: 'diff',
        path: 'src/test.ts',
        beforeText: 'old',
        afterText: 'new',
      });
    });
  });

  describe('renderDisplayDiff', () => {
    it('renders a universal diff', () => {
      const diff = {
        type: 'diff' as const,
        path: 'test.ts',
        beforeText: 'line 1\nline 2',
        afterText: 'line 1\nline 2 modified',
      };
      const rendered = renderDisplayDiff(diff);
      expect(rendered).toContain('--- test.ts\tOriginal');
      expect(rendered).toContain('+++ test.ts\tModified');
      expect(rendered).toContain('-line 2');
      expect(rendered).toContain('+line 2 modified');
    });
  });

  describe('displayContentToString', () => {
    it('returns undefined for undefined input', () => {
      expect(displayContentToString(undefined)).toBeUndefined();
    });

    it('returns text for text input', () => {
      expect(displayContentToString({ type: 'text', text: 'hello' })).toBe(
        'hello',
      );
    });

    it('renders a diff for diff input', () => {
      const diff = {
        type: 'diff' as const,
        path: 'test.ts',
        beforeText: 'old',
        afterText: 'new',
      };
      const rendered = displayContentToString(diff);
      expect(rendered).toContain('--- test.ts\tOriginal');
      expect(rendered).toContain('+++ test.ts\tModified');
    });

    it('stringifies unknown structured objects', () => {
      const unknown = {
        type: 'something_else',
        data: 123,
      } as unknown as DisplayContent;
      expect(displayContentToString(unknown)).toBe(JSON.stringify(unknown));
    });
  });
});
