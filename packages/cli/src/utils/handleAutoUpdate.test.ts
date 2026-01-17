/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Mock } from 'vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getInstallationInfo, PackageManager } from './installationInfo.js';
import { updateEventEmitter } from './updateEventEmitter.js';
import type { UpdateObject } from '../ui/utils/updateCheck.js';
import type { LoadedSettings } from '../config/settings.js';
import EventEmitter from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { handleAutoUpdate, setUpdateHandler } from './handleAutoUpdate.js';
import { MessageType } from '../ui/types.js';
import { mergeSettings } from '../config/settings.js';

vi.mock('./installationInfo.js', async () => {
  const actual = await vi.importActual('./installationInfo.js');
  return {
    ...actual,
    getInstallationInfo: vi.fn(),
  };
});

vi.mock('./updateEventEmitter.js', async (importOriginal) =>
  importOriginal<typeof import('./updateEventEmitter.js')>(),
);

const mockGetInstallationInfo = vi.mocked(getInstallationInfo);

describe('handleAutoUpdate', () => {
  let mockSpawn: Mock;
  let mockUpdateInfo: UpdateObject;
  let mockSettings: LoadedSettings;
  let mockChildProcess: ChildProcess;

  beforeEach(() => {
    mockSpawn = vi.fn();
    vi.clearAllMocks();
    vi.spyOn(updateEventEmitter, 'emit');
    mockUpdateInfo = {
      update: {
        latest: '2.0.0',
        current: '1.0.0',
        type: 'major',
        name: '@google/gemini-cli',
      },
      message: 'An update is available!',
    };

    const defaultMergedSettings = mergeSettings({}, {}, {}, {}, true);
    mockSettings = {
      merged: defaultMergedSettings,
    } as LoadedSettings;

    mockChildProcess = Object.assign(new EventEmitter(), {
      stdin: Object.assign(new EventEmitter(), {
        write: vi.fn(),
        end: vi.fn(),
      }),
      unref: vi.fn(),
    }) as unknown as ChildProcess;

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
    expect(updateEventEmitter.emit).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should do nothing if update nag is disabled', () => {
    mockSettings.merged.general.disableUpdateNag = true;
    handleAutoUpdate(mockUpdateInfo, mockSettings, '/root', mockSpawn);
    expect(mockGetInstallationInfo).not.toHaveBeenCalled();
    expect(updateEventEmitter.emit).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should emit "update-received" but not update if auto-updates are disabled', () => {
    mockSettings.merged.general.disableAutoUpdate = true;
    mockGetInstallationInfo.mockReturnValue({
      updateCommand: 'npm i -g @google/gemini-cli@latest',
      updateMessage: 'Please update manually.',
      isGlobal: true,
      packageManager: PackageManager.NPM,
    });

    handleAutoUpdate(mockUpdateInfo, mockSettings, '/root', mockSpawn);

    expect(updateEventEmitter.emit).toHaveBeenCalledTimes(1);
    expect(updateEventEmitter.emit).toHaveBeenCalledWith('update-received', {
      message: 'An update is available!\nPlease update manually.',
    });
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it.each([PackageManager.NPX, PackageManager.PNPX, PackageManager.BUNX])(
    'should suppress update notifications when running via %s',
    (packageManager) => {
      mockGetInstallationInfo.mockReturnValue({
        updateCommand: undefined,
        updateMessage: `Running via ${packageManager}, update not applicable.`,
        isGlobal: false,
        packageManager,
      });

      handleAutoUpdate(mockUpdateInfo, mockSettings, '/root', mockSpawn);

      expect(updateEventEmitter.emit).not.toHaveBeenCalled();
      expect(mockSpawn).not.toHaveBeenCalled();
    },
  );

  it('should emit "update-received" but not update if no update command is found', () => {
    mockGetInstallationInfo.mockReturnValue({
      updateCommand: undefined,
      updateMessage: 'Cannot determine update command.',
      isGlobal: false,
      packageManager: PackageManager.NPM,
    });

    handleAutoUpdate(mockUpdateInfo, mockSettings, '/root', mockSpawn);

    expect(updateEventEmitter.emit).toHaveBeenCalledTimes(1);
    expect(updateEventEmitter.emit).toHaveBeenCalledWith('update-received', {
      message: 'An update is available!\nCannot determine update command.',
    });
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

    expect(updateEventEmitter.emit).toHaveBeenCalledTimes(1);
    expect(updateEventEmitter.emit).toHaveBeenCalledWith('update-received', {
      message: 'An update is available!\nThis is an additional message.',
    });
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
        mockChildProcess.emit('close', 1);
        resolve();
      }, 0);

      handleAutoUpdate(mockUpdateInfo, mockSettings, '/root', mockSpawn);
    });

    expect(updateEventEmitter.emit).toHaveBeenCalledWith('update-failed', {
      message:
        'Automatic update failed. Please try updating manually. (command: npm i -g @google/gemini-cli@2.0.0)',
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

    expect(updateEventEmitter.emit).toHaveBeenCalledWith('update-failed', {
      message:
        'Automatic update failed. Please try updating manually. (error: Spawn error)',
    });
  });

  it('should use the "@nightly" tag for nightly updates', async () => {
    mockUpdateInfo = {
      ...mockUpdateInfo,
      update: {
        ...mockUpdateInfo.update,
        latest: '2.0.0-nightly',
      },
    };
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
        stdio: 'ignore',
        detached: true,
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

    expect(updateEventEmitter.emit).toHaveBeenCalledWith('update-success', {
      message:
        'Update successful! The new version will be used on your next run.',
    });
  });
});

