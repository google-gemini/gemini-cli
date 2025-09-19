/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  EXTENSIONS_CONFIG_FILENAME,
  annotateActiveExtensions,
  loadExtension,
} from '../../config/extension.js';
import { createExtension } from '../../test-utils/createExtension.js';
import { useExtensionUpdates } from './useExtensionUpdates.js';
import { GEMINI_DIR, type GeminiCLIExtension } from '@google/gemini-cli-core';
import { isWorkspaceTrusted } from '../../config/trustedFolders.js';
import { renderHook, waitFor } from '@testing-library/react';
import { MessageType } from '../types.js';

const mockGit = {
  clone: vi.fn(),
  getRemotes: vi.fn(),
  fetch: vi.fn(),
  checkout: vi.fn(),
  listRemote: vi.fn(),
  revparse: vi.fn(),
  // Not a part of the actual API, but we need to use this to do the correct
  // file system interactions.
  path: vi.fn(),
};

vi.mock('simple-git', () => ({
  simpleGit: vi.fn((path: string) => {
    mockGit.path.mockReturnValue(path);
    return mockGit;
  }),
}));

vi.mock('os', async (importOriginal) => {
  const mockedOs = await importOriginal<typeof os>();
  return {
    ...mockedOs,
    homedir: vi.fn(),
  };
});

vi.mock('../../config/trustedFolders.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../config/trustedFolders.js')>();
  return {
    ...actual,
    isWorkspaceTrusted: vi.fn(),
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  const mockLogExtensionInstallEvent = vi.fn();
  const mockLogExtensionUninstallEvent = vi.fn();
  return {
    ...actual,
    ClearcutLogger: {
      getInstance: vi.fn(() => ({
        logExtensionInstallEvent: mockLogExtensionInstallEvent,
        logExtensionUninstallEvent: mockLogExtensionUninstallEvent,
      })),
    },
    Config: vi.fn(),
    ExtensionInstallEvent: vi.fn(),
    ExtensionUninstallEvent: vi.fn(),
  };
});

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

const mockQuestion = vi.hoisted(() => vi.fn());
const mockClose = vi.hoisted(() => vi.fn());
vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: mockQuestion,
    close: mockClose,
  })),
}));

describe('useExtensionUpdates', () => {
  let tempHomeDir: string;
  let userExtensionsDir: string;

  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    userExtensionsDir = path.join(tempHomeDir, GEMINI_DIR, 'extensions');
    fs.mkdirSync(userExtensionsDir, { recursive: true });
    Object.values(mockGit).forEach((fn) => fn.mockReset());
  });

  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
  });

  it('should check for updates and log a message if an update is available', async () => {
    const extensions = [
      {
        name: 'test-extension',
        type: 'git',
        version: '1.0.0',
        path: '/some/path',
        isActive: true,
        installMetadata: {
          type: 'git',
          source: 'https://some/repo',
          autoUpdate: false,
        },
      },
    ];
    const addItem = vi.fn();
    const cwd = '/test/cwd';

    mockGit.getRemotes.mockResolvedValue([
      {
        name: 'origin',
        refs: {
          fetch: 'https://github.com/google/gemini-cli.git',
        },
      },
    ]);
    mockGit.revparse.mockResolvedValue('local-hash');
    mockGit.listRemote.mockResolvedValue('remote-hash\tHEAD');

    renderHook(() =>
      useExtensionUpdates(extensions as GeminiCLIExtension[], addItem, cwd),
    );

    await waitFor(() => {
      expect(addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: 'Extension test-extension has an update available, run "/extensions update test-extension" to install it.',
        },
        expect.any(Number),
      );
    });
  });

  it('should check for updates and automatically update if autoUpdate is true', async () => {
    const extensionDir = createExtension({
      extensionsDir: userExtensionsDir,
      name: 'test-extension',
      version: '1.0.0',
      installMetadata: {
        source: 'https://some.git/repo',
        type: 'git',
        autoUpdate: true,
      },
    });
    const extension = annotateActiveExtensions(
      [loadExtension({ extensionDir, workspaceDir: tempHomeDir })!],
      [],
      tempHomeDir,
    )[0];

    const addItem = vi.fn();
    mockGit.getRemotes.mockResolvedValue([
      {
        name: 'origin',
        refs: {
          fetch: 'https://github.com/google/gemini-cli.git',
        },
      },
    ]);
    mockGit.revparse.mockResolvedValue('local-hash');
    mockGit.listRemote.mockResolvedValue('remote-hash\tHEAD');
    mockGit.clone.mockImplementation(async (_, destination) => {
      fs.mkdirSync(path.join(mockGit.path(), destination), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(mockGit.path(), destination, EXTENSIONS_CONFIG_FILENAME),
        JSON.stringify({ name: 'test-extension', version: '1.1.0' }),
      );
    });
    vi.mocked(isWorkspaceTrusted).mockReturnValue(true);

    renderHook(() => useExtensionUpdates([extension], addItem, tempHomeDir));

    await waitFor(
      () => {
        expect(addItem).toHaveBeenCalledWith(
          {
            type: MessageType.INFO,
            text: 'Extension "test-extension" successfully updated: 1.0.0 → 1.1.0.',
          },
          expect.any(Number),
        );
      },
      { timeout: 2000 },
    );
  });
});
