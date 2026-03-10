/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AudioNotificationService,
  AudioEvent,
} from './audioNotificationService.js';
import * as child_process from 'node:child_process';
import type { ExecException } from 'node:child_process';
import os from 'node:os';

type ExecCallback = (
  error: ExecException | null,
  stdout: string,
  stderr: string,
) => void;
type ExecMock = (cmd: string, cb: ExecCallback) => void;

vi.mock('node:child_process');
vi.mock('node:os');

describe('AudioNotificationService', () => {
  let service: AudioNotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AudioNotificationService(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when disabled', async () => {
    service = new AudioNotificationService(false);
    await service.play(AudioEvent.SUCCESS);
    expect(child_process.exec).not.toHaveBeenCalled();
  });

  it('uses afplay on darwin', async () => {
    vi.mocked(os.platform).mockReturnValue('darwin');
    vi.mocked(child_process.exec as unknown as ExecMock).mockImplementationOnce(
      (cmd, cb) => cb(null, '', ''),
    );
    await service.play(AudioEvent.SUCCESS);
    expect(child_process.exec).toHaveBeenCalledWith(
      expect.stringContaining('afplay'),
      expect.any(Function),
    );
  });

  it('uses powershell on win32', async () => {
    vi.mocked(os.platform).mockReturnValue('win32');
    vi.mocked(child_process.exec as unknown as ExecMock).mockImplementationOnce(
      (cmd, cb) => cb(null, '', ''),
    );
    await service.play(AudioEvent.SUCCESS);
    expect(child_process.exec).toHaveBeenCalledWith(
      expect.stringContaining('powershell'),
      expect.any(Function),
    );
  });

  it('uses printf on linux', async () => {
    vi.mocked(os.platform).mockReturnValue('linux');
    vi.mocked(child_process.exec as unknown as ExecMock).mockImplementationOnce(
      (cmd, cb) => cb(null, '', ''),
    );
    await service.play(AudioEvent.SUCCESS);
    expect(child_process.exec).toHaveBeenCalledWith(
      expect.stringContaining('printf'),
      expect.any(Function),
    );
  });

  it('silently ignores exec errors', async () => {
    vi.mocked(os.platform).mockReturnValue('darwin');
    vi.mocked(child_process.exec as unknown as ExecMock).mockImplementationOnce(
      (cmd, cb) => {
        cb(new Error('test error'), '', '');
      },
    );

    await expect(service.play(AudioEvent.SUCCESS)).resolves.not.toThrow();
  });
});
