/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PassThrough } from 'node:stream';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import {
  FatalCancellationError,
  FatalConfigError,
  FolderTrustDiscoveryService,
  writeToStdout,
  type FolderDiscoveryResults,
} from '@google/gemini-cli-core';
import type { LoadedSettings } from '../config/settings.js';
import {
  TrustLevel,
  type LoadedTrustedFolders,
} from '../config/trustedFolders.js';
import * as trustedFolders from '../config/trustedFolders.js';
import {
  formatFolderTrustPrompt,
  promptForFolderTrustLevel,
  resolveFolderTrustForSandbox,
} from './sandboxFolderTrust.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@google/gemini-cli-core')>()),
  writeToStdout: vi.fn(),
}));

const WORKSPACE_DIR = '/home/user/projects/my-app';
const TRUST_ENV = 'GEMINI_CLI_TRUST_WORKSPACE';

const createSettings = (folderTrustEnabled = true) =>
  ({
    merged: { security: { folderTrust: { enabled: folderTrustEnabled } } },
  }) as unknown as LoadedSettings;

const createDiscoveryResults = (
  overrides: Partial<FolderDiscoveryResults> = {},
): FolderDiscoveryResults => ({
  commands: [],
  mcps: [],
  hooks: [],
  skills: [],
  agents: [],
  settings: [],
  securityWarnings: [],
  discoveryErrors: [],
  ...overrides,
});

describe('resolveFolderTrustForSandbox', () => {
  let setValue: Mock;
  let promptForTrustLevel: Mock;

  beforeEach(() => {
    vi.stubEnv(TRUST_ENV, '');
    setValue = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(trustedFolders, 'loadTrustedFolders').mockReturnValue({
      setValue,
    } as unknown as LoadedTrustedFolders);
    promptForTrustLevel = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const resolveTrust = (
    overrides: Partial<Parameters<typeof resolveFolderTrustForSandbox>[0]> = {},
  ) =>
    resolveFolderTrustForSandbox({
      sandboxCommand: 'sandbox-exec',
      settings: createSettings(),
      interactive: true,
      workspaceDir: WORKSPACE_DIR,
      promptForTrustLevel,
      ...overrides,
    });

  it.each([
    [true, 'true'],
    [false, 'false'],
  ])(
    'passes an existing trust decision (%s) to the sandboxed process',
    async (isTrusted, expected) => {
      vi.spyOn(trustedFolders, 'isWorkspaceTrusted').mockReturnValue({
        isTrusted,
        source: 'file',
      });

      await resolveTrust();

      expect(process.env[TRUST_ENV]).toBe(expected);
      expect(promptForTrustLevel).not.toHaveBeenCalled();
      expect(setValue).not.toHaveBeenCalled();
    },
  );

  it.each([
    [TrustLevel.TRUST_FOLDER, 'true'],
    [TrustLevel.TRUST_PARENT, 'true'],
    [TrustLevel.DO_NOT_TRUST, 'false'],
  ])(
    'prompts and saves %s when the folder has no trust decision',
    async (trustLevel, expected) => {
      vi.spyOn(trustedFolders, 'isWorkspaceTrusted').mockReturnValue({
        isTrusted: undefined,
        source: undefined,
      });
      promptForTrustLevel.mockResolvedValue(trustLevel);

      await resolveTrust();

      expect(promptForTrustLevel).toHaveBeenCalledWith(WORKSPACE_DIR);
      expect(setValue).toHaveBeenCalledWith(WORKSPACE_DIR, trustLevel);
      expect(process.env[TRUST_ENV]).toBe(expected);
    },
  );

  it('fails with a cancellation error if the prompt is cancelled', async () => {
    vi.spyOn(trustedFolders, 'isWorkspaceTrusted').mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });
    promptForTrustLevel.mockResolvedValue(undefined);

    await expect(resolveTrust()).rejects.toBeInstanceOf(FatalCancellationError);
    expect(setValue).not.toHaveBeenCalled();
    expect(process.env[TRUST_ENV]).toBe('');
  });

  it('fails with a config error if the trust decision cannot be saved', async () => {
    vi.spyOn(trustedFolders, 'isWorkspaceTrusted').mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });
    promptForTrustLevel.mockResolvedValue(TrustLevel.TRUST_FOLDER);
    setValue.mockRejectedValue(new Error('EACCES: permission denied'));

    await expect(resolveTrust()).rejects.toBeInstanceOf(FatalConfigError);
    expect(process.env[TRUST_ENV]).toBe('');
  });

  it('does not prompt in non-interactive sessions', async () => {
    vi.spyOn(trustedFolders, 'isWorkspaceTrusted').mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });

    await resolveTrust({ interactive: false });

    expect(promptForTrustLevel).not.toHaveBeenCalled();
    expect(process.env[TRUST_ENV]).toBe('');
  });

  it('leaves decisions made through environment variables unchanged', async () => {
    // e.g. GEMINI_RESTRICTED_MODE=true, which the sandboxed process inherits.
    vi.spyOn(trustedFolders, 'isWorkspaceTrusted').mockReturnValue({
      isTrusted: false,
      source: 'env',
    });

    await resolveTrust();

    expect(process.env[TRUST_ENV]).toBe('');
    expect(promptForTrustLevel).not.toHaveBeenCalled();
  });

  it('does nothing for other sandbox commands', async () => {
    const isWorkspaceTrustedSpy = vi.spyOn(
      trustedFolders,
      'isWorkspaceTrusted',
    );

    await resolveTrust({ sandboxCommand: 'docker' });

    expect(isWorkspaceTrustedSpy).not.toHaveBeenCalled();
    expect(process.env[TRUST_ENV]).toBe('');
  });

  it('does nothing when folder trust is disabled', async () => {
    const isWorkspaceTrustedSpy = vi.spyOn(
      trustedFolders,
      'isWorkspaceTrusted',
    );

    await resolveTrust({ settings: createSettings(false) });

    expect(isWorkspaceTrustedSpy).not.toHaveBeenCalled();
    expect(process.env[TRUST_ENV]).toBe('');
  });
});

