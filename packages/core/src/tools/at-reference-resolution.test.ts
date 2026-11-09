/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReadFileTool } from './read-file.js';
import { WriteFileTool, getCorrectedFileContent } from './write-file.js';
import { EditTool } from './edit.js';
import { correctPath } from '../utils/pathCorrector.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import type { Config } from '../config/config.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { StandardFileSystemService } from '../services/fileSystemService.js';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { isSubpath } from '../utils/paths.js';

vi.mock('../telemetry/loggers.js', () => ({
  logFileOperation: vi.fn(),
  logEditStrategy: vi.fn(),
  logEditCorrectionEvent: vi.fn(),
}));

vi.mock('./jit-context.js', () => ({
  discoverJitContext: vi.fn().mockResolvedValue(''),
  appendJitContext: vi.fn().mockImplementation((content) => content),
  appendJitContextToParts: vi.fn().mockImplementation((content) => content),
}));

describe('Consolidated At-Reference Path Resolution Tests (b-495551283)', () => {
  let tempRootDir: string;
  let mockConfigInstance: Config;
  const abortSignal = new AbortController().signal;

  beforeEach(async () => {
    // Create a unique temporary root directory for each test run
    const realTmp = await fsp.realpath(os.tmpdir());
    tempRootDir = await fsp.mkdtemp(
      path.join(realTmp, 'at-ref-resolution-root-'),
    );

    mockConfigInstance = {
      getFileService: () => new FileDiscoveryService(tempRootDir),
      getFileSystemService: () => new StandardFileSystemService(),
      getTargetDir: () => tempRootDir,
      getWorkspaceContext: () => createMockWorkspaceContext(tempRootDir),
      getFileFilteringOptions: () => ({
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      }),
      storage: {
        getProjectTempDir: () => path.join(tempRootDir, '.temp'),
      },
      isInteractive: () => false,
      isPlanMode: () => false,
      getActiveModel: () => undefined,
      getBaseLlmClient: () => undefined,
      getDisableLLMCorrection: () => true,
      isPathAllowed(this: Config, absolutePath: string): boolean {
        const workspaceContext = this.getWorkspaceContext();
        if (workspaceContext.isPathWithinWorkspace(absolutePath)) {
          return true;
        }
        const projectTempDir = this.storage.getProjectTempDir();
        return isSubpath(path.resolve(projectTempDir), absolutePath);
      },
      validatePathAccess(this: Config, absolutePath: string): string | null {
        if (this.isPathAllowed(absolutePath)) {
          return null;
        }
        const workspaceDirs = this.getWorkspaceContext().getDirectories();
        const projectTempDir = this.storage.getProjectTempDir();
        return `Path not in workspace: Attempted path "${absolutePath}" resolves outside the allowed workspace directories: ${workspaceDirs.join(', ')} or the project temp directory: ${projectTempDir}`;
      },
    } as unknown as Config;

    // Create the policies directory and new-policies.txt file
    await fsp.mkdir(path.join(tempRootDir, 'policies'), { recursive: true });
    await fsp.writeFile(
      path.join(tempRootDir, 'policies', 'new-policies.txt'),
      '[[rule]]\ntoolName = "run_shell_command"\ndecision = "allow"\n',
      'utf8',
    );
  });

  afterEach(async () => {
    // Clean up the temporary root directory
    if (fs.existsSync(tempRootDir)) {
      await fsp.rm(tempRootDir, { recursive: true, force: true });
    }
  });

  it('ReadFileTool successfully reads a file when the path is prefixed with @', async () => {
    const readFileTool = new ReadFileTool(
      mockConfigInstance,
      createMockMessageBus(),
    );
    const invocation = readFileTool.build({
      file_path: '@policies/new-policies.txt',
    });

    const result = await invocation.execute({ abortSignal });

    // The tool should succeed because it defensively strips the leading '@'
    expect(result.error).toBeUndefined();
    expect(result.llmContent).toContain('toolName = "run_shell_command"');
  });

  it('ReadFileTool successfully reads a file when the path is prefixed with @/', async () => {
    const readFileTool = new ReadFileTool(
      mockConfigInstance,
      createMockMessageBus(),
    );
    const invocation = readFileTool.build({
      file_path: '@/policies/new-policies.txt',
    });

    const result = await invocation.execute({ abortSignal });

    // The tool should succeed because it defensively strips the leading '@/'
    expect(result.error).toBeUndefined();
    expect(result.llmContent).toContain('toolName = "run_shell_command"');
  });

  it('WriteFileTool successfully writes to/updates a file when the path is prefixed with @', async () => {
    const writeFileTool = new WriteFileTool(
      mockConfigInstance,
      createMockMessageBus(),
    );
    const invocation = writeFileTool.build({
      file_path: '@policies/new-policies.txt',
      content: '[[rule]]\nupdated_content = true\n',
    });

    const result = await invocation.execute({ abortSignal });

    // The tool should succeed and update the correct file
    expect(result.error).toBeUndefined();

    const incorrectFilePath = path.join(
      tempRootDir,
      '@policies',
      'new-policies.txt',
    );
    const correctFilePath = path.join(
      tempRootDir,
      'policies',
      'new-policies.txt',
    );

    // It should NOT have created a literal "@policies" directory
    expect(fs.existsSync(incorrectFilePath)).toBe(false);

    // It should have updated the correct file under "policies"
    const updatedContent = await fsp.readFile(correctFilePath, 'utf8');
    expect(updatedContent).toContain('updated_content = true');
  });

  it('WriteFileTool successfully creates a new file when the path is prefixed with @ and the parent directory exists', async () => {
    const writeFileTool = new WriteFileTool(
      mockConfigInstance,
      createMockMessageBus(),
    );
    const invocation = writeFileTool.build({
      file_path: '@policies/brand-new-file.txt',
      content: '[[rule]]\nbrand_new_file = true\n',
    });

    const result = await invocation.execute({ abortSignal });

    // The tool should succeed and create the correct file
    expect(result.error).toBeUndefined();

    const incorrectFilePath = path.join(
      tempRootDir,
      '@policies',
      'brand-new-file.txt',
    );
    const correctFilePath = path.join(
      tempRootDir,
      'policies',
      'brand-new-file.txt',
    );

    // It should NOT have created a literal "@policies" directory
    expect(fs.existsSync(incorrectFilePath)).toBe(false);

    // It should have created the correct file under "policies"
    const createdContent = await fsp.readFile(correctFilePath, 'utf8');
    expect(createdContent).toContain('brand_new_file = true');
  });

  it('WriteFileTool successfully creates a new file in a nested subdirectory when the path is prefixed with @ and the first segment exists', async () => {
    const writeFileTool = new WriteFileTool(
      mockConfigInstance,
      createMockMessageBus(),
    );
    const invocation = writeFileTool.build({
      file_path: '@policies/sub/brand-new-file.txt',
      content: '[[rule]]\nnested_brand_new_file = true\n',
    });

    const result = await invocation.execute({ abortSignal });

    // The tool should succeed and create the correct file
    expect(result.error).toBeUndefined();

    const incorrectFilePath = path.join(
      tempRootDir,
      '@policies',
      'sub',
      'brand-new-file.txt',
    );
    const correctFilePath = path.join(
      tempRootDir,
      'policies',
      'sub',
      'brand-new-file.txt',
    );

    // It should NOT have created a literal "@policies" directory
    expect(fs.existsSync(incorrectFilePath)).toBe(false);

    // It should have created the correct file under "policies/sub"
    const createdContent = await fsp.readFile(correctFilePath, 'utf8');
    expect(createdContent).toContain('nested_brand_new_file = true');
  });

  it('WriteFileTool successfully creates a new file in a nested subdirectory when the path is prefixed with @ and the first segment does NOT exist', async () => {
    const writeFileTool = new WriteFileTool(
      mockConfigInstance,
      createMockMessageBus(),
    );
    const invocation = writeFileTool.build({
      file_path: '@new-policies/sub/brand-new-file.txt',
      content: '[[rule]]\nnested_brand_new_file = true\n',
    });

    const result = await invocation.execute({ abortSignal });

    // The tool should succeed and create the correct file
    expect(result.error).toBeUndefined();

    const incorrectFilePath = path.join(
      tempRootDir,
      '@new-policies',
      'sub',
      'brand-new-file.txt',
    );
    const correctFilePath = path.join(
      tempRootDir,
      'new-policies',
      'sub',
      'brand-new-file.txt',
    );

    // It should NOT have created a literal "@new-policies" directory
    expect(fs.existsSync(incorrectFilePath)).toBe(false);

    // It SHOULD have created the file under "new-policies/sub"
    expect(fs.existsSync(correctFilePath)).toBe(true);

    // Verify the content of the created file
    const createdContent = await fsp.readFile(correctFilePath, 'utf8');
    expect(createdContent).toContain('nested_brand_new_file = true');
  });

  it('WriteFileTool successfully creates a new file in a nested subdirectory when the path is prefixed with @/ and the first segment does NOT exist', async () => {
    const writeFileTool = new WriteFileTool(
      mockConfigInstance,
      createMockMessageBus(),
    );
    const invocation = writeFileTool.build({
      file_path: '@/new-policies-alias/sub/brand-new-file.txt',
      content: '[[rule]]\nnested_brand_new_file_alias = true\n',
    });

    const result = await invocation.execute({ abortSignal });

    // The tool should succeed and create the correct file
    expect(result.error).toBeUndefined();

    const literalAtFilePath = path.join(
      tempRootDir,
      '@',
      'new-policies-alias',
      'sub',
      'brand-new-file.txt',
    );
    const correctFilePath = path.join(
      tempRootDir,
      'new-policies-alias',
      'sub',
      'brand-new-file.txt',
    );

    // It should NOT have created a literal "@" directory
    expect(fs.existsSync(literalAtFilePath)).toBe(false);
    expect(fs.existsSync(path.join(tempRootDir, '@'))).toBe(false);

    // It should have created the file under "new-policies-alias/sub"
    expect(fs.existsSync(correctFilePath)).toBe(true);

    // Verify the content of the created file
    const createdContent = await fsp.readFile(correctFilePath, 'utf8');
    expect(createdContent).toContain('nested_brand_new_file_alias = true');
  });

  it('WriteFileTool successfully creates a new file in a nested subdirectory when the path is prefixed with @\\ and the first segment does NOT exist', async () => {
    const writeFileTool = new WriteFileTool(
      mockConfigInstance,
      createMockMessageBus(),
    );
    const invocation = writeFileTool.build({
      file_path: '@\\new-policies-alias-win\\sub\\brand-new-file.txt',
      content: '[[rule]]\nnested_brand_new_file_alias_win = true\n',
    });

    const result = await invocation.execute({ abortSignal });

    // The tool should succeed and create the correct file
    expect(result.error).toBeUndefined();

    const isWindows = process.platform === 'win32';
    const literalAtFilePath = isWindows
      ? path.join(
          tempRootDir,
          '@',
          'new-policies-alias-win',
          'sub',
          'brand-new-file.txt',
        )
      : path.join(
          tempRootDir,
          '@\\new-policies-alias-win\\sub\\brand-new-file.txt',
        );
    const correctFilePath = isWindows
      ? path.join(
          tempRootDir,
          'new-policies-alias-win',
          'sub',
          'brand-new-file.txt',
        )
      : path.join(
          tempRootDir,
          'new-policies-alias-win\\sub\\brand-new-file.txt',
        );

    // It should NOT have created a literal "@" directory
    expect(fs.existsSync(literalAtFilePath)).toBe(false);
    expect(fs.existsSync(path.join(tempRootDir, '@'))).toBe(false);

    // It should have created the file under "new-policies-alias-win/sub"
    expect(fs.existsSync(correctFilePath)).toBe(true);

    // Verify the content of the created file
    const createdContent = await fsp.readFile(correctFilePath, 'utf8');
    expect(createdContent).toContain('nested_brand_new_file_alias_win = true');
  });

  it('getCorrectedFileContent blocks path traversal outside the workspace', async () => {
    const result = await getCorrectedFileContent(
      mockConfigInstance,
      '../../etc/passwd',
      'malicious content',
      abortSignal,
    );

    // The utility should fail with a path validation error
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('Path not in workspace');
  });

  it('EditTool.getModifyContext blocks path traversal outside the workspace', async () => {
    const editTool = new EditTool(mockConfigInstance, createMockMessageBus());
    const modifyContext = editTool.getModifyContext(abortSignal);

    // The getCurrentContent method should throw a path validation error
    await expect(
      modifyContext.getCurrentContent({
        file_path: '../../etc/passwd',
        instruction: 'read file',
        old_string: '',
        new_string: '',
      }),
    ).rejects.toThrow('Path not in workspace');

    // The getProposedContent method should throw a path validation error
    await expect(
      modifyContext.getProposedContent({
        file_path: '../../etc/passwd',
        instruction: 'read file',
        old_string: '',
        new_string: '',
      }),
    ).rejects.toThrow('Path not in workspace');
  });

  it('getCorrectedFileContent handles symlink loops gracefully', async () => {
    const symlinkPath1 = path.join(tempRootDir, 'symlink1');
    const symlinkPath2 = path.join(tempRootDir, 'symlink2');
    await fsp.symlink(symlinkPath2, symlinkPath1);
    await fsp.symlink(symlinkPath1, symlinkPath2);

    const result = await getCorrectedFileContent(
      mockConfigInstance,
      'symlink1',
      'content',
      abortSignal,
    );

    // The utility should fail gracefully with a resolution error
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('Failed to resolve path');
  });

  it('EditTool.getModifyContext handles symlink loops gracefully by throwing a descriptive error', async () => {
    const symlinkPath1 = path.join(tempRootDir, 'symlink1');
    const symlinkPath2 = path.join(tempRootDir, 'symlink2');
    await fsp.symlink(symlinkPath2, symlinkPath1);
    await fsp.symlink(symlinkPath1, symlinkPath2);

    const editTool = new EditTool(mockConfigInstance, createMockMessageBus());
    const modifyContext = editTool.getModifyContext(abortSignal);

    // The getCurrentContent method should throw a path resolution error
    await expect(
      modifyContext.getCurrentContent({
        file_path: 'symlink1',
        instruction: 'read file',
        old_string: '',
        new_string: '',
      }),
    ).rejects.toThrow('Failed to resolve path');

    // The getProposedContent method should throw a path resolution error
    await expect(
      modifyContext.getProposedContent({
        file_path: 'symlink1',
        instruction: 'read file',
        old_string: '',
        new_string: '',
      }),
    ).rejects.toThrow('Failed to resolve path');
  });

  it('getCorrectedFileContent successfully resolves paths in Plan Mode', async () => {
    const plansDir = path.join(tempRootDir, '.plans');
    await fsp.mkdir(plansDir, { recursive: true });
    await fsp.writeFile(
      path.join(plansDir, 'plan-file.txt'),
      'plan content',
      'utf8',
    );

    const planConfigInstance = Object.assign({}, mockConfigInstance, {
      isPlanMode: () => true,
      getProjectRoot: () => tempRootDir,
      storage: {
        getProjectTempDir: () => path.join(tempRootDir, '.temp'),
        getPlansDir: () => plansDir,
      },
    }) as unknown as Config;

    const result = await getCorrectedFileContent(
      planConfigInstance,
      'plan-file.txt',
      'new plan content',
      abortSignal,
    );

    expect(result.error).toBeUndefined();
    expect(result.originalContent).toBe('plan content');
  });

  it('EditTool successfully edits an existing file when the path is prefixed with @', async () => {
    const editTool = new EditTool(mockConfigInstance, createMockMessageBus());
    const invocation = editTool.build({
      file_path: '@policies/new-policies.txt',
      instruction: 'update decision rule',
      old_string: 'decision = "allow"',
      new_string: 'decision = "deny"',
    });

    const result = await invocation.execute({ abortSignal });

    // The tool should succeed and update the correct file
    expect(result.error).toBeUndefined();

    const correctFilePath = path.join(
      tempRootDir,
      'policies',
      'new-policies.txt',
    );
    const updatedContent = await fsp.readFile(correctFilePath, 'utf8');
    expect(updatedContent).toContain('decision = "deny"');
  });

  it('EditTool successfully creates a new file when the path is prefixed with @ and the parent directory exists', async () => {
    const editTool = new EditTool(mockConfigInstance, createMockMessageBus());
    const invocation = editTool.build({
      file_path: '@policies/brand-new-edit-file.txt',
      instruction: 'create new file',
      old_string: '',
      new_string: '[[rule]]\nbrand_new_edit_file = true\n',
    });

    const result = await invocation.execute({ abortSignal });

    // The tool should succeed and create the correct file
    expect(result.error).toBeUndefined();

    const incorrectFilePath = path.join(
      tempRootDir,
      '@policies',
      'brand-new-edit-file.txt',
    );
    const correctFilePath = path.join(
      tempRootDir,
      'policies',
      'brand-new-edit-file.txt',
    );

    // It should NOT have created a literal "@policies" directory
    expect(fs.existsSync(incorrectFilePath)).toBe(false);

    // It should have created the correct file under "policies"
    const createdContent = await fsp.readFile(correctFilePath, 'utf8');
    expect(createdContent).toContain('brand_new_edit_file = true');
  });

  it('EditTool successfully creates a new file in a nested subdirectory when the path is prefixed with @ and the first segment does NOT exist', async () => {
    const editTool = new EditTool(mockConfigInstance, createMockMessageBus());
    const invocation = editTool.build({
      file_path: '@new-policies-edit/sub/brand-new-file.txt',
      instruction: 'create new file in nested subdirectory',
      old_string: '',
      new_string: '[[rule]]\nnested_brand_new_edit_file = true\n',
    });

    const result = await invocation.execute({ abortSignal });

    // The tool should succeed and create the correct file
    expect(result.error).toBeUndefined();

    const incorrectFilePath = path.join(
      tempRootDir,
      '@new-policies-edit',
      'sub',
      'brand-new-file.txt',
    );
    const correctFilePath = path.join(
      tempRootDir,
      'new-policies-edit',
      'sub',
      'brand-new-file.txt',
    );

    // It should NOT have created a literal "@new-policies-edit" directory
    expect(fs.existsSync(incorrectFilePath)).toBe(false);

    // It SHOULD have created the file under "new-policies-edit/sub"
    expect(fs.existsSync(correctFilePath)).toBe(true);

    // Verify the content of the created file
    const createdContent = await fsp.readFile(correctFilePath, 'utf8');
    expect(createdContent).toContain('nested_brand_new_edit_file = true');
  });

  it('EditTool successfully creates a new file in a nested subdirectory when the path is prefixed with @/ and the first segment does NOT exist', async () => {
    const editTool = new EditTool(mockConfigInstance, createMockMessageBus());
    const invocation = editTool.build({
      file_path: '@/new-policies-edit-alias/sub/brand-new-file.txt',
      instruction: 'create new file in nested subdirectory',
      old_string: '',
      new_string: '[[rule]]\nnested_brand_new_edit_file_alias = true\n',
    });

    const result = await invocation.execute({ abortSignal });

    // The tool should succeed and create the correct file
    expect(result.error).toBeUndefined();

    const literalAtFilePath = path.join(
      tempRootDir,
      '@',
      'new-policies-edit-alias',
      'sub',
      'brand-new-file.txt',
    );
    const correctFilePath = path.join(
      tempRootDir,
      'new-policies-edit-alias',
      'sub',
      'brand-new-file.txt',
    );

    // It should NOT have created a literal "@" directory
    expect(fs.existsSync(literalAtFilePath)).toBe(false);
    expect(fs.existsSync(path.join(tempRootDir, '@'))).toBe(false);

    // It should have created the file under "new-policies-edit-alias/sub"
    expect(fs.existsSync(correctFilePath)).toBe(true);

    // Verify the content of the created file
    const createdContent = await fsp.readFile(correctFilePath, 'utf8');
    expect(createdContent).toContain('nested_brand_new_edit_file_alias = true');
  });

  it('EditTool successfully creates a new file in a nested subdirectory when the path is prefixed with @\\ and the first segment does NOT exist', async () => {
    const editTool = new EditTool(mockConfigInstance, createMockMessageBus());
    const invocation = editTool.build({
      file_path: '@\\new-policies-edit-alias-win\\sub\\brand-new-file.txt',
      instruction: 'create new file in nested subdirectory',
      old_string: '',
      new_string: '[[rule]]\nnested_brand_new_edit_file_alias_win = true\n',
    });

    const result = await invocation.execute({ abortSignal });

    // The tool should succeed and create the correct file
    expect(result.error).toBeUndefined();

    const isWindows = process.platform === 'win32';
    const literalAtFilePath = isWindows
      ? path.join(
          tempRootDir,
          '@',
          'new-policies-edit-alias-win',
          'sub',
          'brand-new-file.txt',
        )
      : path.join(
          tempRootDir,
          '@\\new-policies-edit-alias-win\\sub\\brand-new-file.txt',
        );
    const correctFilePath = isWindows
      ? path.join(
          tempRootDir,
          'new-policies-edit-alias-win',
          'sub',
          'brand-new-file.txt',
        )
      : path.join(
          tempRootDir,
          'new-policies-edit-alias-win\\sub\\brand-new-file.txt',
        );

    // It should NOT have created a literal "@" directory
    expect(fs.existsSync(literalAtFilePath)).toBe(false);
    expect(fs.existsSync(path.join(tempRootDir, '@'))).toBe(false);

    // It should have created the file under "new-policies-edit-alias-win/sub"
    expect(fs.existsSync(correctFilePath)).toBe(true);

    // Verify the content of the created file
    const createdContent = await fsp.readFile(correctFilePath, 'utf8');
    expect(createdContent).toContain(
      'nested_brand_new_edit_file_alias_win = true',
    );
  });

  it('correctPath successfully resolves a path prefixed with @ to its clean counterpart', () => {
    const result = correctPath(
      '@policies/new-policies.txt',
      mockConfigInstance,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      const expectedPath = path.join(
        tempRootDir,
        'policies',
        'new-policies.txt',
      );
      expect(result.correctedPath).toBe(expectedPath);
    }
  });
});
