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
import { handleAutoUpdate, setUpdateHandler } from './handleAutoUpdate.js';
import { MessageType } from '../ui/types.js';
import { relaunchApp } from './processUtils.js';

vi.mock('./installationInfo.js', async () => {
  const actual = await vi.importActual('./installationInfo.js');
  return {
    ...actual,
    getInstallationInfo: vi.fn(),
  };
});

vi.mock('./processUtils.js', () => ({
  relaunchApp: vi.fn(),
}));

interface MockChildProcess extends EventEmitter {
  stdin: EventEmitter & {
    write: Mock;
    end: Mock;
  };
  stderr: EventEmitter;
}

const mockGetInstallationInfo = vi.mocked(getInstallationInfo);
const mockRelaunchApp = vi.mocked(relaunchApp);

describe('handleAutoUpdate', () => {
  let mockSpawn: Mock;
  let mockUpdateInfo: UpdateObject;
  let mockSettings: LoadedSettings;
  let mockChildProcess: MockChildProcess;
  let emitSpy: Mock;

  beforeEach(() => {
    mockSpawn = vi.fn();
    emitSpy = vi
      .spyOn(updateEventEmitter, 'emit')
      .mockImplementation(() => true);
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
        general: {
          disableAutoUpdate: false,
        },
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
    emitSpy.mockRestore();
  });

  it('should do nothing if update info is null', () => {
    handleAutoUpdate(null, mockSettings, '/root', mockSpawn);
    expect(mockGetInstallationInfo).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should do nothing if update nag is disabled', () => {
    mockSettings.merged.general!.disableUpdateNag = true;
    handleAutoUpdate(mockUpdateInfo, mockSettings, '/root', mockSpawn);
    expect(mockGetInstallationInfo).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should emit "update-received" but not update if auto-updates are disabled', () => {
    mockSettings.merged.general!.disableAutoUpdate = true;
    mockGetInstallationInfo.mockReturnValue({
      updateCommand: 'npm i -g @google/gemini-cli@latest',
      updateMessage: 'Please update manually.',
      isGlobal: true,
      packageManager: PackageManager.NPM,
    });

    handleAutoUpdate(mockUpdateInfo, mockSettings, '/root', mockSpawn);

    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith('update-received', {
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

      expect(emitSpy).not.toHaveBeenCalled();
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

    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith('update-received', {
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

    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith('update-received', {
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
        mockChildProcess.stderr.emit('data', 'An error occurred');
        mockChildProcess.emit('close', 1);
        resolve();
      }, 0);

      handleAutoUpdate(mockUpdateInfo, mockSettings, '/root', mockSpawn);
    });

    expect(emitSpy).toHaveBeenCalledWith('update-failed', {
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

    expect(emitSpy).toHaveBeenCalledWith('update-failed', {
      message:
        'Automatic update failed. Please try updating manually. (error: Spawn error)',
    });
  });

  it('should suggest sudo when permission error occurs', async () => {
    await new Promise<void>((resolve) => {
      mockGetInstallationInfo.mockReturnValue({
        updateCommand: 'npm i -g @google/gemini-cli@latest',
        updateMessage: 'This is an additional message.',
        isGlobal: false,
        packageManager: PackageManager.NPM,
      });

      // Simulate permission error
      setTimeout(() => {
        mockChildProcess.stderr.emit('data', 'npm ERR! code EACCES');
        mockChildProcess.emit('close', 1);
        resolve();
      }, 0);

      handleAutoUpdate(mockUpdateInfo, mockSettings, '/root', mockSpawn);
    });

    expect(emitSpy).toHaveBeenCalledWith('update-failed', {
      message:
        'Automatic update failed due to permission issues. You may need to run the update manually with sudo: sudo npm i -g @google/gemini-cli@2.0.0',
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

    expect(emitSpy).toHaveBeenCalledWith('update-success', {
      message: 'Update successful! Restarting...',
    });
  });
});

describe('setUpdateHandler', () => {
  let mockAddItem: Mock;
  let mockSetUpdateInfo: Mock;
  let cleanup: () => void;

  beforeEach(() => {
    mockAddItem = vi.fn();
    mockSetUpdateInfo = vi.fn();
    vi.useFakeTimers();
    cleanup = setUpdateHandler(mockAddItem, mockSetUpdateInfo);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('should handle "update-received" event', () => {
    const info = {
      message: 'Update available',
      update: {
        latest: '2.0.0',
        current: '1.0.0',
        name: 'cli',
      },
    };
    updateEventEmitter.emit('update-received', info);

    expect(mockSetUpdateInfo).toHaveBeenCalledWith(info);

    // Fast-forward timer
    vi.advanceTimersByTime(60000);

    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: 'Update available',
      }),
      expect.any(Number),
    );
    expect(mockSetUpdateInfo).toHaveBeenCalledWith(null);
  });

  it('should handle "update-failed" event', () => {
    updateEventEmitter.emit('update-failed', { message: 'Failed' });

    expect(mockSetUpdateInfo).toHaveBeenCalledWith(null);
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: 'Automatic update failed. Please try updating manually',
      }),
      expect.any(Number),
    );
  });

  it('should handle "update-success" event and relaunch', () => {
    updateEventEmitter.emit('update-success', { message: 'Success' });

    expect(mockSetUpdateInfo).toHaveBeenCalledWith(null);
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: 'Update successful! Restarting...',
      }),
      expect.any(Number),
    );

    // Relaunch happens after 1s
    expect(mockRelaunchApp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(mockRelaunchApp).toHaveBeenCalled();
  });

  it('should handle "update-info" event', () => {
    updateEventEmitter.emit('update-info', { message: 'Info' });

    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: 'Info',
      }),
      expect.any(Number),
    );
  });
});
