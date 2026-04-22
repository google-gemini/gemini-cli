/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { noteCommand } from './noteCommand.js';
import { type CommandContext } from './types.js';

vi.mock('node:fs/promises');

describe('noteCommand', () => {
  const mockContext = {} as CommandContext;
  const notesPath = path.join(process.cwd(), 'notes.md');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return notes content when no args provided and file exists', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('existing note\n');

    const result = await noteCommand.action!(mockContext, '');

    expect(fs.readFile).toHaveBeenCalledWith(notesPath, 'utf8');
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: expect.stringContaining('existing note'),
    });
  });

  it('should return info message when no args provided and file does not exist', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

    const result = await noteCommand.action!(mockContext, '  ');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No notes found. Use "/note <text>" to add one.',
    });
  });

  it('should append note to file when args are provided', async () => {
    const note = 'this is a new note';
    vi.mocked(fs.appendFile).mockResolvedValue(undefined);

    const result = await noteCommand.action!(mockContext, note);

    expect(fs.appendFile).toHaveBeenCalledWith(notesPath, `${note}\n`);
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: expect.stringContaining('Note added'),
    });
  });

  it('should return error message when append fails', async () => {
    vi.mocked(fs.appendFile).mockRejectedValue(new Error('Permission denied'));

    const result = await noteCommand.action!(mockContext, 'some note');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: expect.stringContaining(
        'Failed to save note: Permission denied',
      ),
    });
  });
});
