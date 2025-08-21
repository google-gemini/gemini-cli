/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useShellHistory } from './useShellHistory.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));
vi.mock('os');
vi.mock('crypto');
vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof import('fs')>();
  return {
    ...actualFs,
    mkdirSync: vi.fn(),
  };
});
vi.mock('@google/gemini-cli-core', () => {
  class Storage {
    getProjectTempDir(): string {
      return path.join('/test/home/', '.gemini', 'tmp', 'mocked_hash');
    }
    getHistoryFilePath(): string {
      return path.join(
        '/test/home/',
        '.gemini',
        'tmp',
        'mocked_hash',
        'shell_history',
      );
    }
  }
  return {
    isNodeError: (err: unknown): err is NodeJS.ErrnoException =>
      typeof err === 'object' && err !== null && 'code' in err,
    Storage,
  };
});

const MOCKED_PROJECT_ROOT = '/test/project';
const MOCKED_HOME_DIR = '/test/home';
const MOCKED_PROJECT_HASH = 'mocked_hash';

const MOCKED_HISTORY_DIR = path.join(
  MOCKED_HOME_DIR,
  '.gemini',
  'tmp',
  MOCKED_PROJECT_HASH,
);
const MOCKED_HISTORY_FILE = path.join(MOCKED_HISTORY_DIR, 'shell_history');

