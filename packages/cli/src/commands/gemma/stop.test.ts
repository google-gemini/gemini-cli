/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetBinaryPath = vi.hoisted(() => vi.fn());
const mockIsExpectedLiteRtServerProcess = vi.hoisted(() => vi.fn());
const mockIsProcessRunning = vi.hoisted(() => vi.fn());
const mockIsServerRunning = vi.hoisted(() => vi.fn());
const mockReadServerPid = vi.hoisted(() => vi.fn());
const mockReadServerProcessInfo = vi.hoisted(() => vi.fn());
const mockResolveGemmaConfig = vi.hoisted(() => vi.fn());

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const { mockCoreDebugLogger } = await import(
    '../../test-utils/mockDebugLogger.js'
  );
  return mockCoreDebugLogger(
    await importOriginal<typeof import('@google/gemini-cli-core')>(),
    {
      stripAnsi: false,
    },
  );
});

vi.mock('./constants.js', () => ({
  DEFAULT_PORT: 9379,
  getPidFilePath: vi.fn(() => '/tmp/litert-server.pid'),
}));

vi.mock('./platform.js', () => ({
  getBinaryPath: mockGetBinaryPath,
  isExpectedLiteRtServerProcess: mockIsExpectedLiteRtServerProcess,
  isProcessRunning: mockIsProcessRunning,
  isServerRunning: mockIsServerRunning,
  readServerPid: mockReadServerPid,
  readServerProcessInfo: mockReadServerProcessInfo,
  resolveGemmaConfig: mockResolveGemmaConfig,
}));

vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

import { stopServer } from './stop.js';

describe('gemma stop command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGetBinaryPath.mockReturnValue('/custom/lit');
    mockResolveGemmaConfig.mockReturnValue({ configuredPort: 9379 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('refuses to signal a pid that does not match the expected LiteRT server', async () => {
    mockReadServerProcessInfo.mockReturnValue({
      pid: 1234,
      binaryPath: '/custom/lit',
      port: 8123,
    });
    mockIsProcessRunning.mockReturnValue(true);
    mockIsExpectedLiteRtServerProcess.mockReturnValue(false);

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    await expect(stopServer(8123)).resolves.toBe('unexpected-process');
    expect(killSpy).not.toHaveBeenCalled();
  });

  it('stops the verified LiteRT server and removes the pid file', async () => {
    mockReadServerProcessInfo.mockReturnValue({
      pid: 1234,
      binaryPath: '/custom/lit',
      port: 8123,
    });
    mockIsProcessRunning.mockReturnValueOnce(true).mockReturnValueOnce(false);
    mockIsExpectedLiteRtServerProcess.mockReturnValue(true);

    const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const stopPromise = stopServer(8123);
    await vi.runAllTimersAsync();

    await expect(stopPromise).resolves.toBe('stopped');
    expect(killSpy).toHaveBeenCalledWith(1234, 'SIGTERM');
    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/litert-server.pid');
  });

  it('cleans up a stale pid file when the recorded process is no longer running', async () => {
    mockReadServerProcessInfo.mockReturnValue({
      pid: 1234,
      binaryPath: '/custom/lit',
      port: 8123,
    });
    mockIsProcessRunning.mockReturnValue(false);

    const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

    await expect(stopServer(8123)).resolves.toBe('not-running');
    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/litert-server.pid');
  });
});
