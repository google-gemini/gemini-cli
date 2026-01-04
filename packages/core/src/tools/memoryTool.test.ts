/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Mock } from 'vitest';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MemoryTool,
  setGeminiMdFilename,
  getCurrentGeminiMdFilename,
  getAllGeminiMdFilenames,
  DEFAULT_CONTEXT_FILENAME,
  getMemoryFilePath,
  type SaveMemoryParams,
} from './memoryTool.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ToolConfirmationOutcome } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { GEMINI_DIR, tildeifyPath } from '../utils/paths.js';
import type { Config } from '../config/config.js';

// Mock dependencies
vi.mock(import('node:fs/promises'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    mkdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  };
});

vi.mock('../config/storage.js', () => ({
  Storage: {
    getGlobalGeminiDir: vi.fn(() => path.join('/mock', 'home', GEMINI_DIR)),
  },
}));

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
}));

vi.mock('os');

const MEMORY_SECTION_HEADER = '## Gemini Added Memories';

// Define a type for our fsAdapter to ensure consistency
interface FsAdapter {
  readFile: (path: string, encoding: 'utf-8') => Promise<string>;
  writeFile: (path: string, data: string, encoding: 'utf-8') => Promise<void>;
  mkdir: (
    path: string,
    options: { recursive: boolean },
  ) => Promise<string | undefined>;
}

