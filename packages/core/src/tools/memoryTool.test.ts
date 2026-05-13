/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTEXT_FILENAME,
  getAllGeminiMdFilenames,
  resetGeminiMdFilename,
  setGeminiMdFilename,
} from './memoryTool.js';

describe('memoryTool filename helpers', () => {
  afterEach(() => {
    resetGeminiMdFilename(DEFAULT_CONTEXT_FILENAME);
  });

  describe('setGeminiMdFilename', () => {
    it('appends to currentGeminiMdFilename when a valid new name is provided', () => {
      const newName = 'CUSTOM_CONTEXT.md';
      setGeminiMdFilename(newName);
      expect(getAllGeminiMdFilenames()).toEqual([
        newName,
        DEFAULT_CONTEXT_FILENAME,
      ]);
    });

    it('does not update currentGeminiMdFilename if the new name is empty or whitespace', () => {
      const initialNames = getAllGeminiMdFilenames();
      setGeminiMdFilename('  ');
      expect(getAllGeminiMdFilenames()).toEqual(initialNames);

      setGeminiMdFilename('');
      expect(getAllGeminiMdFilenames()).toEqual(initialNames);
    });

    it('handles adding an array of filenames', () => {
      const newNames = ['CUSTOM_CONTEXT.md', 'ANOTHER_CONTEXT.md'];
      setGeminiMdFilename(newNames);
      expect(getAllGeminiMdFilenames()).toEqual([
        ...newNames,
        DEFAULT_CONTEXT_FILENAME,
      ]);
    });

    it('ensures uniqueness when adding names', () => {
      setGeminiMdFilename(DEFAULT_CONTEXT_FILENAME);
      expect(getAllGeminiMdFilenames()).toEqual([DEFAULT_CONTEXT_FILENAME]);

      setGeminiMdFilename(['NEW.md', 'NEW.md']);
      expect(getAllGeminiMdFilenames()).toEqual([
        'NEW.md',
        DEFAULT_CONTEXT_FILENAME,
      ]);
    });
  });

  describe('resetGeminiMdFilename', () => {
    it('replaces all filenames with the provided one', () => {
      setGeminiMdFilename('OTHER.md');
      resetGeminiMdFilename('RESET.md');
      expect(getAllGeminiMdFilenames()).toEqual(['RESET.md']);
    });

    it('resets to default if no argument provided', () => {
      resetGeminiMdFilename('OTHER.md');
      resetGeminiMdFilename(DEFAULT_CONTEXT_FILENAME);
      expect(getAllGeminiMdFilenames()).toEqual([DEFAULT_CONTEXT_FILENAME]);
    });

    it('handles array reset', () => {
      resetGeminiMdFilename(['A.md', 'B.md']);
      expect(getAllGeminiMdFilenames()).toEqual(['A.md', 'B.md']);
    });
  });
});
