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
  MemoryToolInvocation,
} from './memoryTool.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ToolConfirmationOutcome } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import type { PermissionRepository } from '../permissions/PermissionRepository.js';

// Mock dependencies
vi.mock(import('node:fs/promises'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    mkdir: vi.fn(),
    readFile: vi.fn(),
  };
});

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
        '.gemini',
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
      const mockPermissionRepo: PermissionRepository = {
        isAllowed: vi.fn().mockResolvedValue(false),
        grant: vi.fn().mockResolvedValue(undefined),
        revoke: vi.fn().mockResolvedValue(undefined),
        revokeAllForTool: vi.fn().mockResolvedValue(undefined),
        revokeAll: vi.fn().mockResolvedValue(undefined),
        getAllGranted: vi.fn().mockResolvedValue(new Map()),
      };
      memoryTool = new MemoryTool(mockPermissionRepo);
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
      expect(memoryTool.displayName).toBe('Save Memory');
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
        },
        required: ['fact'],
      });
    });

    it('should call performAddMemoryEntry with correct parameters and return success', async () => {
      const params = { fact: 'The sky is blue' };
      const invocation = memoryTool.build(params);
      const result = await invocation.execute(mockAbortSignal);
      // Use getCurrentGeminiMdFilename for the default expectation before any setGeminiMdFilename calls in a test
      const expectedFilePath = path.join(
        os.homedir(),
        '.gemini',
        getCurrentGeminiMdFilename(), // This will be DEFAULT_CONTEXT_FILENAME unless changed by a test
      );

      // For this test, we expect the actual fs methods to be passed
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
      const mockPermissionRepo: PermissionRepository = {
        isAllowed: vi.fn().mockResolvedValue(false),
        grant: vi.fn().mockResolvedValue(undefined),
        revoke: vi.fn().mockResolvedValue(undefined),
        revokeAllForTool: vi.fn().mockResolvedValue(undefined),
        revokeAll: vi.fn().mockResolvedValue(undefined),
        getAllGranted: vi.fn().mockResolvedValue(new Map()),
      };
      memoryTool = new MemoryTool(mockPermissionRepo);
      // Mock fs.readFile to return empty string (file doesn't exist)
      vi.mocked(fs.readFile).mockResolvedValue('');
    });

    it('should return confirmation details when memory file is not allowlisted', async () => {
      const params = { fact: 'Test fact' };
      const invocation = memoryTool.build(params);
      const result = await invocation.shouldConfirmExecute(mockAbortSignal);

      expect(result).toBeDefined();
      expect(result).not.toBe(false);

      if (result && result.type === 'edit') {
        const expectedPath = path.join('~', '.gemini', 'GEMINI.md');
        expect(result.title).toBe(`Confirm Memory Save: ${expectedPath}`);
        expect(result.fileName).toContain(path.join('mock', 'home', '.gemini'));
        expect(result.fileName).toContain('GEMINI.md');
        expect(result.fileDiff).toContain('Index: GEMINI.md');
        expect(result.fileDiff).toContain('+## Gemini Added Memories');
        expect(result.fileDiff).toContain('+- Test fact');
        expect(result.originalContent).toBe('');
        expect(result.newContent).toContain('## Gemini Added Memories');
        expect(result.newContent).toContain('- Test fact');
      }
    });

    it('should return false when memory file is already allowed', async () => {
      const params = { fact: 'Test fact' };

      const mockPermissionRepo: PermissionRepository = {
        isAllowed: vi.fn().mockResolvedValue(true), // Return true for allowed
        grant: vi.fn().mockResolvedValue(undefined),
        revoke: vi.fn().mockResolvedValue(undefined),
        revokeAllForTool: vi.fn().mockResolvedValue(undefined),
        revokeAll: vi.fn().mockResolvedValue(undefined),
        getAllGranted: vi.fn().mockResolvedValue(new Map()),
      };

      memoryTool = new MemoryTool(mockPermissionRepo);
      const invocation = memoryTool.build(params);

      const result = await invocation.shouldConfirmExecute(mockAbortSignal);

      expect(result).toBe(false);
    });

    it('should grant permission when ProceedAlways is confirmed', async () => {
      const params = { fact: 'Test fact' };
      const memoryFilePath = path.join(
        os.homedir(),
        '.gemini',
        getCurrentGeminiMdFilename(),
      );

      const mockGrantFn = vi.fn().mockResolvedValue(undefined);
      const mockPermissionRepo: PermissionRepository = {
        isAllowed: vi.fn().mockResolvedValue(false),
        grant: mockGrantFn,
        revoke: vi.fn().mockResolvedValue(undefined),
        revokeAllForTool: vi.fn().mockResolvedValue(undefined),
        revokeAll: vi.fn().mockResolvedValue(undefined),
        getAllGranted: vi.fn().mockResolvedValue(new Map()),
      };

      memoryTool = new MemoryTool(mockPermissionRepo);
      const invocation = memoryTool.build(params);
      const result = await invocation.shouldConfirmExecute(mockAbortSignal);

      expect(result).toBeDefined();
      expect(result).not.toBe(false);

      if (result && result.type === 'edit') {
        // Simulate the onConfirm callback
        await result.onConfirm(ToolConfirmationOutcome.ProceedAlways);

        // Check that the permission was granted
        expect(mockGrantFn).toHaveBeenCalledWith('memory', memoryFilePath);
      }
    });

    it('should not grant permission when other outcomes are confirmed', async () => {
      const params = { fact: 'Test fact' };

      const mockGrantFn = vi.fn().mockResolvedValue(undefined);
      const mockPermissionRepo: PermissionRepository = {
        isAllowed: vi.fn().mockResolvedValue(false),
        grant: mockGrantFn,
        revoke: vi.fn().mockResolvedValue(undefined),
        revokeAllForTool: vi.fn().mockResolvedValue(undefined),
        revokeAll: vi.fn().mockResolvedValue(undefined),
        getAllGranted: vi.fn().mockResolvedValue(new Map()),
      };

      memoryTool = new MemoryTool(mockPermissionRepo);
      const invocation = memoryTool.build(params);
      const result = await invocation.shouldConfirmExecute(mockAbortSignal);

      expect(result).toBeDefined();
      expect(result).not.toBe(false);

      if (result && result.type === 'edit') {
        // Simulate the onConfirm callback with different outcomes
        await result.onConfirm(ToolConfirmationOutcome.ProceedOnce);
        expect(mockGrantFn).not.toHaveBeenCalled();

        await result.onConfirm(ToolConfirmationOutcome.Cancel);
        expect(mockGrantFn).not.toHaveBeenCalled();
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
        const expectedPath = path.join('~', '.gemini', 'GEMINI.md');
        expect(result.title).toBe(`Confirm Memory Save: ${expectedPath}`);
        expect(result.fileDiff).toContain('Index: GEMINI.md');
        expect(result.fileDiff).toContain('+- New fact');
        expect(result.originalContent).toBe(existingContent);
        expect(result.newContent).toContain('- Old fact');
        expect(result.newContent).toContain('- New fact');
      }
    });
  });

  describe('MemoryToolInvocation static permission management methods', () => {
    let mockPermissionRepo: PermissionRepository;

    beforeEach(() => {
      // Set up mock permission repository
      mockPermissionRepo = {
        isAllowed: vi.fn().mockResolvedValue(false),
        grant: vi.fn().mockResolvedValue(undefined),
        revoke: vi.fn().mockResolvedValue(undefined),
        revokeAllForTool: vi.fn().mockResolvedValue(undefined),
        revokeAll: vi.fn().mockResolvedValue(undefined),
        getAllGranted: vi.fn().mockResolvedValue(new Map()),
      };

      // Set the static permission repository for the tests
      MemoryToolInvocation.setPermissionRepository(mockPermissionRepo);
    });

    afterEach(() => {
      // Clean up after each test - not needed as each test sets up its own mock
    });

    it('should start with empty memory permissions', async () => {
      const permissions =
        await MemoryToolInvocation.getAllowedMemoryPermissions();
      expect(permissions).toEqual([]);
    });

    it('should return array of allowed memory permissions', async () => {
      // Test that the method returns an array (even if empty)
      const permissions =
        await MemoryToolInvocation.getAllowedMemoryPermissions();
      expect(Array.isArray(permissions)).toBe(true);
    });

    it('should handle revoking permissions gracefully', async () => {
      // Test that revoking non-existent permissions doesn't throw
      await expect(
        MemoryToolInvocation.revokeMemoryPermission('save_memory'),
      ).resolves.not.toThrow();

      expect(mockPermissionRepo.revoke).toHaveBeenCalledWith(
        'memory',
        'save_memory',
      );
    });

    it('should clear all memory permissions', async () => {
      // Clear all permissions should work regardless of current state
      await MemoryToolInvocation.clearAllMemoryPermissions();

      // Verify revokeAllForTool was called
      expect(mockPermissionRepo.revokeAllForTool).toHaveBeenCalledWith(
        'memory',
      );

      // Verify permissions are empty after clearing
      const permissions =
        await MemoryToolInvocation.getAllowedMemoryPermissions();
      expect(permissions).toEqual([]);
    });

    it('should handle revoking non-existent memory permissions gracefully', async () => {
      // Try to revoke a permission that doesn't exist - should not throw
      await MemoryToolInvocation.revokeMemoryPermission(
        'non-existent-permission',
      );

      expect(mockPermissionRepo.revoke).toHaveBeenCalledWith(
        'memory',
        'non-existent-permission',
      );

      // Permissions should still be empty
      const permissions =
        await MemoryToolInvocation.getAllowedMemoryPermissions();
      expect(permissions).toEqual([]);
    });

    it('should handle clearing already empty permissions', async () => {
      // Verify permissions start empty
      let permissions =
        await MemoryToolInvocation.getAllowedMemoryPermissions();
      expect(permissions).toEqual([]);

      // Clear all permissions when already empty - should not throw
      await MemoryToolInvocation.clearAllMemoryPermissions();

      expect(mockPermissionRepo.revokeAllForTool).toHaveBeenCalledWith(
        'memory',
      );

      // Permissions should still be empty
      permissions = await MemoryToolInvocation.getAllowedMemoryPermissions();
      expect(permissions).toEqual([]);
    });

    it('should return consistent array references', async () => {
      const permissions1 =
        await MemoryToolInvocation.getAllowedMemoryPermissions();
      const permissions2 =
        await MemoryToolInvocation.getAllowedMemoryPermissions();

      expect(Array.isArray(permissions1)).toBe(true);
      expect(Array.isArray(permissions2)).toBe(true);
      // They should be separate array instances (not the same reference)
      expect(permissions1).not.toBe(permissions2);
      // But should have the same content
      expect(permissions1).toEqual(permissions2);
    });
  });
});