describe('setUpdateHandler', () => {
  let addItem: ReturnType<typeof vi.fn>;
  let setUpdateInfo: ReturnType<typeof vi.fn>;
  let unregister: () => void;

  beforeEach(() => {
    addItem = vi.fn();
    setUpdateInfo = vi.fn();
    vi.useFakeTimers();
    unregister = setUpdateHandler(addItem, setUpdateInfo);
  });

  afterEach(() => {
    unregister();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should register event listeners', () => {
    // We can't easily check if listeners are registered on the real EventEmitter
    // without mocking it more deeply, but we can check if they respond to events.
    expect(unregister).toBeInstanceOf(Function);
  });

  it('should handle update-received event', () => {
    const updateInfo: UpdateObject = {
      update: {
        latest: '2.0.0',
        current: '1.0.0',
        type: 'major',
        name: '@google/gemini-cli',
      },
      message: 'Update available',
    };

    // Access the actual emitter to emit events
    updateEventEmitter.emit('update-received', updateInfo);

    expect(setUpdateInfo).toHaveBeenCalledWith(updateInfo);

    // Advance timers to trigger timeout
    vi.advanceTimersByTime(60000);

    expect(addItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text: 'Update available',
      },
      expect.any(Number),
    );
    expect(setUpdateInfo).toHaveBeenCalledWith(null);
  });

  it('should handle update-failed event', () => {
    updateEventEmitter.emit('update-failed', { message: 'Failed' });

    expect(setUpdateInfo).toHaveBeenCalledWith(null);
    expect(addItem).toHaveBeenCalledWith(
      {
        type: MessageType.ERROR,
        text: 'Automatic update failed. Please try updating manually',
      },
      expect.any(Number),
    );
  });

  it('should handle update-success event', () => {
    updateEventEmitter.emit('update-success', { message: 'Success' });

    expect(setUpdateInfo).toHaveBeenCalledWith(null);
    expect(addItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text: 'Update successful! The new version will be used on your next run.',
      },
      expect.any(Number),
    );
  });

  it('should not show update-received message if update-success was called', () => {
    const updateInfo: UpdateObject = {
      update: {
        latest: '2.0.0',
        current: '1.0.0',
        type: 'major',
        name: '@google/gemini-cli',
      },
      message: 'Update available',
    };

    updateEventEmitter.emit('update-received', updateInfo);
    updateEventEmitter.emit('update-success', { message: 'Success' });

    // Advance timers
    vi.advanceTimersByTime(60000);

    // Should only have called addItem for success, not for received (after timeout)
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(addItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text: 'Update successful! The new version will be used on your next run.',
      },
      expect.any(Number),
    );
  });

  it('should handle update-info event', () => {
    updateEventEmitter.emit('update-info', { message: 'Info message' });

    expect(addItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text: 'Info message',
      },
      expect.any(Number),
    );
  });
});
