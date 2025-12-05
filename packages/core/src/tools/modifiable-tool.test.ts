/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type {
  ModifyContext,
  ModifiableDeclarativeTool,
} from './modifiable-tool.js';
import {
  modifyWithEditor,
  isModifiableDeclarativeTool,
} from './modifiable-tool.js';
import { DEFAULT_GUI_EDITOR } from '../utils/editor.js';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import * as path from 'node:path';
import { debugLogger } from '../utils/debugLogger.js';

// Mock dependencies
const mockOpenDiff = vi.hoisted(() => vi.fn());
const mockCreatePatch = vi.hoisted(() => vi.fn());

vi.mock('../utils/editor.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/editor.js')>();
  return {
    ...actual,
    openDiff: mockOpenDiff,
  };
});

vi.mock('diff', () => ({
  createPatch: mockCreatePatch,
}));

interface TestParams {
  filePath: string;
  someOtherParam: string;
  modifiedContent?: string;
}

describe('modifyWithEditor', () => {
  let testProjectDir: string;
  let mockModifyContext: ModifyContext<TestParams>;
  let mockParams: TestParams;
  let currentContent: string;
  let proposedContent: string;
  let modifiedContent: string;
  let abortSignal: AbortSignal;

  beforeEach(async () => {
    vi.resetAllMocks();

    testProjectDir = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'modifiable-tool-test-'),
    );
    abortSignal = new AbortController().signal;

    currentContent = 'original content\nline 2\nline 3';
    proposedContent = 'modified content\nline 2\nline 3';
    modifiedContent = 'user modified content\nline 2\nline 3\nnew line';
    mockParams = {
      filePath: path.join(testProjectDir, 'test.txt'),
      someOtherParam: 'value',
    };

    mockModifyContext = {
      getFilePath: vi.fn().mockReturnValue(mockParams.filePath),
      getCurrentContent: vi.fn().mockResolvedValue(currentContent),
      getProposedContent: vi.fn().mockResolvedValue(proposedContent),
      createUpdatedParams: vi
        .fn()
        .mockImplementation((oldContent, modifiedContent, originalParams) => ({
          ...originalParams,
          modifiedContent,
          oldContent,
        })),
    };

    mockOpenDiff.mockImplementation(async (_oldPath, newPath) => {
      await fsp.writeFile(newPath, modifiedContent, 'utf8');
    });

    mockCreatePatch.mockReturnValue('mock diff content');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fsp.rm(testProjectDir, { recursive: true, force: true });
  });

  describe('successful modification', () => {
    const assertMode = (mode: number, expected: number): void => {
      if (process.platform === 'win32') {
        // Windows reports POSIX modes as 0o666 regardless of requested bits.
        // At minimum confirm the owner read/write bits are present.
        expect(mode & 0o600).toBe(0o600);
        return;
      }
      expect(mode & 0o777).toBe(expected);
    };

    it('should successfully modify content with VSCode editor', async () => {
      const result = await modifyWithEditor(
        mockParams,
        mockModifyContext,
        DEFAULT_GUI_EDITOR,
        abortSignal,
      );

      expect(mockModifyContext.getCurrentContent).toHaveBeenCalledWith(
        mockParams,
      );
      expect(mockModifyContext.getProposedContent).toHaveBeenCalledWith(
        mockParams,
      );
      expect(mockModifyContext.getFilePath).toHaveBeenCalledWith(mockParams);

      expect(mockOpenDiff).toHaveBeenCalledOnce();
      const [oldFilePath, newFilePath] = mockOpenDiff.mock.calls[0];

      expect(mockModifyContext.createUpdatedParams).toHaveBeenCalledWith(
        currentContent,
        modifiedContent,
        mockParams,
      );

      expect(mockCreatePatch).toHaveBeenCalledWith(
        path.basename(mockParams.filePath),
        currentContent,
        modifiedContent,
        'Current',
        'Proposed',
        expect.objectContaining({
          context: 3,
          ignoreWhitespace: true,
        }),
      );

      // Check that temp files are deleted.
      await expect(fsp.access(oldFilePath)).rejects.toThrow();
      await expect(fsp.access(newFilePath)).rejects.toThrow();

      expect(result).toEqual({
        updatedParams: {
          ...mockParams,
          modifiedContent,
          oldContent: currentContent,
        },
        updatedDiff: 'mock diff content',
      });
    });

    it('should create temp directory and files with restrictive permissions', async () => {
      mockOpenDiff.mockImplementation(async (oldPath, newPath) => {
        const diffDir = path.dirname(oldPath);
        expect(diffDir).toBe(path.dirname(newPath));

        const dirStats = await fsp.stat(diffDir);
        const oldStats = await fsp.stat(oldPath);
        const newStats = await fsp.stat(newPath);

        assertMode(dirStats.mode, 0o700);
        assertMode(oldStats.mode, 0o600);
        assertMode(newStats.mode, 0o600);

        await fsp.writeFile(newPath, modifiedContent, 'utf8');
      });

      await modifyWithEditor(
        mockParams,
        mockModifyContext,
        DEFAULT_GUI_EDITOR,
        abortSignal,
      );

      const [oldFilePath] = mockOpenDiff.mock.calls[0];
      const diffDir = path.dirname(oldFilePath);
      // Temp directory should be cleaned up after modification
      await expect(fsp.stat(diffDir)).rejects.toThrow();
    });
  });

  it('should handle missing old temp file gracefully', async () => {
    mockOpenDiff.mockImplementation(async (oldPath, newPath) => {
      await fsp.writeFile(newPath, modifiedContent, 'utf8');
      await fsp.unlink(oldPath);
    });

    const result = await modifyWithEditor(
      mockParams,
      mockModifyContext,
      DEFAULT_GUI_EDITOR,
      abortSignal,
    );

    expect(mockCreatePatch).toHaveBeenCalledWith(
      path.basename(mockParams.filePath),
      '',
      modifiedContent,
      'Current',
      'Proposed',
      expect.objectContaining({
        context: 3,
        ignoreWhitespace: true,
      }),
    );

    expect(result.updatedParams).toBeDefined();
    expect(result.updatedDiff).toBe('mock diff content');
  });

  it('should handle missing new temp file gracefully', async () => {
    mockOpenDiff.mockImplementation(async (_oldPath, newPath) => {
      await fsp.unlink(newPath);
    });

    const result = await modifyWithEditor(
      mockParams,
      mockModifyContext,
      DEFAULT_GUI_EDITOR,
      abortSignal,
    );

    expect(mockCreatePatch).toHaveBeenCalledWith(
      path.basename(mockParams.filePath),
      currentContent,
      '',
      'Current',
      'Proposed',
      expect.objectContaining({
        context: 3,
        ignoreWhitespace: true,
      }),
    );

    expect(result.updatedParams).toBeDefined();
    expect(result.updatedDiff).toBe('mock diff content');
  });

  it('should honor override content values when provided', async () => {
    const overrideCurrent = 'override current content';
    const overrideProposed = 'override proposed content';
    mockModifyContext.getCurrentContent = vi.fn();
    mockModifyContext.getProposedContent = vi.fn();

    await modifyWithEditor(
      mockParams,
      mockModifyContext,
      DEFAULT_GUI_EDITOR,
      abortSignal,
      {
        currentContent: overrideCurrent,
        proposedContent: overrideProposed,
      },
    );

    expect(mockModifyContext.getCurrentContent).not.toHaveBeenCalled();
    expect(mockModifyContext.getProposedContent).not.toHaveBeenCalled();
    expect(mockCreatePatch).toHaveBeenCalledWith(
      path.basename(mockParams.filePath),
      overrideCurrent,
      modifiedContent,
      'Current',
      'Proposed',
      expect.any(Object),
    );
  });

  it('should treat null override as explicit empty content', async () => {
    mockModifyContext.getCurrentContent = vi.fn();
    mockModifyContext.getProposedContent = vi.fn();

    await modifyWithEditor(
      mockParams,
      mockModifyContext,
      DEFAULT_GUI_EDITOR,
      abortSignal,
      {
        currentContent: null,
        proposedContent: 'override proposed content',
      },
    );

    expect(mockModifyContext.getCurrentContent).not.toHaveBeenCalled();
    expect(mockModifyContext.getProposedContent).not.toHaveBeenCalled();
    expect(mockCreatePatch).toHaveBeenCalledWith(
      path.basename(mockParams.filePath),
      '',
      modifiedContent,
      'Current',
      'Proposed',
      expect.any(Object),
    );
  });

  it('should clean up temp files even if editor fails', async () => {
    const editorError = new Error('Editor failed to open');
    mockOpenDiff.mockRejectedValue(editorError);

    const writeSpy = vi.spyOn(fs, 'writeFileSync');

    await expect(
      modifyWithEditor(
        mockParams,
        mockModifyContext,
        DEFAULT_GUI_EDITOR,
        abortSignal,
      ),
    ).rejects.toThrow('Editor failed to open');

    expect(writeSpy).toHaveBeenCalledTimes(2);
    const oldFilePath = writeSpy.mock.calls[0][0] as string;
    const newFilePath = writeSpy.mock.calls[1][0] as string;

    await expect(fsp.access(oldFilePath)).rejects.toThrow();
    await expect(fsp.access(newFilePath)).rejects.toThrow();

    writeSpy.mockRestore();
  });

  it('should handle temp file cleanup errors gracefully', async () => {
    const consoleErrorSpy = vi
      .spyOn(debugLogger, 'error')
      .mockImplementation(() => {});
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw new Error('Failed to delete file');
    });
    vi.spyOn(fs, 'rmdirSync').mockImplementation(() => {
      throw new Error('Failed to delete directory');
    });

    await modifyWithEditor(
      mockParams,
      mockModifyContext,
      DEFAULT_GUI_EDITOR,
      abortSignal,
    );

    expect(consoleErrorSpy).toHaveBeenCalledTimes(3);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error deleting temp diff file:'),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error deleting temp diff directory:'),
    );

    consoleErrorSpy.mockRestore();
  });

  it('should create temp files with correct naming with extension', async () => {
    const testFilePath = path.join(
      testProjectDir,
      'subfolder',
      'test-file.txt',
    );
    mockModifyContext.getFilePath = vi.fn().mockReturnValue(testFilePath);

    await modifyWithEditor(
      mockParams,
      mockModifyContext,
      DEFAULT_GUI_EDITOR,
      abortSignal,
    );

    expect(mockOpenDiff).toHaveBeenCalledOnce();
    const [oldFilePath, newFilePath] = mockOpenDiff.mock.calls[0];
    expect(oldFilePath).toMatch(/gemini-cli-modify-test-file-old-\d+\.txt$/);
    expect(newFilePath).toMatch(/gemini-cli-modify-test-file-new-\d+\.txt$/);

    const diffDirPrefix = path.join(os.tmpdir(), 'gemini-cli-tool-modify-');
    expect(path.dirname(oldFilePath).startsWith(diffDirPrefix)).toBe(true);
    expect(path.dirname(newFilePath).startsWith(diffDirPrefix)).toBe(true);
  });

  it('should create temp files with correct naming without extension', async () => {
    const testFilePath = path.join(testProjectDir, 'subfolder', 'test-file');
    mockModifyContext.getFilePath = vi.fn().mockReturnValue(testFilePath);

    await modifyWithEditor(
      mockParams,
      mockModifyContext,
      DEFAULT_GUI_EDITOR,
      abortSignal,
    );

    expect(mockOpenDiff).toHaveBeenCalledOnce();
    const [oldFilePath, newFilePath] = mockOpenDiff.mock.calls[0];
    expect(oldFilePath).toMatch(/gemini-cli-modify-test-file-old-\d+$/);
    expect(newFilePath).toMatch(/gemini-cli-modify-test-file-new-\d+$/);

    const diffDirPrefix = path.join(os.tmpdir(), 'gemini-cli-tool-modify-');
    expect(path.dirname(oldFilePath).startsWith(diffDirPrefix)).toBe(true);
    expect(path.dirname(newFilePath).startsWith(diffDirPrefix)).toBe(true);
  });
});

describe('isModifiableTool', () => {
  it('should return true for objects with getModifyContext method', () => {
    const mockTool = {
      name: 'test-tool',
      getModifyContext: vi.fn(),
    } as unknown as ModifiableDeclarativeTool<TestParams>;

    expect(isModifiableDeclarativeTool(mockTool)).toBe(true);
  });

  it('should return false for objects without getModifyContext method', () => {
    const mockTool = {
      name: 'test-tool',
    } as unknown as ModifiableDeclarativeTool<TestParams>;

    expect(isModifiableDeclarativeTool(mockTool)).toBe(false);
  });
});
