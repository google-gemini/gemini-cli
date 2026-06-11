/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import prompts from 'prompts';
import { coreEvents, ExitCodes } from '@google/gemini-cli-core';
import { relaunchApp } from '../utils/processUtils.js';
import {
  isWorkspaceTrusted,
  loadTrustedFolders,
  TrustLevel,
} from './trustedFolders.js';
import { maybePromptForFolderTrust } from './folderTrustPrompt.js';
import type { MergedSettings } from './settings.js';

vi.mock('prompts', () => ({
  default: vi.fn(),
}));

vi.mock('../utils/processUtils.js', () => ({
  relaunchApp: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  const mockCoreEvents = Object.create(
    actual.coreEvents,
  ) as typeof actual.coreEvents;
  mockCoreEvents.emitFeedback = vi.fn();
  return {
    ...actual,
    coreEvents: mockCoreEvents,
  };
});

vi.mock('./trustedFolders.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./trustedFolders.js')>();
  return {
    ...actual,
    isWorkspaceTrusted: vi.fn(),
    loadTrustedFolders: vi.fn(),
  };
});

describe('maybePromptForFolderTrust', () => {
  const settings = {
    security: {
      folderTrust: {
        enabled: true,
      },
    },
  } as MergedSettings;
  const argv = {
    prompt: undefined,
    query: undefined,
    isCommand: undefined,
  };
  const setValue = vi.fn().mockResolvedValue(undefined);
  const stdinIsTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  const stdoutIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: true,
    });
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: undefined,
      source: undefined,
    });
    vi.mocked(loadTrustedFolders).mockReturnValue({
      setValue,
    } as unknown as ReturnType<typeof loadTrustedFolders>);
    vi.mocked(prompts).mockResolvedValue({
      trustLevel: TrustLevel.DO_NOT_TRUST,
    });
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: stdinIsTTY?.value,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: stdoutIsTTY?.value,
    });
  });

  it('does nothing when the workspace trust state is already known', async () => {
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: false,
      source: 'file',
    });

    await maybePromptForFolderTrust(settings, argv, '/repo');

    expect(prompts).not.toHaveBeenCalled();
    expect(setValue).not.toHaveBeenCalled();
    expect(relaunchApp).not.toHaveBeenCalled();
  });

  it('saves an explicit do-not-trust decision and continues without relaunching', async () => {
    await maybePromptForFolderTrust(settings, argv, '/repo');

    expect(prompts).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        stdin: process.stdin,
        stdout: expect.anything(),
      }),
    );
    expect(setValue).toHaveBeenCalledWith('/repo', TrustLevel.DO_NOT_TRUST);
    expect(relaunchApp).not.toHaveBeenCalled();
  });

  it('saves a trust decision and relaunches before authentication continues', async () => {
    vi.mocked(prompts).mockResolvedValue({
      trustLevel: TrustLevel.TRUST_FOLDER,
    });

    await maybePromptForFolderTrust(settings, argv, '/repo');

    expect(setValue).toHaveBeenCalledWith('/repo', TrustLevel.TRUST_FOLDER);
    expect(relaunchApp).toHaveBeenCalledOnce();
  });

  it('exits with a config error if the trust decision cannot be saved', async () => {
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`process.exit:${code}`);
      });
    setValue.mockRejectedValueOnce(new Error('disk full'));

    await expect(
      maybePromptForFolderTrust(settings, argv, '/repo'),
    ).rejects.toThrow(`process.exit:${ExitCodes.FATAL_CONFIG_ERROR}`);

    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'error',
      'Failed to save trust settings. Exiting Gemini CLI.',
    );
    processExitSpy.mockRestore();
  });
});