describe('MemoryTool', () => {
  const mockAbortSignal = new AbortController().signal;
  let mockConfig: Config;
  let mockProjectRoot: string;
  let mockGlobalGeminiDir: string;

  const mockFsAdapter: {
    readFile: Mock<FsAdapter['readFile']>;
    writeFile: Mock<FsAdapter['writeFile']>;
    mkdir: Mock<FsAdapter['mkdir']>;
  } = {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue(path.join('/mock', 'home'));
    mockFsAdapter.readFile.mockReset();
    mockFsAdapter.writeFile.mockReset().mockResolvedValue(undefined);
    mockFsAdapter.mkdir
      .mockReset()
      .mockResolvedValue(undefined as string | undefined);

    mockProjectRoot = path.join('/mock', 'project');
    mockGlobalGeminiDir = path.join('/mock', 'home', GEMINI_DIR);

    mockConfig = {
      getProjectRoot: vi.fn(() => mockProjectRoot),
    } as unknown as Config;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Reset GEMINI_MD_FILENAME to its original value after each test
    setGeminiMdFilename(DEFAULT_CONTEXT_FILENAME);
  });

  describe('setGeminiMdFilename', () => {
    it('should update currentGeminiMdFilename when a valid new name is provided', () => {
      const newName = 'CUSTOM_CONTEXT.md';
      setGeminiMdFilename(newName);
      expect(getCurrentGeminiMdFilename()).toBe(newName);
    });

    it('should not update currentGeminiMdFilename if the new name is empty or whitespace', () => {
      const initialName = getCurrentGeminiMdFilename(); // Get current before trying to change
      setGeminiMdFilename('  ');
      expect(getCurrentGeminiMdFilename()).toBe(initialName);

      setGeminiMdFilename('');
      expect(getCurrentGeminiMdFilename()).toBe(initialName);
    });

    it('should handle an array of filenames', () => {
      const newNames = ['CUSTOM_CONTEXT.md', 'ANOTHER_CONTEXT.md'];
      setGeminiMdFilename(newNames);
      expect(getCurrentGeminiMdFilename()).toBe('CUSTOM_CONTEXT.md');
      expect(getAllGeminiMdFilenames()).toEqual(newNames);
    });
  });

  describe('performAddMemoryEntry (static method)', () => {
    let testFilePath: string;

    beforeEach(() => {
      testFilePath = path.join(
        os.homedir(),
        GEMINI_DIR,
        DEFAULT_CONTEXT_FILENAME,
      );
    });

    it('should create section and save a fact if file does not exist', async () => {
      mockFsAdapter.readFile.mockRejectedValue({ code: 'ENOENT' }); // Simulate file not found
      const fact = 'The sky is blue';
      await MemoryTool.performAddMemoryEntry(fact, testFilePath, mockFsAdapter);

      expect(mockFsAdapter.mkdir).toHaveBeenCalledWith(
        path.dirname(testFilePath),
        {
          recursive: true,
        },
      );
      expect(mockFsAdapter.writeFile).toHaveBeenCalledOnce();
      const writeFileCall = mockFsAdapter.writeFile.mock.calls[0];
      expect(writeFileCall[0]).toBe(testFilePath);
      const expectedContent = `${MEMORY_SECTION_HEADER}\n- ${fact}\n`;
      expect(writeFileCall[1]).toBe(expectedContent);
      expect(writeFileCall[2]).toBe('utf-8');
    });

    it('should create section and save a fact if file is empty', async () => {
      mockFsAdapter.readFile.mockResolvedValue(''); // Simulate empty file
      const fact = 'The sky is blue';
      await MemoryTool.performAddMemoryEntry(fact, testFilePath, mockFsAdapter);
      const writeFileCall = mockFsAdapter.writeFile.mock.calls[0];
      const expectedContent = `${MEMORY_SECTION_HEADER}\n- ${fact}\n`;
      expect(writeFileCall[1]).toBe(expectedContent);
    });

    it('should add a fact to an existing section', async () => {
      const initialContent = `Some preamble.\n\n${MEMORY_SECTION_HEADER}\n- Existing fact 1\n`;
      mockFsAdapter.readFile.mockResolvedValue(initialContent);
      const fact = 'New fact 2';
      await MemoryTool.performAddMemoryEntry(fact, testFilePath, mockFsAdapter);

      expect(mockFsAdapter.writeFile).toHaveBeenCalledOnce();
      const writeFileCall = mockFsAdapter.writeFile.mock.calls[0];
      const expectedContent = `Some preamble.\n\n${MEMORY_SECTION_HEADER}\n- Existing fact 1\n- ${fact}\n`;
      expect(writeFileCall[1]).toBe(expectedContent);
    });

    it('should add a fact to an existing empty section', async () => {
      const initialContent = `Some preamble.\n\n${MEMORY_SECTION_HEADER}\n`; // Empty section
      mockFsAdapter.readFile.mockResolvedValue(initialContent);
      const fact = 'First fact in section';
      await MemoryTool.performAddMemoryEntry(fact, testFilePath, mockFsAdapter);

      expect(mockFsAdapter.writeFile).toHaveBeenCalledOnce();
      const writeFileCall = mockFsAdapter.writeFile.mock.calls[0];
      const expectedContent = `Some preamble.\n\n${MEMORY_SECTION_HEADER}\n- ${fact}\n`;
      expect(writeFileCall[1]).toBe(expectedContent);
    });

    it('should add a fact when other ## sections exist and preserve spacing', async () => {
      const initialContent = `${MEMORY_SECTION_HEADER}\n- Fact 1\n\n## Another Section\nSome other text.`;
      mockFsAdapter.readFile.mockResolvedValue(initialContent);
      const fact = 'Fact 2';
      await MemoryTool.performAddMemoryEntry(fact, testFilePath, mockFsAdapter);

      expect(mockFsAdapter.writeFile).toHaveBeenCalledOnce();
      const writeFileCall = mockFsAdapter.writeFile.mock.calls[0];
      // Note: The implementation ensures a single newline at the end if content exists.
      const expectedContent = `${MEMORY_SECTION_HEADER}\n- Fact 1\n- ${fact}\n\n## Another Section\nSome other text.\n`;
      expect(writeFileCall[1]).toBe(expectedContent);
    });

    it('should correctly trim and add a fact that starts with a dash', async () => {
      mockFsAdapter.readFile.mockResolvedValue(`${MEMORY_SECTION_HEADER}\n`);
      const fact = '- - My fact with dashes';
      await MemoryTool.performAddMemoryEntry(fact, testFilePath, mockFsAdapter);
      const writeFileCall = mockFsAdapter.writeFile.mock.calls[0];
      const expectedContent = `${MEMORY_SECTION_HEADER}\n- My fact with dashes\n`;
      expect(writeFileCall[1]).toBe(expectedContent);
    });

    it('should handle error from fsAdapter.writeFile', async () => {
      mockFsAdapter.readFile.mockResolvedValue('');
      mockFsAdapter.writeFile.mockRejectedValue(new Error('Disk full'));
      const fact = 'This will fail';
      await expect(
        MemoryTool.performAddMemoryEntry(fact, testFilePath, mockFsAdapter),
      ).rejects.toThrow('[MemoryTool] Failed to add memory entry: Disk full');
    });
  });

  describe('execute (instance method)', () => {
    let memoryTool: MemoryTool;
    let performAddMemoryEntrySpy: Mock<typeof MemoryTool.performAddMemoryEntry>;

    beforeEach(() => {
      memoryTool = new MemoryTool(mockConfig);
      // Spy on the static method for these tests
      performAddMemoryEntrySpy = vi
        .spyOn(MemoryTool, 'performAddMemoryEntry')
        .mockResolvedValue(undefined) as Mock<
        typeof MemoryTool.performAddMemoryEntry
      >;
      // Cast needed as spyOn returns MockInstance
    });

    it('should have correct name, displayName, description, and schema', () => {
      expect(memoryTool.name).toBe('save_memory');
      expect(memoryTool.displayName).toBe('SaveMemory');
      expect(memoryTool.description).toContain(
        'Saves a specific piece of information',
      );
      expect(memoryTool.schema).toBeDefined();
      expect(memoryTool.schema.name).toBe('save_memory');
      expect(memoryTool.schema.parametersJsonSchema).toStrictEqual({
        type: 'object',
        properties: {
          fact: {
            type: 'string',
            description:
              'The specific fact or piece of information to remember. Should be a clear, self-contained statement.',
          },
          scope: {
            type: 'string',
            enum: ['project', 'global'],
            description:
              "The scope of the memory. 'project' saves to the current project's context and is the default. Use 'global' when the user specifically intends the memory to be global or the rule transcends the current project scope.",
          },
        },
        required: ['fact'],
      });
    });

    it('should call performAddMemoryEntry with correct parameters and return success (default scope)', async () => {
      const params = { fact: 'The sky is blue' };
      const invocation = memoryTool.build(params);
      const expectedFilePath = path.join(
        mockProjectRoot,
        getCurrentGeminiMdFilename(),
      );
      const result = await invocation.execute(mockAbortSignal);

      const expectedFsArgument = {
        readFile: fs.readFile,
        writeFile: fs.writeFile,
        mkdir: fs.mkdir,
      };

      expect(performAddMemoryEntrySpy).toHaveBeenCalledWith(
        params.fact,
        expectedFilePath,
        expectedFsArgument,
      );
      const successMessage = `Okay, I've remembered that: "${params.fact}"`;
      expect(result.llmContent).toBe(
        JSON.stringify({ success: true, message: successMessage }),
      );
      expect(result.returnDisplay).toBe(successMessage);
    });

    it('should call performAddMemoryEntry with global scope when specified', async () => {
      const params: SaveMemoryParams = {
        fact: 'A global fact',
        scope: 'global',
      };
      const invocation = memoryTool.build(params);
      const expectedFilePath = path.join(
        mockGlobalGeminiDir,
        getCurrentGeminiMdFilename(),
      );
      const result = await invocation.execute(mockAbortSignal);

      const expectedFsArgument = {
        readFile: fs.readFile,
        writeFile: fs.writeFile,
        mkdir: fs.mkdir,
      };

      expect(performAddMemoryEntrySpy).toHaveBeenCalledWith(
        params.fact,
        expectedFilePath,
        expectedFsArgument,
      );
      const successMessage = `Okay, I've remembered that: "${params.fact}"`;
      expect(result.llmContent).toBe(
        JSON.stringify({ success: true, message: successMessage }),
      );
      expect(result.returnDisplay).toBe(successMessage);
    });

    it('should call performAddMemoryEntry with project scope when specified', async () => {
      const params: SaveMemoryParams = {
        fact: 'A project fact',
        scope: 'project',
      };
      const invocation = memoryTool.build(params);
      const expectedFilePath = path.join(
        mockProjectRoot,
        getCurrentGeminiMdFilename(),
      );
      const result = await invocation.execute(mockAbortSignal);

      const expectedFsArgument = {
        readFile: fs.readFile,
        writeFile: fs.writeFile,
        mkdir: fs.mkdir,
      };

      expect(performAddMemoryEntrySpy).toHaveBeenCalledWith(
        params.fact,
        expectedFilePath,
        expectedFsArgument,
      );
      const successMessage = `Okay, I've remembered that: "${params.fact}"`;
      expect(result.llmContent).toBe(
        JSON.stringify({ success: true, message: successMessage }),
      );
      expect(result.returnDisplay).toBe(successMessage);
    });

    it('should call performAddMemoryEntry with global scope when no project root is configured', async () => {
      vi.mocked(mockConfig.getProjectRoot).mockReturnValue(''); // No project root
      const params = { fact: 'A fact without project' };
      const invocation = memoryTool.build(params);
      const expectedFilePath = path.join(
        mockGlobalGeminiDir,
        getCurrentGeminiMdFilename(),
      );
      const result = await invocation.execute(mockAbortSignal);

      const expectedFsArgument = {
        readFile: fs.readFile,
        writeFile: fs.writeFile,
        mkdir: fs.mkdir,
      };

      expect(performAddMemoryEntrySpy).toHaveBeenCalledWith(
        params.fact,
        expectedFilePath,
        expectedFsArgument,
      );
      const successMessage = `Okay, I've remembered that: "${params.fact}"`;
      expect(result.llmContent).toBe(
        JSON.stringify({ success: true, message: successMessage }),
      );
      expect(result.returnDisplay).toBe(successMessage);
    });

    it('should return an error if fact is empty', async () => {
      const params = { fact: ' ' }; // Empty fact
      expect(memoryTool.validateToolParams(params)).toBe(
        'Parameter "fact" must be a non-empty string.',
      );
      expect(() => memoryTool.build(params)).toThrow(
        'Parameter "fact" must be a non-empty string.',
      );
    });

    it('should handle errors from performAddMemoryEntry', async () => {
      const params = { fact: 'This will fail' };
      const underlyingError = new Error(
        '[MemoryTool] Failed to add memory entry: Disk full',
      );
      performAddMemoryEntrySpy.mockRejectedValue(underlyingError);

      const invocation = memoryTool.build(params);
      const result = await invocation.execute(mockAbortSignal);

      expect(result.llmContent).toBe(
        JSON.stringify({
          success: false,
          error: `Failed to save memory. Detail: ${underlyingError.message}`,
        }),
      );
      expect(result.returnDisplay).toBe(
        `Error saving memory: ${underlyingError.message}`,
      );
      expect(result.error?.type).toBe(
        ToolErrorType.MEMORY_TOOL_EXECUTION_ERROR,
      );
    });
  });

  describe('shouldConfirmExecute', () => {
    let memoryTool: MemoryTool;

    beforeEach(() => {
      memoryTool = new MemoryTool(mockConfig); // Pass mockConfig
      // Clear the allowlist before each test
      const invocation = memoryTool.build({ fact: 'mock-fact' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (invocation.constructor as any).allowlist.clear();
      // Mock fs.readFile to return empty string (file doesn't exist)
      vi.mocked(fs.readFile).mockResolvedValue('');
    });

    it('should return confirmation details when memory file is not allowlisted', async () => {
      const params: SaveMemoryParams = { fact: 'Test fact' };
      const invocation = memoryTool.build(params);
      const result = await invocation.shouldConfirmExecute(mockAbortSignal);

      expect(result).toBeDefined();
      expect(result).not.toBe(false);

      if (result && result.type === 'edit') {
        const expectedPath = path.join(
          mockProjectRoot,
          getCurrentGeminiMdFilename(),
        );
        const expectedDisplayPath = tildeifyPath(expectedPath);
        expect(result.title).toBe(
          `Confirm Memory Save: ${expectedDisplayPath}`,
        );
        expect(result.fileName).toContain(path.join('mock', 'project'));
        expect(result.fileName).toContain('GEMINI.md');
        expect(result.fileDiff).toContain('Index: GEMINI.md');
        expect(result.fileDiff).toContain('+## Gemini Added Memories');
        expect(result.fileDiff).toContain('+- Test fact');
        expect(result.originalContent).toBe('');
        expect(result.newContent).toContain('## Gemini Added Memories');
        expect(result.newContent).toContain('- Test fact');
      }
    });

    it('should return false when memory file is already allowlisted', async () => {
      const params: SaveMemoryParams = { fact: 'Test fact' };
      const memoryFilePath = getMemoryFilePath(mockConfig, params.scope);

      const invocation = memoryTool.build(params);
      // Add the memory file to the allowlist
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (invocation.constructor as any).allowlist.add(memoryFilePath);

      const result = await invocation.shouldConfirmExecute(mockAbortSignal);

      expect(result).toBe(false);
    });

    it('should add memory file to allowlist when ProceedAlways is confirmed', async () => {
      const params: SaveMemoryParams = { fact: 'Test fact' };
      const memoryFilePath = getMemoryFilePath(mockConfig, params.scope);

      const invocation = memoryTool.build(params);
      const result = await invocation.shouldConfirmExecute(mockAbortSignal);

      expect(result).toBeDefined();
      expect(result).not.toBe(false);

      if (result && result.type === 'edit') {
        // Simulate the onConfirm callback
        await result.onConfirm(ToolConfirmationOutcome.ProceedAlways);

        // Check that the memory file was added to the allowlist
        expect(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (invocation.constructor as any).allowlist.has(memoryFilePath),
        ).toBe(true);
      }
    });

    it('should not add memory file to allowlist when other outcomes are confirmed', async () => {
      const params: SaveMemoryParams = { fact: 'Test fact' };
      const memoryFilePath = getMemoryFilePath(mockConfig, params.scope);

      const invocation = memoryTool.build(params);
      const result = await invocation.shouldConfirmExecute(mockAbortSignal);

      expect(result).toBeDefined();
      expect(result).not.toBe(false);

      if (result && result.type === 'edit') {
        // Simulate the onConfirm callback with different outcomes
        await result.onConfirm(ToolConfirmationOutcome.ProceedOnce);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allowlist = (invocation.constructor as any).allowlist;
        expect(allowlist.has(memoryFilePath)).toBe(false);

        await result.onConfirm(ToolConfirmationOutcome.Cancel);
        expect(allowlist.has(memoryFilePath)).toBe(false);
      }
    });

    it('should handle existing memory file with content', async () => {
      const params = { fact: 'New fact' };
      const existingContent =
        'Some existing content.\n\n## Gemini Added Memories\n- Old fact\n';

      // Mock fs.readFile to return existing content
      vi.mocked(fs.readFile).mockResolvedValue(existingContent);

      const invocation = memoryTool.build(params);
      const result = await invocation.shouldConfirmExecute(mockAbortSignal);

      expect(result).toBeDefined();
      expect(result).not.toBe(false);

      if (result && result.type === 'edit') {
        const expectedPath = path.join(
          mockProjectRoot,
          getCurrentGeminiMdFilename(),
        );
        const expectedDisplayPath = tildeifyPath(expectedPath);
        expect(result.title).toBe(
          `Confirm Memory Save: ${expectedDisplayPath}`,
        );
        expect(result.fileDiff).toContain('Index: GEMINI.md');
        expect(result.fileDiff).toContain('+- New fact');
        expect(result.originalContent).toBe(existingContent);
        expect(result.newContent).toContain('- Old fact');
        expect(result.newContent).toContain('- New fact');
      }
    });
  });
});
