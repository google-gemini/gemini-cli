/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  EXTENSIONS_CONFIG_FILENAME,
  EXTENSIONS_DIRECTORY_NAME,
  filterActiveExtensions,
  loadExtensions,
} from './extension.js';

vi.mock('os', async (importOriginal) => {
  const os = await importOriginal<typeof import('os')>();
  return {
    ...os,
    homedir: vi.fn(),
  };
});

describe('loadExtensions', () => {
  let tempWorkspaceDir: string;
  let tempHomeDir: string;

  beforeEach(() => {
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-workspace-'),
    );
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
  });

  afterEach(() => {
    fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
  });

  it('should load context file path when GEMINI.md is present', () => {
    const workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });
    createExtension(workspaceExtensionsDir, 'ext1', '1.0.0', true);
    createExtension(workspaceExtensionsDir, 'ext2', '2.0.0');

    const extensions = loadExtensions(tempWorkspaceDir);

    expect(extensions).toHaveLength(2);
    const ext1 = extensions.find((e) => e.config.name === 'ext1');
    const ext2 = extensions.find((e) => e.config.name === 'ext2');
    expect(ext1?.contextFiles).toEqual([
      path.join(workspaceExtensionsDir, 'ext1', 'GEMINI.md'),
    ]);
    expect(ext2?.contextFiles).toEqual([]);
  });

  it('should load context file path from the extension config', () => {
    const workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });
    createExtension(
      workspaceExtensionsDir,
      'ext1',
      '1.0.0',
      false,
      'my-context-file.md',
    );

    const extensions = loadExtensions(tempWorkspaceDir);

    expect(extensions).toHaveLength(1);
    const ext1 = extensions.find((e) => e.config.name === 'ext1');
    expect(ext1?.contextFiles).toEqual([
      path.join(workspaceExtensionsDir, 'ext1', 'my-context-file.md'),
    ]);
  });

  it('should load context files using glob pattern', () => {
    const workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });
    createExtension(
      workspaceExtensionsDir,
      'ext1',
      '1.0.0',
      false,
      '*.md', // Glob pattern for all markdown files
    );

    // Create some markdown files in the extension directory
    const ext1Dir = path.join(workspaceExtensionsDir, 'ext1');
    fs.writeFileSync(path.join(ext1Dir, 'file1.md'), 'context1');
    fs.writeFileSync(path.join(ext1Dir, 'file2.md'), 'context2');
    fs.writeFileSync(path.join(ext1Dir, 'file3.txt'), 'context3'); // Non-markdown file

    const extensions = loadExtensions(tempWorkspaceDir);

    expect(extensions).toHaveLength(1);
    const ext1 = extensions.find((e) => e.config.name === 'ext1');
    expect(ext1?.contextFiles).toHaveLength(2);
    expect(ext1?.contextFiles).toEqual(
      expect.arrayContaining([
        path.join(workspaceExtensionsDir, 'ext1', 'file1.md'),
        path.join(workspaceExtensionsDir, 'ext1', 'file2.md'),
      ]),
    );
  });

  it('should load context files using array of glob patterns and normal paths', () => {
    const workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });
    createExtension(
      workspaceExtensionsDir,
      'ext1',
      '1.0.0',
      false,
      ['specific.txt', '*.md'], // Array of patterns and normal paths
    );

    // Create some files in the extension directory
    const ext1Dir = path.join(workspaceExtensionsDir, 'ext1');
    fs.writeFileSync(path.join(ext1Dir, 'file1.md'), 'context1');
    fs.writeFileSync(path.join(ext1Dir, 'file2.markdown'), 'context2'); // Different extension
    fs.writeFileSync(path.join(ext1Dir, 'specific.txt'), 'context3');
    fs.writeFileSync(path.join(ext1Dir, 'another.txt'), 'context4');


    const extensions = loadExtensions(tempWorkspaceDir);
    expect(extensions).toHaveLength(1);
    const ext1 = extensions.find((e) => e.config.name === 'ext1');

    // Check that the correct files are loaded
    // glob.sync in this test environment might return files in a different order
    // so we check for the presence of each expected file.
    expect(ext1?.contextFiles).toHaveLength(2);
    expect(ext1?.contextFiles).toEqual(
      expect.arrayContaining([
        path.join(workspaceExtensionsDir, 'ext1', 'file1.md'),
        path.join(workspaceExtensionsDir, 'ext1', 'specific.txt'),
      ]),
    );
  });
});

describe('filterActiveExtensions', () => {
  const extensions = [
    { config: { name: 'ext1', version: '1.0.0' }, contextFiles: [] },
    { config: { name: 'ext2', version: '1.0.0' }, contextFiles: [] },
    { config: { name: 'ext3', version: '1.0.0' }, contextFiles: [] },
  ];

  it('should return all extensions if no enabled extensions are provided', () => {
    const activeExtensions = filterActiveExtensions(extensions, []);
    expect(activeExtensions).toHaveLength(3);
  });

  it('should return only the enabled extensions', () => {
    const activeExtensions = filterActiveExtensions(extensions, [
      'ext1',
      'ext3',
    ]);
    expect(activeExtensions).toHaveLength(2);
    expect(activeExtensions.some((e) => e.config.name === 'ext1')).toBe(true);
    expect(activeExtensions.some((e) => e.config.name === 'ext3')).toBe(true);
  });

  it('should return no extensions when "none" is provided', () => {
    const activeExtensions = filterActiveExtensions(extensions, ['none']);
    expect(activeExtensions).toHaveLength(0);
  });

  it('should handle case-insensitivity', () => {
    const activeExtensions = filterActiveExtensions(extensions, ['EXT1']);
    expect(activeExtensions).toHaveLength(1);
    expect(activeExtensions[0].config.name).toBe('ext1');
  });

  it('should log an error for unknown extensions', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    filterActiveExtensions(extensions, ['ext4']);
    expect(consoleSpy).toHaveBeenCalledWith('Extension not found: ext4');
    consoleSpy.mockRestore();
  });
});

function createExtension(
  extensionsDir: string,
  name: string,
  version: string,
  addContextFile = false,
  contextFileName?: string | string[],
): void {
  const extDir = path.join(extensionsDir, name);
  fs.mkdirSync(extDir);
  fs.writeFileSync(
    path.join(extDir, EXTENSIONS_CONFIG_FILENAME),
    JSON.stringify({ name, version, contextFileName }),
  );

  if (addContextFile) {
    fs.writeFileSync(path.join(extDir, 'GEMINI.md'), 'context');
  }

  if (contextFileName) {
    if (Array.isArray(contextFileName)) {
      contextFileName.forEach((fileName) => {
        // For glob patterns, we can't just write a file with the pattern as its name.
        // The tests that use glob patterns will create the files separately.
        if (!fileName.includes('*') && !fileName.includes('?') && !fileName.includes('{')) {
          fs.writeFileSync(path.join(extDir, fileName), 'context');
        }
      });
    } else {
      // For glob patterns, we can't just write a file with the pattern as its name.
      // The tests that use glob patterns will create the files separately.
      if (!contextFileName.includes('*') && !contextFileName.includes('?') && !contextFileName.includes('{')) {
        fs.writeFileSync(path.join(extDir, contextFileName), 'context');
      }
    }
  }
}
