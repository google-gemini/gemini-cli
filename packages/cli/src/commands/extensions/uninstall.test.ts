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
  type Mock,
} from 'vitest';
import { handleUninstall, uninstallCommand } from './uninstall.js';
import yargs from 'yargs';
import { debugLogger } from '@google/gemini-cli-core';
import type { ExtensionManager } from '../../config/extension-manager.js';
import type { requestConsentNonInteractive } from '../../config/extensions/consent.js';

const mockUninstallExtension: Mock<
  typeof ExtensionManager.prototype.uninstallExtension
> = vi.hoisted(() => vi.fn());
const mockRequestConsentNonInteractive: Mock<
  typeof requestConsentNonInteractive
> = vi.hoisted(() => vi.fn());

vi.mock('../../config/extensions/consent.js', () => ({
  requestConsentNonInteractive: mockRequestConsentNonInteractive,
}));

vi.mock('../../config/extension-manager.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../config/extension-manager.js')>();
  return {
    ...actual,
    ExtensionManager: vi.fn().mockImplementation(() => ({
      uninstallExtension: mockUninstallExtension,
      loadExtensions: vi.fn(),
    })),
  };
});

vi.mock('../../utils/errors.js', () => ({
  getErrorMessage: vi.fn((error: Error) => error.message),
}));

describe('extensions uninstall command', () => {
  it('should fail if no source is provided', () => {
    const validationParser = yargs([])
      .command(uninstallCommand)
      .fail(false)
      .locale('en');
    expect(() => validationParser.parse('uninstall')).toThrow(
      'Not enough non-option arguments: got 0, need at least 1',
    );
  });
});

describe('handleUninstall', () => {
  let debugLogSpy: MockInstance;
  let debugErrorSpy: MockInstance;
  let processSpy: MockInstance;

  beforeEach(() => {
    debugLogSpy = vi.spyOn(debugLogger, 'log');
    debugErrorSpy = vi.spyOn(debugLogger, 'error');
    processSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    mockUninstallExtension.mockClear();
    mockRequestConsentNonInteractive.mockClear();
    vi.clearAllMocks();
  });

  it('should uninstall a single extension', async () => {
    mockUninstallExtension.mockResolvedValue(undefined);

    await handleUninstall({
      names: ['test-extension'],
    });

    expect(mockUninstallExtension).toHaveBeenCalledWith(
      'test-extension',
      false,
    );
    expect(debugLogSpy).toHaveBeenCalledWith(
      'Extension "test-extension" successfully uninstalled.',
    );
    expect(processSpy).not.toHaveBeenCalled();
  });

  it('should uninstall multiple extensions', async () => {
    mockUninstallExtension.mockResolvedValue(undefined);

    await handleUninstall({
      names: ['ext1', 'ext2', 'ext3'],
    });

    expect(mockUninstallExtension).toHaveBeenCalledTimes(3);
    expect(mockUninstallExtension).toHaveBeenCalledWith('ext1', false);
    expect(mockUninstallExtension).toHaveBeenCalledWith('ext2', false);
    expect(mockUninstallExtension).toHaveBeenCalledWith('ext3', false);
    expect(debugLogSpy).toHaveBeenCalledWith(
      'Extension "ext1" successfully uninstalled.',
    );
    expect(debugLogSpy).toHaveBeenCalledWith(
      'Extension "ext2" successfully uninstalled.',
    );
    expect(debugLogSpy).toHaveBeenCalledWith(
      'Extension "ext3" successfully uninstalled.',
    );
    expect(processSpy).not.toHaveBeenCalled();
  });

  it('should report errors for failed uninstalls but continue with others', async () => {
    mockUninstallExtension
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Extension not found'))
      .mockResolvedValueOnce(undefined);

    await handleUninstall({
      names: ['ext1', 'ext2', 'ext3'],
    });

    expect(mockUninstallExtension).toHaveBeenCalledTimes(3);
    expect(debugLogSpy).toHaveBeenCalledWith(
      'Extension "ext1" successfully uninstalled.',
    );
    expect(debugErrorSpy).toHaveBeenCalledWith(
      'Failed to uninstall "ext2": Extension not found',
    );
    expect(debugLogSpy).toHaveBeenCalledWith(
      'Extension "ext3" successfully uninstalled.',
    );
    expect(processSpy).toHaveBeenCalledWith(1);
  });

  it('should exit with error code if all uninstalls fail', async () => {
    mockUninstallExtension.mockRejectedValue(new Error('Extension not found'));

    await handleUninstall({
      names: ['ext1', 'ext2'],
    });

    expect(debugErrorSpy).toHaveBeenCalledWith(
      'Failed to uninstall "ext1": Extension not found',
    );
    expect(debugErrorSpy).toHaveBeenCalledWith(
      'Failed to uninstall "ext2": Extension not found',
    );
    expect(processSpy).toHaveBeenCalledWith(1);
  });
});
