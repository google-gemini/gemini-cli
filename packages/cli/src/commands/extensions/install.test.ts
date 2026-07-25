/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
import { handleInstall, installCommand } from './install.js';
import yargs from 'yargs';
import * as core from '@google/gemini-cli-core';
import type { Stats } from 'node:fs';
import * as path from 'node:path';
import { promptForSetting } from '../../config/extensions/extensionSettings.js';

const {
  mockInstallOrUpdateExtension,
  mockLoadExtensions,
  mockExtensionManager,
  mockRequestConsentNonInteractive,
  mockPromptForConsentNonInteractive,
  mockStat,
  mockInferInstallMetadata,
  mockIsWorkspaceTrusted,
  mockLoadTrustedFolders,
  mockDiscover,
} = vi.hoisted(() => {
  const mockLoadExtensions = vi.fn();
  const mockInstallOrUpdateExtension = vi.fn();
  const mockExtensionManager = vi.fn().mockImplementation(() => ({
    loadExtensions: mockLoadExtensions,
    installOrUpdateExtension: mockInstallOrUpdateExtension,
  }));

  return {
    mockLoadExtensions,
    mockInstallOrUpdateExtension,
    mockExtensionManager,
    mockRequestConsentNonInteractive: vi.fn(),
    mockPromptForConsentNonInteractive: vi.fn(),
    mockStat: vi.fn(),
    mockInferInstallMetadata: vi.fn(),
    mockIsWorkspaceTrusted: vi.fn(),
    mockLoadTrustedFolders: vi.fn(),
    mockDiscover: vi.fn(),
  };
});

vi.mock('../../config/extensions/consent.js', () => ({
  requestConsentNonInteractive: mockRequestConsentNonInteractive,
  promptForConsentNonInteractive: mockPromptForConsentNonInteractive,
  INSTALL_WARNING_MESSAGE: 'warning',
}));

vi.mock('../../config/trustedFolders.js', () => ({
  isWorkspaceTrusted: mockIsWorkspaceTrusted,
  loadTrustedFolders: mockLoadTrustedFolders,
  TrustLevel: {
    TRUST_FOLDER: 'TRUST_FOLDER',
  },
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    FolderTrustDiscoveryService: {
      discover: mockDiscover,
    },
  };
});

vi.mock('../../config/extension-manager.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../config/extension-manager.js')
  >()),
  ExtensionManager: mockExtensionManager,
  inferInstallMetadata: mockInferInstallMetadata,
}));

vi.mock('../../utils/errors.js', () => ({
  getErrorMessage: vi.fn((error: Error) => error.message),
}));

vi.mock('node:fs/promises', () => ({
  stat: mockStat,
  default: {
    stat: mockStat,
  },
}));

vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

describe('extensions install command', () => {
  it('should fail if no source is provided', () => {
    const validationParser = yargs([]).command(installCommand).fail(false);
    expect(() => validationParser.parse('install')).toThrow(
      'Not enough non-option arguments: got 0, need at least 1',
    );
  });
});

