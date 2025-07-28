/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChildProcess, spawn } from 'node:child_process';
import { handleAutoUpdate } from './handleAutoUpdate.js';
import { getInstallationInfo, PackageManager } from './installationInfo.js';
import { updateEventEmitter } from './updateEventEmitter.js';
import { UpdateObject } from '../ui/utils/updateCheck.js';
import { LoadedSettings } from '../config/settings.js';

// Mock dependencies
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual('node:child_process');
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

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

const mockSpawn = vi.mocked(spawn);
const mockGetInstallationInfo = vi.mocked(getInstallationInfo);
const mockUpdateEventEmitter = vi.mocked(updateEventEmitter);

describe('handleAutoUpdate', () => {
  let mockUpdateInfo: UpdateObject;
  let mockSettings: LoadedSettings;
  let mockChildProcess: {
    stderr: { on: ReturnType<typeof vi.fn> };
    stdout: { on: ReturnType<typeof vi.fn> };
    on: ReturnType<typeof vi.fn>;
    unref: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
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

    mockChildProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      unref: vi.fn(),
    };
    mockSpawn.mockReturnValue(mockChildProcess as unknown as ChildProcess);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should do nothing if update info is null', () => {
    handleAutoUpdate(null, mockSettings, '/root');
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

    handleAutoUpdate(mockUpdateInfo, mockSettings, '/root');

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

    handleAutoUpdate(mockUpdateInfo, mockSettings, '/root');

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

    handleAutoUpdate(mockUpdateInfo, mockSettings, '/root');

    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledTimes(1);
    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledWith(
      'update-received',
      {
        message: 'An update is available!\nThis is an additional message.',
      },
    );
  });
});
