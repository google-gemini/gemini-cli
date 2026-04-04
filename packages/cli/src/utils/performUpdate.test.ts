/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performUpdate } from './performUpdate.js';
import { PackageManager } from './installationInfo.js';
import EventEmitter from 'node:events';

// Hoisted mocks
const mockIsUpdateInProgress = vi.hoisted(() => vi.fn(() => false));
const mockGetPackageJson = vi.hoisted(() => vi.fn());
const mockLatestVersion = vi.hoisted(() => vi.fn());
const mockGetInstallationInfo = vi.hoisted(() => vi.fn());

// Mock modules
vi.mock('./handleAutoUpdate.js', () => ({
  isUpdateInProgress: mockIsUpdateInProgress,
  handleAutoUpdate: vi.fn(),
  waitForUpdateCompletion: vi.fn(),
  setUpdateHandler: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', () => ({
  getPackageJson: mockGetPackageJson,
  debugLogger: { log: vi.fn(), warn: vi.fn() },
}));

vi.mock('latest-version', () => ({
  default: mockLatestVersion,
}));

vi.mock('./installationInfo.js', async () => {
  const actual = await vi.importActual('./installationInfo.js');
  return {
    ...actual,
    getInstallationInfo: mockGetInstallationInfo,
  };
});

describe('performUpdate', () => {
  let mockSpawn: ReturnType<typeof vi.fn>;
  let mockChild: EventEmitter;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all mocks to default behavior
    mockIsUpdateInProgress.mockReturnValue(false);
    mockGetPackageJson.mockResolvedValue(undefined);
    mockLatestVersion.mockResolvedValue(null);
    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
    });

    // Clear env vars
    delete process.env['DEV'];
    delete process.env['GEMINI_SANDBOX'];

    mockSpawn = vi.fn();
    mockChild = new EventEmitter();
    (mockChild as unknown as { unref: () => void }).unref = vi.fn();
    mockSpawn.mockReturnValue(mockChild);
  });

  it('returns error when running in DEV mode', async () => {
    process.env['DEV'] = 'true';
    try {
      const result = await performUpdate('/root', mockSpawn);
      expect(result.status).toBe('error');
      expect(result).toMatchObject({
        status: 'error',
        message: expect.stringContaining('development mode'),
      });
    } finally {
      delete process.env['DEV'];
    }
  });

  it('returns unsupported when running in sandbox mode', async () => {
    process.env['GEMINI_SANDBOX'] = 'true';
    try {
      const result = await performUpdate('/root', mockSpawn);
      expect(result.status).toBe('unsupported');
      expect(result).toMatchObject({
        status: 'unsupported',
        message: expect.stringContaining('sandbox mode'),
      });
    } finally {
      delete process.env['GEMINI_SANDBOX'];
    }
  });

  it('returns error when concurrent update is in progress', async () => {
    mockIsUpdateInProgress.mockReturnValue(true);
    const result = await performUpdate('/root', mockSpawn);
    expect(result.status).toBe('error');
    expect(result).toMatchObject({
      status: 'error',
      message: expect.stringContaining(
        'background update is already in progress',
      ),
    });
  });

  it('returns error when cannot determine current version', async () => {
    mockGetPackageJson.mockResolvedValue(undefined);
    const result = await performUpdate('/root', mockSpawn);
    expect(result.status).toBe('error');
    expect(result).toMatchObject({
      status: 'error',
      message: expect.stringContaining('Cannot determine current version'),
    });
  });

  it('returns up-to-date when no newer version exists', async () => {
    mockGetPackageJson.mockResolvedValue({
      name: '@google/gemini-cli',
      version: '1.0.0',
    });
    mockLatestVersion.mockResolvedValue('1.0.0');

    const result = await performUpdate('/root', mockSpawn);
    expect(result.status).toBe('up-to-date');
    expect(result).toMatchObject({ status: 'up-to-date', current: '1.0.0' });
  });

  it('returns error for latestVersion failures', async () => {
    mockGetPackageJson.mockResolvedValue({
      name: '@google/gemini-cli',
      version: '1.0.0',
    });
    mockLatestVersion.mockRejectedValue(new Error('network error'));

    const result = await performUpdate('/root', mockSpawn);
    expect(result.status).toBe('error');
    expect(result).toMatchObject({
      status: 'error',
      message: expect.stringContaining(
        'Could not determine the latest version',
      ),
    });
  });

  it('returns unsupported for NPX', async () => {
    mockGetPackageJson.mockResolvedValue({
      name: '@google/gemini-cli',
      version: '1.0.0',
    });
    mockLatestVersion.mockResolvedValue('2.0.0');
    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPX,
      isGlobal: false,
      updateMessage: 'Running via npx, update not applicable.',
    });

    const result = await performUpdate('/root', mockSpawn);
    expect(result.status).toBe('unsupported');
    expect(result).toMatchObject({
      status: 'unsupported',
      message: expect.stringContaining('npx'),
    });
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('returns unsupported for BINARY', async () => {
    mockGetPackageJson.mockResolvedValue({
      name: '@google/gemini-cli',
      version: '1.0.0',
    });
    mockLatestVersion.mockResolvedValue('2.0.0');
    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.BINARY,
      isGlobal: true,
      updateMessage: 'Running as a standalone binary.',
    });

    const result = await performUpdate('/root', mockSpawn);
    expect(result.status).toBe('unsupported');
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('runs update for npm global install', async () => {
    mockGetPackageJson.mockResolvedValue({
      name: '@google/gemini-cli',
      version: '1.0.0',
    });
    mockLatestVersion.mockResolvedValue('2.0.0');
    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g @google/gemini-cli@latest',
    });

    setTimeout(() => mockChild.emit('close', 0), 5);
    const result = await performUpdate('/root', mockSpawn);

    expect(mockSpawn).toHaveBeenCalled();
    expect(result.status).toBe('updated');
    expect(result).toMatchObject({
      status: 'updated',
      from: '1.0.0',
      to: '2.0.0',
    });
  });

  it('uses @nightly tag for nightly builds', async () => {
    mockGetPackageJson.mockResolvedValue({
      name: '@google/gemini-cli',
      version: '1.0.0-nightly.100',
    });
    // For nightly, we query both nightly and stable
    mockLatestVersion
      .mockResolvedValueOnce('2.0.0-nightly.200') // first call (nightly)
      .mockResolvedValueOnce('1.9.0'); // second call (stable)

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g @google/gemini-cli@latest',
    });

    setTimeout(() => mockChild.emit('close', 0), 5);
    await performUpdate('/root', mockSpawn);

    const spawnCall = mockSpawn.mock.calls[0][0];
    expect(spawnCall).toContain('@nightly');
  });

  it('runs brew upgrade for HOMEBREW', async () => {
    mockGetPackageJson.mockResolvedValue({
      name: '@google/gemini-cli',
      version: '1.0.0',
    });
    mockLatestVersion.mockResolvedValue('2.0.0');
    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.HOMEBREW,
      isGlobal: true,
    });

    setTimeout(() => mockChild.emit('close', 0), 5);
    await performUpdate('/root', mockSpawn);

    const spawnCall = mockSpawn.mock.calls[0][0];
    expect(spawnCall).toBe('brew upgrade gemini-cli');
  });

  it('returns error on non-zero exit code', async () => {
    mockGetPackageJson.mockResolvedValue({
      name: '@google/gemini-cli',
      version: '1.0.0',
    });
    mockLatestVersion.mockResolvedValue('2.0.0');
    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.PNPM,
      isGlobal: true,
      updateCommand: 'pnpm add -g @google/gemini-cli@latest',
    });

    setTimeout(() => mockChild.emit('close', 1), 5);
    const result = await performUpdate('/root', mockSpawn);

    expect(result.status).toBe('error');
    expect(result).toMatchObject({
      status: 'error',
      message: expect.stringContaining('exited with code 1'),
    });
  });

  it('returns error on spawn error event', async () => {
    mockGetPackageJson.mockResolvedValue({
      name: '@google/gemini-cli',
      version: '1.0.0',
    });
    mockLatestVersion.mockResolvedValue('2.0.0');
    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.BUN,
      isGlobal: true,
      updateCommand: 'bun add -g @google/gemini-cli@latest',
    });

    setTimeout(() => mockChild.emit('error', new Error('spawn failed')), 5);
    const result = await performUpdate('/root', mockSpawn);

    expect(result.status).toBe('error');
    expect(result).toMatchObject({
      status: 'error',
      message: expect.stringContaining('Failed to run update command'),
    });
  });
});
