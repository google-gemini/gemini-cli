/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { getInstallationInfo, PackageManager } from './installationInfo.js';
import { updateEventEmitter } from './updateEventEmitter.js';
import { UpdateObject } from '../ui/utils/updateCheck.js';
import { LoadedSettings } from '../config/settings.js';
import EventEmitter from 'node:events';
import { handleAutoUpdate } from './handleAutoUpdate.js';

vi.mock('./installationInfo.js', async () => {
  const actual = await vi.importActual('./installationInfo.js');
  return {
    ...actual,
    getInstallationInfo: vi.fn(),
  };
});

vi.mock('./updateEventEmitter.js', async () => {
  const actual = await vi.importActual('./updateEventEmitter.js');
  return {
    ...actual,
    updateEventEmitter: {
      ...actual.updateEventEmitter,
      emit: vi.fn(),
    },
  };
});

interface MockChildProcess extends EventEmitter {
  stdin: EventEmitter & {
    write: Mock;
    end: Mock;
  };
  stderr: EventEmitter;
}

const mockGetInstallationInfo = vi.mocked(getInstallationInfo);
const mockUpdateEventEmitter = vi.mocked(updateEventEmitter);

describe('handleAutoUpdate', () => {
  let mockSpawn: Mock;
  let mockUpdateInfo: UpdateObject;
  let mockSettings: LoadedSettings;
  let mockChildProcess: MockChildProcess;

  beforeEach(() => {
    mockSpawn = vi.fn();
    vi.clearAllMocks();
    mockUpdateInfo = {
      update: {
        latest: '2.0.0',
        current: '1.0.0',
        type: 'major',
        name: '@google/gemini-cli',
      },
      message: 'An update is available!',
    };

    mockSettings = {
      merged: {
        disableAutoUpdate: false,
      },
    } as LoadedSettings;

    mockChildProcess = Object.assign(new EventEmitter(), {
      stdin: Object.assign(new EventEmitter(), {
        write: vi.fn(),
        end: vi.fn(),
      }),
      stderr: new EventEmitter(),
    }) as MockChildProcess;

    mockSpawn.mockReturnValue(
      mockChildProcess as unknown as ReturnType<typeof mockSpawn>,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should do nothing if update info is null', () => {
    handleAutoUpdate(null, mockSettings, '/root', mockSpawn);
    expect(mockGetInstallationInfo).not.toHaveBeenCalled();
    expect(mockUpdateEventEmitter.emit).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should do nothing if update nag is disabled', () => {
    mockSettings.merged.disableUpdateNag = true;
    handleAutoUpdate(mockUpdateInfo, mockSettings, '/root', mockSpawn);
    expect(mockGetInstallationInfo).not.toHaveBeenCalled();
    expect(mockUpdateEventEmitter.emit).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should emit "update-received" but not update if auto-updates are disabled', () => {
    mockSettings.merged.disableAutoUpdate = true;
    mockGetInstallationInfo.mockReturnValue({
      updateCommand: 'npm i -g @google/gemini-cli@latest',
      updateMessage: 'Please update manually.',
      isGlobal: true,
      packageManager: PackageManager.NPM,
    });

    handleAutoUpdate(mockUpdateInfo, mockSettings, '/root', mockSpawn);

    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledTimes(1);
    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledWith(
      'update-received',
      {
        message: 'An update is available!\nPlease update manually.',
      },
    );
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should emit "update-received" but not update if no update command is found', () => {
    mockGetInstallationInfo.mockReturnValue({
      updateCommand: undefined,
      updateMessage: 'Cannot determine update command.',
      isGlobal: false,
      packageManager: PackageManager.NPM,
    });

    handleAutoUpdate(mockUpdateInfo, mockSettings, '/root', mockSpawn);

    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledTimes(1);
    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledWith(
      'update-received',
      {
        message: 'An update is available!\nCannot determine update command.',
      },
    );
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should combine update messages correctly', () => {
    mockGetInstallationInfo.mockReturnValue({
      updateCommand: undefined, // No command to prevent spawn
      updateMessage: 'This is an additional message.',
      isGlobal: false,
      packageManager: PackageManager.NPM,
    });

    handleAutoUpdate(mockUpdateInfo, mockSettings, '/root', mockSpawn);

    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledTimes(1);
    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledWith(
      'update-received',
      {
        message: 'An update is available!\nThis is an additional message.',
      },
    );
  });

  it('should attempt to perform an update when conditions are met', async () => {
    mockGetInstallationInfo.mockReturnValue({
      updateCommand: 'npm i -g @google/gemini-cli@latest',
      updateMessage: 'This is an additional message.',
      isGlobal: false,
      packageManager: PackageManager.NPM,
    });

    // Simulate successful execution
    setTimeout(() => {
      mockChildProcess.emit('close', 0);
    }, 0);

    handleAutoUpdate(mockUpdateInfo, mockSettings, '/root', mockSpawn);

    expect(mockSpawn).toHaveBeenCalledOnce();
  });

  it('should emit "update-failed" when the update process fails', async () => {
    await new Promise<void>((resolve) => {
      mockGetInstallationInfo.mockReturnValue({
        updateCommand: 'npm i -g @google/gemini-cli@latest',
        updateMessage: 'This is an additional message.',
        isGlobal: false,
        packageManager: PackageManager.NPM,
      });

      // Simulate failed execution
      setTimeout(() => {
        mockChildProcess.stderr.emit('data', 'An error occurred');
        mockChildProcess.emit('close', 1);
        resolve();
      }, 0);

      handleAutoUpdate(mockUpdateInfo, mockSettings, '/root', mockSpawn);
    });

    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledWith('update-failed', {
      message:
        'Automatic update failed. Please try updating manually. (command: npm i -g @google/gemini-cli@2.0.0, stderr: An error occurred)',
    });
  });

  it('should emit "update-failed" when the spawn function throws an error', async () => {
    await new Promise<void>((resolve) => {
      mockGetInstallationInfo.mockReturnValue({
        updateCommand: 'npm i -g @google/gemini-cli@latest',
        updateMessage: 'This is an additional message.',
        isGlobal: false,
        packageManager: PackageManager.NPM,
      });

      // Simulate an error event
      setTimeout(() => {
        mockChildProcess.emit('error', new Error('Spawn error'));
        resolve();
      }, 0);

      handleAutoUpdate(mockUpdateInfo, mockSettings, '/root', mockSpawn);
    });

    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledWith('update-failed', {
      message:
        'Automatic update failed. Please try updating manually. (error: Spawn error)',
    });
  });

  it('should use the "@nightly" tag for nightly updates', async () => {
    mockUpdateInfo.update.latest = '2.0.0-nightly';
    mockGetInstallationInfo.mockReturnValue({
      updateCommand: 'npm i -g @google/gemini-cli@latest',
      updateMessage: 'This is an additional message.',
      isGlobal: false,
      packageManager: PackageManager.NPM,
    });

    handleAutoUpdate(mockUpdateInfo, mockSettings, '/root', mockSpawn);

    expect(mockSpawn).toHaveBeenCalledWith(
      'npm i -g @google/gemini-cli@nightly',
      {
        shell: true,
        stdio: 'pipe',
      },
    );
  });

  it('should emit "update-success" when the update process succeeds', async () => {
    await new Promise<void>((resolve) => {
      mockGetInstallationInfo.mockReturnValue({
        updateCommand: 'npm i -g @google/gemini-cli@latest',
        updateMessage: 'This is an additional message.',
        isGlobal: false,
        packageManager: PackageManager.NPM,
      });

      // Simulate successful execution
      setTimeout(() => {
        mockChildProcess.emit('close', 0);
        resolve();
      }, 0);

      handleAutoUpdate(mockUpdateInfo, mockSettings, '/root', mockSpawn);
    });

    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledWith('update-success', {
      message:
        'Update successful! The new version will be used on your next run.',
    });
  });
});
