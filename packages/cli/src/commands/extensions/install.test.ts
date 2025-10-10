/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, type MockInstance } from 'vitest';
import { handleInstall, installCommand } from './install.js';
import yargs from 'yargs';

const mockInstallOrUpdateExtension = vi.hoisted(() => vi.fn());
const mockRequestConsentNonInteractive = vi.hoisted(() => vi.fn());
const mockStat = vi.hoisted(() => vi.fn());

vi.mock('../../config/extension.js', () => ({
  installOrUpdateExtension: mockInstallOrUpdateExtension,
  requestConsentNonInteractive: mockRequestConsentNonInteractive,
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

describe('extensions install command', () => {
  it('should fail if no source is provided', () => {
    const validationParser = yargs([]).command(installCommand).fail(false);
    expect(() => validationParser.parse('install')).toThrow(
      'Not enough non-option arguments: got 0, need at least 1',
    );
  });
});

describe('handleInstall', () => {
  let consoleLogSpy: MockInstance;
  let consoleErrorSpy: MockInstance;
  let processSpy: MockInstance;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log');
    consoleErrorSpy = vi.spyOn(console, 'error');
    processSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    mockInstallOrUpdateExtension.mockClear();
    mockRequestConsentNonInteractive.mockClear();
    mockStat.mockClear();
    vi.resetAllMocks();
  });

  it('should install an extension from a http source', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue('http-extension');

    await handleInstall({
      source: 'http://google.com',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Extension "http-extension" installed successfully and enabled.',
    );
  });

  it('should install an extension from a https source', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue('https-extension');

    await handleInstall({
      source: 'https://google.com',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Extension "https-extension" installed successfully and enabled.',
    );
  });

  it('should install an extension from a git source', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue('git-extension');

    await handleInstall({
      source: 'git@some-url',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Extension "git-extension" installed successfully and enabled.',
    );
  });

  it('throws an error from an unknown source', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT: no such file or directory'));
    await handleInstall({
      source: 'test://google.com',
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Install source not found.');
    expect(processSpy).toHaveBeenCalledWith(1);
  });

  it('should install an extension from a sso source', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue('sso-extension');

    await handleInstall({
      source: 'sso://google.com',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Extension "sso-extension" installed successfully and enabled.',
    );
  });

  it('should install an extension from a local path', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue('local-extension');
    mockStat.mockResolvedValue({});
    await handleInstall({
      source: '/some/path',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Extension "local-extension" installed successfully and enabled.',
    );
  });

  it('should throw an error if install extension fails', async () => {
    mockInstallOrUpdateExtension.mockRejectedValue(
      new Error('Install extension failed'),
    );

    await handleInstall({ source: 'git@some-url' });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Install extension failed');
    expect(processSpy).toHaveBeenCalledWith(1);
  });
});
