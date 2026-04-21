/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { noteCommand } from './noteCommand.js';
import * as fsPromises from 'node:fs/promises';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import * as path from 'node:path';
import type { MessageActionReturn } from '@google/gemini-cli-core';

vi.mock('node:fs/promises');

describe('noteCommand', () => {
  const mockContext = createMockCommandContext();
  const workspaceRoot = process.cwd();
  const notesFile = path.join(workspaceRoot, 'notes.md');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('append action', () => {
    it('should append a note to notes.md when args are provided', async () => {
      const noteText = 'This is a test note';
      vi.mocked(fsPromises.appendFile).mockResolvedValue(undefined);

      const result = (await noteCommand.action!(
        mockContext,
        noteText,
      )) as MessageActionReturn;

      expect(fsPromises.appendFile).toHaveBeenCalledWith(
        notesFile,
        expect.stringContaining(noteText),
      );
      expect(fsPromises.appendFile).toHaveBeenCalledWith(
        notesFile,
        expect.stringContaining('## '),
      );
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: `Note saved to ${notesFile}`,
      });
    });

    it('should return a usage message when no args are provided', async () => {
      const result = (await noteCommand.action!(
        mockContext,
        '  ',
      )) as MessageActionReturn;

      expect(fsPromises.appendFile).not.toHaveBeenCalled();
      expect(result.content).toContain('Please provide a note to save');
    });

    it('should return an error message when appendFile fails', async () => {
      vi.mocked(fsPromises.appendFile).mockRejectedValue(new Error('FS Error'));

      const result = (await noteCommand.action!(
        mockContext,
        'some note',
      )) as MessageActionReturn;

      expect(result.content).toContain('Failed to save note: FS Error');
    });
  });

  describe('view subcommand', () => {
    const viewSubcommand = noteCommand.subCommands?.find(
      (s) => s.name === 'view',
    );

    it('should read and display notes from notes.md', async () => {
      const notesContent = '## 4/21/2026\n\nTest note content';
      vi.mocked(fsPromises.readFile).mockResolvedValue(notesContent);

      const result = (await viewSubcommand!.action!(
        mockContext,
        '',
      )) as MessageActionReturn;

      expect(fsPromises.readFile).toHaveBeenCalledWith(notesFile, 'utf8');
      expect(result.content).toContain('### Current Notes');
      expect(result.content).toContain(notesContent);
    });

    it('should return "No notes found" if notes.md does not exist', async () => {
      const error = new Error('Not found');
      Object.assign(error, { code: 'ENOENT' });
      vi.mocked(fsPromises.readFile).mockRejectedValue(error);

      const result = (await viewSubcommand!.action!(
        mockContext,
        '',
      )) as MessageActionReturn;

      expect(result.content).toContain('No notes found in this workspace.');
    });

    it('should return an error message when readFile fails with other error', async () => {
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('Read Error'));

      const result = (await viewSubcommand!.action!(
        mockContext,
        '',
      )) as MessageActionReturn;

      expect(result.content).toContain('Failed to read notes: Read Error');
    });
  });
});