describe('useShellHistory', () => {
  const mockedFs = vi.mocked(fs);
  const mockedOs = vi.mocked(os);
  const mockedCrypto = vi.mocked(crypto);

  beforeEach(() => {
    vi.resetAllMocks();

    mockedFs.readFile.mockResolvedValue('');
    mockedFs.writeFile.mockResolvedValue(undefined);
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedOs.homedir.mockReturnValue(MOCKED_HOME_DIR);

    const hashMock = {
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue(MOCKED_PROJECT_HASH),
    };
    mockedCrypto.createHash.mockReturnValue(hashMock as never);
  });

  it('should initialize and read the history file from the correct path', async () => {
    mockedFs.readFile.mockResolvedValue('cmd1\ncmd2');
    const { result } = renderHook(() => useShellHistory(MOCKED_PROJECT_ROOT));

    await waitFor(() => {
      expect(mockedFs.readFile).toHaveBeenCalledWith(
        MOCKED_HISTORY_FILE,
        'utf-8',
      );
    });

    let command: string | null = null;
    act(() => {
      command = result.current.getPreviousCommand();
    });

    // History is loaded newest-first: ['cmd2', 'cmd1']
    expect(command).toBe('cmd2');
  });

  it('should handle a nonexistent history file gracefully', async () => {
    const error = new Error('File not found') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    mockedFs.readFile.mockRejectedValue(error);

    const { result } = renderHook(() => useShellHistory(MOCKED_PROJECT_ROOT));

    await waitFor(() => {
      expect(mockedFs.readFile).toHaveBeenCalled();
    });

    let command: string | null = null;
    act(() => {
      command = result.current.getPreviousCommand();
    });

    expect(command).toBe(null);
  });

  it('should add a command and write to the history file', async () => {
    const { result } = renderHook(() => useShellHistory(MOCKED_PROJECT_ROOT));

    await waitFor(() => expect(mockedFs.readFile).toHaveBeenCalled());

    act(() => {
      result.current.addCommandToHistory('new_command');
    });

    await waitFor(() => {
      expect(mockedFs.mkdir).toHaveBeenCalledWith(MOCKED_HISTORY_DIR, {
        recursive: true,
      });
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        MOCKED_HISTORY_FILE,
        'new_command', // Written to file oldest-first.
      );
    });

    let command: string | null = null;
    act(() => {
      command = result.current.getPreviousCommand();
    });
    expect(command).toBe('new_command');
  });

  it('should navigate history correctly with previous/next commands', async () => {
    mockedFs.readFile.mockResolvedValue('cmd1\ncmd2\ncmd3');
    const { result } = renderHook(() => useShellHistory(MOCKED_PROJECT_ROOT));

    // Wait for history to be loaded: ['cmd3', 'cmd2', 'cmd1']
    await waitFor(() => expect(mockedFs.readFile).toHaveBeenCalled());

    let command: string | null = null;

    act(() => {
      command = result.current.getPreviousCommand();
    });
    expect(command).toBe('cmd3');

    act(() => {
      command = result.current.getPreviousCommand();
    });
    expect(command).toBe('cmd2');

    act(() => {
      command = result.current.getPreviousCommand();
    });
    expect(command).toBe('cmd1');

    // Should stay at the oldest command
    act(() => {
      command = result.current.getPreviousCommand();
    });
    expect(command).toBe('cmd1');

    act(() => {
      command = result.current.getNextCommand();
    });
    expect(command).toBe('cmd2');

    act(() => {
      command = result.current.getNextCommand();
    });
    expect(command).toBe('cmd3');

    // Should return to the "new command" line (represented as empty string)
    act(() => {
      command = result.current.getNextCommand();
    });
    expect(command).toBe('');
  });

  it('should not add empty or whitespace-only commands to history', async () => {
    const { result } = renderHook(() => useShellHistory(MOCKED_PROJECT_ROOT));
    await waitFor(() => expect(mockedFs.readFile).toHaveBeenCalled());

    act(() => {
      result.current.addCommandToHistory('   ');
    });

    expect(mockedFs.writeFile).not.toHaveBeenCalled();
  });

  it('should truncate history to MAX_HISTORY_LENGTH (100)', async () => {
    const oldCommands = Array.from({ length: 120 }, (_, i) => `old_cmd_${i}`);
    mockedFs.readFile.mockResolvedValue(oldCommands.join('\n'));

    const { result } = renderHook(() => useShellHistory(MOCKED_PROJECT_ROOT));
    await waitFor(() => expect(mockedFs.readFile).toHaveBeenCalled());

    act(() => {
      result.current.addCommandToHistory('new_cmd');
    });

    // Wait for the async write to happen and then inspect the arguments.
    await waitFor(() => expect(mockedFs.writeFile).toHaveBeenCalled());

    // The hook stores history newest-first.
    // Initial state: ['old_cmd_119', ..., 'old_cmd_0']
    // After adding 'new_cmd': ['new_cmd', 'old_cmd_119', ..., 'old_cmd_21'] (100 items)
    // Written to file (reversed): ['old_cmd_21', ..., 'old_cmd_119', 'new_cmd']
    const writtenContent = mockedFs.writeFile.mock.calls[0][1] as string;
    const writtenLines = writtenContent.split('\n');

    expect(writtenLines.length).toBe(100);
    expect(writtenLines[0]).toBe('old_cmd_21'); // New oldest command
    expect(writtenLines[99]).toBe('new_cmd'); // Newest command
  });

  it('should move an existing command to the top when re-added', async () => {
    mockedFs.readFile.mockResolvedValue('cmd1\ncmd2\ncmd3');
    const { result } = renderHook(() => useShellHistory(MOCKED_PROJECT_ROOT));

    // Initial state: ['cmd3', 'cmd2', 'cmd1']
    await waitFor(() => expect(mockedFs.readFile).toHaveBeenCalled());

    act(() => {
      result.current.addCommandToHistory('cmd1');
    });

    // After re-adding 'cmd1': ['cmd1', 'cmd3', 'cmd2']
    // Written to file (reversed): ['cmd2', 'cmd3', 'cmd1']
    await waitFor(() => expect(mockedFs.writeFile).toHaveBeenCalled());

    const writtenContent = mockedFs.writeFile.mock.calls[0][1] as string;
    const writtenLines = writtenContent.split('\n');

    expect(writtenLines).toEqual(['cmd2', 'cmd3', 'cmd1']);
  });
});
