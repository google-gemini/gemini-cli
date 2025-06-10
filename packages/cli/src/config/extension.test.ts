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

  it('should deduplicate extensions, prioritizing the workspace directory', () => {
    // Create extensions in the workspace
    const workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });
    createExtension(workspaceExtensionsDir, 'ext1', '1.0.0');
    createExtension(workspaceExtensionsDir, 'ext2', '2.0.0');

    // Create extensions in the home directory
    const homeExtensionsDir = path.join(tempHomeDir, EXTENSIONS_DIRECTORY_NAME);
    fs.mkdirSync(homeExtensionsDir, { recursive: true });
    createExtension(homeExtensionsDir, 'ext1', '1.1.0'); // Duplicate that should be ignored
    createExtension(homeExtensionsDir, 'ext3', '3.0.0');

    const extensions = loadExtensions(tempWorkspaceDir);

    expect(extensions).toHaveLength(3);
    expect(extensions.find((e) => e.name === 'ext1')?.version).toBe('1.0.0'); // Workspace version should be kept
    expect(extensions.find((e) => e.name === 'ext2')?.version).toBe('2.0.0');
    expect(extensions.find((e) => e.name === 'ext3')?.version).toBe('3.0.0');
  });
});

function createExtension(
  extensionsDir: string,
  name: string,
  version: string,
): void {
  const extDir = path.join(extensionsDir, name);
  fs.mkdirSync(extDir);
  fs.writeFileSync(
    path.join(extDir, EXTENSIONS_CONFIG_FILENAME),
    JSON.stringify({ name, version }),
  );
}