describe('handleInstall', () => {
  let debugLogSpy: MockInstance;
  let debugErrorSpy: MockInstance;
  let processSpy: MockInstance;

  beforeEach(() => {
    debugLogSpy = vi
      .spyOn(core.debugLogger, 'log')
      .mockImplementation(() => {});
    debugErrorSpy = vi
      .spyOn(core.debugLogger, 'error')
      .mockImplementation(() => {});
    processSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);

    mockLoadExtensions.mockResolvedValue([]);
    mockInstallOrUpdateExtension.mockReset();

    mockIsWorkspaceTrusted.mockReturnValue({ isTrusted: true, source: 'file' });
    mockDiscover.mockResolvedValue({
      commands: [],
      mcps: [],
      hooks: [],
      skills: [],
      agents: [],
      settings: [],
      securityWarnings: [],
      discoveryErrors: [],
    });

    mockInferInstallMetadata.mockImplementation(async (source, args) => {
      if (
        source.startsWith('http://') ||
        source.startsWith('https://') ||
        source.startsWith('git@') ||
        source.startsWith('sso://')
      ) {
        return {
          source,
          type: 'git',
          ref: args?.ref,
          autoUpdate: args?.autoUpdate,
          allowPreRelease: args?.allowPreRelease,
        };
      }
      return { source, type: 'local' };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function createMockExtension(
    overrides: Partial<core.GeminiCLIExtension> = {},
  ): core.GeminiCLIExtension {
    return {
      name: 'mock-extension',
      version: '1.0.0',
      isActive: true,
      path: '/mock/path',
      contextFiles: [],
      id: 'mock-id',
      ...overrides,
    };
  }

  it('should install an extension from a http source', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue(
      createMockExtension({
        name: 'http-extension',
      }),
    );

    await handleInstall({
      source: 'http://google.com',
    });

    expect(debugLogSpy).toHaveBeenCalledWith(
      'Extension "http-extension" installed successfully and enabled.',
    );
  });

  it('should install an extension from a https source', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue(
      createMockExtension({
        name: 'https-extension',
      }),
    );

    await handleInstall({
      source: 'https://google.com',
    });

    expect(debugLogSpy).toHaveBeenCalledWith(
      'Extension "https-extension" installed successfully and enabled.',
    );
  });

  it('should install an extension from a git source', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue(
      createMockExtension({
        name: 'git-extension',
      }),
    );

    await handleInstall({
      source: 'git@some-url',
    });

    expect(debugLogSpy).toHaveBeenCalledWith(
      'Extension "git-extension" installed successfully and enabled.',
    );
  });

  it('throws an error from an unknown source', async () => {
    mockInferInstallMetadata.mockRejectedValue(
      new Error('Install source not found.'),
    );
    await handleInstall({
      source: 'test://google.com',
    });

    expect(debugErrorSpy).toHaveBeenCalledWith('Install source not found.');
    expect(processSpy).toHaveBeenCalledWith(1);
  });

  it('should install an extension from a sso source', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue(
      createMockExtension({
        name: 'sso-extension',
      }),
    );

    await handleInstall({
      source: 'sso://google.com',
    });

    expect(debugLogSpy).toHaveBeenCalledWith(
      'Extension "sso-extension" installed successfully and enabled.',
    );
  });

  it('should install an extension from a local path', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue(
      createMockExtension({
        name: 'local-extension',
      }),
    );
    mockStat.mockResolvedValue({} as Stats);
    await handleInstall({
      source: path.join('/', 'some', 'path'),
    });

    expect(debugLogSpy).toHaveBeenCalledWith(
      'Extension "local-extension" installed successfully and enabled.',
    );
  });

  it('should throw an error if install extension fails', async () => {
    mockInstallOrUpdateExtension.mockRejectedValue(
      new Error('Install extension failed'),
    );

    await handleInstall({ source: 'git@some-url' });

    expect(debugErrorSpy).toHaveBeenCalledWith('Install extension failed');
    expect(processSpy).toHaveBeenCalledWith(1);
  });

  it('should pass promptForSetting when skipSettings is not provided', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue({
      name: 'test-extension',
    } as unknown as core.GeminiCLIExtension);

    await handleInstall({
      source: 'http://google.com',
    });

    expect(mockExtensionManager).toHaveBeenCalledWith(
      expect.objectContaining({
        requestSetting: promptForSetting,
      }),
    );
  });

  it('should pass null for requestSetting when skipSettings is true', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue({
      name: 'test-extension',
    } as unknown as core.GeminiCLIExtension);

    await handleInstall({
      source: 'http://google.com',
      skipSettings: true,
    });

    expect(mockExtensionManager).toHaveBeenCalledWith(
      expect.objectContaining({
        requestSetting: null,
      }),
    );
  });

  it('should proceed if local path is already trusted', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue(
      createMockExtension({
        name: 'local-extension',
      }),
    );
    mockStat.mockResolvedValue({} as Stats);
    mockIsWorkspaceTrusted.mockReturnValue({ isTrusted: true, source: 'file' });

    await handleInstall({
      source: path.join('/', 'some', 'path'),
    });

    expect(mockIsWorkspaceTrusted).toHaveBeenCalled();
    expect(mockPromptForConsentNonInteractive).not.toHaveBeenCalled();
    expect(debugLogSpy).toHaveBeenCalledWith(
      'Extension "local-extension" installed successfully and enabled.',
    );
  });

  it('should prompt and proceed if user accepts trust', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue(
      createMockExtension({
        name: 'local-extension',
      }),
    );
    mockStat.mockResolvedValue({} as Stats);
    mockIsWorkspaceTrusted.mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });
    mockPromptForConsentNonInteractive.mockResolvedValue(true);
    const mockSetValue = vi.fn();
    mockLoadTrustedFolders.mockReturnValue({
      setValue: mockSetValue,
      user: { path: '', config: {} },
      errors: [],
      rules: [],
      isPathTrusted: vi.fn(),
    });

    await handleInstall({
      source: path.join('/', 'untrusted', 'path'),
    });

    expect(mockIsWorkspaceTrusted).toHaveBeenCalled();
    expect(mockPromptForConsentNonInteractive).toHaveBeenCalled();
    expect(mockSetValue).toHaveBeenCalledWith(
      expect.stringContaining(path.join('untrusted', 'path')),
      'TRUST_FOLDER',
    );
    expect(debugLogSpy).toHaveBeenCalledWith(
      'Extension "local-extension" installed successfully and enabled.',
    );
  });

  it('should prompt and abort if user denies trust', async () => {
    mockStat.mockResolvedValue({} as Stats);
    mockIsWorkspaceTrusted.mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });
    mockPromptForConsentNonInteractive.mockResolvedValue(false);

    await handleInstall({
      source: path.join('/', 'evil', 'path'),
    });

    expect(mockIsWorkspaceTrusted).toHaveBeenCalled();
    expect(mockPromptForConsentNonInteractive).toHaveBeenCalled();
    expect(debugErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Installation aborted: Folder'),
    );
    expect(processSpy).toHaveBeenCalledWith(1);
  });

  it('should include discovery results in trust prompt', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue(
      createMockExtension({
        name: 'local-extension',
      }),
    );
    mockStat.mockResolvedValue({} as Stats);
    mockIsWorkspaceTrusted.mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });
    mockDiscover.mockResolvedValue({
      commands: ['custom-cmd'],
      mcps: [],
      hooks: [],
      skills: ['cool-skill'],
      agents: ['cool-agent'],
      settings: [],
      securityWarnings: ['Security risk!'],
      discoveryErrors: ['Read error'],
    });
    mockPromptForConsentNonInteractive.mockResolvedValue(true);
    mockLoadTrustedFolders.mockReturnValue({
      setValue: vi.fn(),
      user: { path: '', config: {} },
      errors: [],
      rules: [],
      isPathTrusted: vi.fn(),
    });

    await handleInstall({
      source: '/untrusted/path',
    });

    expect(mockPromptForConsentNonInteractive).toHaveBeenCalledWith(
      expect.stringContaining('This folder contains:'),
      false,
    );
    expect(mockPromptForConsentNonInteractive).toHaveBeenCalledWith(
      expect.stringContaining('custom-cmd'),
      false,
    );
    expect(mockPromptForConsentNonInteractive).toHaveBeenCalledWith(
      expect.stringContaining('cool-skill'),
      false,
    );
    expect(mockPromptForConsentNonInteractive).toHaveBeenCalledWith(
      expect.stringContaining('cool-agent'),
      false,
    );
    expect(mockPromptForConsentNonInteractive).toHaveBeenCalledWith(
      expect.stringContaining('Security Warnings:'),
      false,
    );
    expect(mockPromptForConsentNonInteractive).toHaveBeenCalledWith(
      expect.stringContaining('Security risk!'),
      false,
    );
    expect(mockPromptForConsentNonInteractive).toHaveBeenCalledWith(
      expect.stringContaining('Discovery Errors:'),
      false,
    );
    expect(mockPromptForConsentNonInteractive).toHaveBeenCalledWith(
      expect.stringContaining('Read error'),
      false,
    );
  });
});
// Implementation completed.
