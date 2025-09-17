/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, type MockInstance } from 'vitest';
import { handleInstall, installCommand } from './install.js';
import yargs from 'yargs';

const mockInstallExtension = vi.hoisted(() => vi.fn());

vi.mock('../../config/extension.js', () => ({
  installExtension: mockInstallExtension,
}));

vi.mock('../../utils/errors.js', () => ({
  getErrorMessage: vi.fn((error: Error) => error.message),
}));

describe('extensions install command', () => {
  it('should fail if no source is provided', () => {
    const validationParser = yargs([]).command(installCommand).fail(false);
    expect(() => validationParser.parse('install')).toThrow(
      'Either source or --path must be provided.',
    );
  });

  it('should fail if both git source and local path are provided', () => {
    const validationParser = yargs([]).command(installCommand).fail(false);
    expect(() =>
      validationParser.parse('install some-url --path /some/path'),
    ).toThrow('Arguments source and path are mutually exclusive');
  });

  it('should fail if both auto update and local path are provided', () => {
    const validationParser = yargs([]).command(installCommand).fail(false);
    expect(() =>
      validationParser.parse(
        'install some-url --path /some/path --auto-update',
      ),
    ).toThrow('Arguments path and auto-update are mutually exclusive');
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
    mockInstallExtension.mockClear();
    vi.resetAllMocks();
  });

  it('should install an extension from a http source', async () => {
    mockInstallExtension.mockResolvedValue('http-extension');

    await handleInstall({
      source: 'http://google.com',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Extension "http-extension" installed successfully and enabled.',
    );
  });

  it('should install an extension from a https source', async () => {
    mockInstallExtension.mockResolvedValue('https-extension');

    await handleInstall({
      source: 'https://google.com',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Extension "https-extension" installed successfully and enabled.',
    );
  });

  it('should install an extension from a git source', async () => {
    mockInstallExtension.mockResolvedValue('git-extension');

    await handleInstall({
      source: 'git@some-url',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Extension "git-extension" installed successfully and enabled.',
    );
  });

  it('throws an error from an unknown source', async () => {
    await handleInstall({
      source: 'test://google.com',
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'The source "test://google.com" is not a valid URL format.',
    );
    expect(processSpy).toHaveBeenCalledWith(1);
  });

  it('should install an extension from a sso source', async () => {
    mockInstallExtension.mockResolvedValue('sso-extension');

    await handleInstall({
      source: 'sso://google.com',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Extension "sso-extension" installed successfully and enabled.',
    );
  });

  it('should install an extension from a local path', async () => {
    mockInstallExtension.mockResolvedValue('local-extension');

    await handleInstall({
      path: '/some/path',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Extension "local-extension" installed successfully and enabled.',
    );
  });

  it('should throw an error if no source or path is provided', async () => {
    await handleInstall({});

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Either --source or --path must be provided.',
    );
    expect(processSpy).toHaveBeenCalledWith(1);
  });

  it('should throw an error if install extension fails', async () => {
    mockInstallExtension.mockRejectedValue(
      new Error('Install extension failed'),
    );

    await handleInstall({ source: 'git@some-url' });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Install extension failed');
    expect(processSpy).toHaveBeenCalledWith(1);
  });
});