describe('formatFolderTrustPrompt', () => {
  it('shows the folder trust options', () => {
    const text = formatFolderTrustPrompt(WORKSPACE_DIR);

    expect(text).toContain('Do you trust the files in this folder?');
    expect(text).toContain('1. Trust folder (my-app)');
    expect(text).toContain('2. Trust parent folder (projects)');
    expect(text).toContain("3. Don't trust");
  });

  it('falls back to the full path when the folder has no base name', () => {
    const text = formatFolderTrustPrompt('/');

    expect(text).toContain('1. Trust folder (/)');
    expect(text).toContain('2. Trust parent folder (/)');
  });

  it('lists discovered configurations, warnings, and errors without ANSI escapes', () => {
    const text = formatFolderTrustPrompt(
      WORKSPACE_DIR,
      createDiscoveryResults({
        commands: ['\u001b[31mdeploy\u001b[0m'],
        mcps: ['local-server'],
        securityWarnings: ['Hooks can run shell commands'],
        discoveryErrors: ['Could not parse settings.json'],
      }),
    );

    expect(text).toContain('This folder contains:');
    expect(text).toContain('• Commands (1):');
    expect(text).toContain('- deploy');
    expect(text).toContain('• MCP Servers (1):');
    expect(text).toContain('Security Warnings:');
    expect(text).toContain('• Hooks can run shell commands');
    expect(text).toContain('Discovery Errors:');
    expect(text).toContain('• Could not parse settings.json');
    expect(text).not.toContain('\u001b[');
  });

  it('omits the discovery sections when nothing was found', () => {
    const text = formatFolderTrustPrompt(
      WORKSPACE_DIR,
      createDiscoveryResults(),
    );

    expect(text).not.toContain('This folder contains:');
    expect(text).not.toContain('Security Warnings:');
    expect(text).not.toContain('Discovery Errors:');
  });
});

describe('promptForFolderTrustLevel', () => {
  let input: PassThrough;
  let output: PassThrough;
  let written: string;

  beforeEach(() => {
    vi.spyOn(FolderTrustDiscoveryService, 'discover').mockResolvedValue(
      createDiscoveryResults(),
    );
    input = new PassThrough();
    output = new PassThrough();
    written = '';
    output.on('data', (chunk: Buffer) => {
      written += chunk.toString();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['1', TrustLevel.TRUST_FOLDER],
    ['2', TrustLevel.TRUST_PARENT],
    ['3', TrustLevel.DO_NOT_TRUST],
  ])('returns the trust level for option %s', async (answer, expected) => {
    const result = promptForFolderTrustLevel(WORKSPACE_DIR, input, output);
    input.write(`${answer}\n`);

    await expect(result).resolves.toBe(expected);
    expect(written).toContain('Do you trust the files in this folder?');
    expect(written).toContain('Select an option [1-3]: ');
  });

  it('asks again until a valid option is entered', async () => {
    const result = promptForFolderTrustLevel(WORKSPACE_DIR, input, output);
    input.write('trust\n\n3\n');

    await expect(result).resolves.toBe(TrustLevel.DO_NOT_TRUST);
    expect(written.match(/Enter 1, 2, or 3\./g)).toHaveLength(2);
    // In line mode (`terminal: false`), readline writes the prompt text to the
    // output on every `rl.prompt()` call: once initially and once per retry.
    expect(written.match(/Select an option \[1-3\]: /g)).toHaveLength(3);
  });

  it('returns undefined if the input ends without an answer', async () => {
    const result = promptForFolderTrustLevel(WORKSPACE_DIR, input, output);
    input.end();

    await expect(result).resolves.toBeUndefined();
  });

  it('writes to the terminal directly by default', async () => {
    // process.stdout is patched during startup to buffer output for the UI,
    // so the prompt must use the unpatched writer to be visible.
    vi.mocked(writeToStdout).mockClear();

    const result = promptForFolderTrustLevel(WORKSPACE_DIR, input);
    input.write('1\n');

    await expect(result).resolves.toBe(TrustLevel.TRUST_FOLDER);
    const terminalOutput = vi
      .mocked(writeToStdout)
      .mock.calls.map(([chunk]) => String(chunk))
      .join('');
    expect(terminalOutput).toContain('Do you trust the files in this folder?');
    expect(terminalOutput).toContain('Select an option [1-3]: ');
  });

  it('still prompts if folder discovery fails', async () => {
    vi.mocked(FolderTrustDiscoveryService.discover).mockRejectedValue(
      new Error('discovery failed'),
    );

    const result = promptForFolderTrustLevel(WORKSPACE_DIR, input, output);
    input.write('1\n');

    await expect(result).resolves.toBe(TrustLevel.TRUST_FOLDER);
    expect(written).toContain('Do you trust the files in this folder?');
  });
});
