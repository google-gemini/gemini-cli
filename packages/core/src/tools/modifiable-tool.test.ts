/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  modifyWithEditor,
  ModifyContext,
  ModifiableDeclarativeTool,
  isModifiableDeclarativeTool,
} from './modifiable-tool.js';
import { EditorType } from '../utils/editor.js';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import * as path from 'path';

// Mock dependencies
const mockOpenDiff = vi.hoisted(() => vi.fn());
const mockCreatePatch = vi.hoisted(() => vi.fn());

vi.mock('../utils/editor.js', () => ({
  openDiff: mockOpenDiff,
}));

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
    const diffDir = path.join(os.tmpdir(), 'gemini-cli-tool-modify-diffs');
    await fsp.rm(diffDir, { recursive: true, force: true });
  });

  describe('successful modification', () => {
    it('should successfully modify content with VSCode editor', async () => {
      const result = await modifyWithEditor(
        mockParams,
        mockModifyContext,
        'vscode' as EditorType,
        abortSignal,
        vi.fn(),
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

    it('should create temp directory if it does not exist', async () => {
      const diffDir = path.join(os.tmpdir(), 'gemini-cli-tool-modify-diffs');
      await fsp.rm(diffDir, { recursive: true, force: true }).catch(() => {});

      await modifyWithEditor(
        mockParams,
        mockModifyContext,
        'vscode' as EditorType,
        abortSignal,
        vi.fn(),
      );

      const stats = await fsp.stat(diffDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should not create temp directory if it already exists', async () => {
      const diffDir = path.join(os.tmpdir(), 'gemini-cli-tool-modify-diffs');
      await fsp.mkdir(diffDir, { recursive: true });

      const mkdirSpy = vi.spyOn(fs, 'mkdirSync');

      await modifyWithEditor(
        mockParams,
        mockModifyContext,
        'vscode' as EditorType,
        abortSignal,
        vi.fn(),
      );

      expect(mkdirSpy).not.toHaveBeenCalled();
      mkdirSpy.mockRestore();
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
      'vscode' as EditorType,
      abortSignal,
      vi.fn(),
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
      'vscode' as EditorType,
      abortSignal,
      vi.fn(),
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

  it('should clean up temp files even if editor fails', async () => {
    const editorError = new Error('Editor failed to open');
    mockOpenDiff.mockRejectedValue(editorError);

    const writeSpy = vi.spyOn(fs, 'writeFileSync');

    await expect(
      modifyWithEditor(
        mockParams,
        mockModifyContext,
        'vscode' as EditorType,
        abortSignal,
        vi.fn(),
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
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw new Error('Failed to delete file');
    });

    await modifyWithEditor(
      mockParams,
      mockModifyContext,
      'vscode' as EditorType,
      abortSignal,
      vi.fn(),
    );

    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error deleting temp diff file:'),
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
      'vscode' as EditorType,
      abortSignal,
      vi.fn(),
    );

    expect(mockOpenDiff).toHaveBeenCalledOnce();
    const [oldFilePath, newFilePath] = mockOpenDiff.mock.calls[0];
    expect(oldFilePath).toMatch(/gemini-cli-modify-test-file-old-\d+\.txt$/);
    expect(newFilePath).toMatch(/gemini-cli-modify-test-file-new-\d+\.txt$/);

    const diffDir = path.join(os.tmpdir(), 'gemini-cli-tool-modify-diffs');
    expect(path.dirname(oldFilePath)).toBe(diffDir);
    expect(path.dirname(newFilePath)).toBe(diffDir);
  });

  it('should create temp files with correct naming without extension', async () => {
    const testFilePath = path.join(testProjectDir, 'subfolder', 'test-file');
    mockModifyContext.getFilePath = vi.fn().mockReturnValue(testFilePath);

    await modifyWithEditor(
      mockParams,
      mockModifyContext,
      'vscode' as EditorType,
      abortSignal,
      vi.fn(),
    );

    expect(mockOpenDiff).toHaveBeenCalledOnce();
    const [oldFilePath, newFilePath] = mockOpenDiff.mock.calls[0];
    expect(oldFilePath).toMatch(/gemini-cli-modify-test-file-old-\d+$/);
    expect(newFilePath).toMatch(/gemini-cli-modify-test-file-new-\d+$/);

    const diffDir = path.join(os.tmpdir(), 'gemini-cli-tool-modify-diffs');
    expect(path.dirname(oldFilePath)).toBe(diffDir);
    expect(path.dirname(newFilePath)).toBe(diffDir);
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
