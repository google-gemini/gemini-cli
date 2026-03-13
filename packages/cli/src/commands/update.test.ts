/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { coreEvents } from '@google/gemini-cli-core';
import { updateCommand } from './update.js';
import {
  getInstallationInfo,
  PackageManager,
} from '../utils/installationInfo.js';
import { runExitCleanup } from '../utils/cleanup.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../utils/installationInfo.js', () => ({
  getInstallationInfo: vi.fn(),
  PackageManager: {
    NPM: 'npm',
    HOMEBREW: 'homebrew',
    UNKNOWN: 'unknown',
  },
}));

vi.mock('@google/gemini-cli-core', () => ({
  coreEvents: {
    emitFeedback: vi.fn(),
  },
}));

vi.mock('../utils/cleanup.js', () => ({
  runExitCleanup: vi.fn(),
}));

vi.mock('../gemini.js', () => ({
  initializeOutputListenersAndFlush: vi.fn(),
}));

describe('updateCommand', () => {
  const originalProcessExit = process.exit;

  beforeEach(() => {
    // @ts-expect-error - Mocking process.exit
    process.exit = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.exit = originalProcessExit;
  });

  it('should have the correct command signature', () => {
    expect(updateCommand.command).toBe('update');
    expect(updateCommand.describe).toBe(
      'Updates the Gemini CLI to the latest version.',
    );
  });

  it('should exit with error if installation is not global', async () => {
    // Mock a local project installation (e.g., cloned repo)
    vi.mocked(getInstallationInfo).mockReturnValue({
      packageManager: PackageManager.UNKNOWN,
      isGlobal: false,
      updateMessage: 'Running from a local git clone.',
    });

    // @ts-expect-error - testing the handler
    await updateCommand.handler({});

    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'info',
      'Checking installation method...',
    );
    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'error',
      'Running from a local git clone.',
    );
    expect(runExitCleanup).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(execSync).not.toHaveBeenCalled();
  });

  it('should execute the update command for a global npm installation', async () => {
    // Mock a standard global npm installation
    vi.mocked(getInstallationInfo).mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g @google/gemini-cli@latest',
    });

    // @ts-expect-error - testing the handler
    await updateCommand.handler({});

    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'info',
      expect.stringContaining('npm'),
    );
    expect(execSync).toHaveBeenCalledWith(
      'npm install -g @google/gemini-cli@latest',
      { stdio: 'inherit' },
    );
    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'info',
      expect.stringContaining('successfully updated'),
    );
    expect(runExitCleanup).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('should handle EACCES permission errors gracefully', async () => {
    // Force execSync to throw a permission error
    vi.mocked(getInstallationInfo).mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g @google/gemini-cli@latest',
    });

    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    // @ts-expect-error - testing the handler
    await updateCommand.handler({});

    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Permission denied'),
    );
    expect(runExitCleanup).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
