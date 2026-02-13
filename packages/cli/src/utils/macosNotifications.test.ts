/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { LoadedSettings } from '../config/settings.js';
import {
  buildMacNotificationContent,
  MAX_MACOS_NOTIFICATION_BODY_CHARS,
  MAX_MACOS_NOTIFICATION_SUBTITLE_CHARS,
  MAX_MACOS_NOTIFICATION_TITLE_CHARS,
  notifyMacOs,
  truncateForMacNotification,
} from './macosNotifications.js';

const spawnAsync = vi.hoisted(() => vi.fn());
const debugLogger = vi.hoisted(() => ({
  debug: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', () => ({
  spawnAsync,
  debugLogger,
}));

describe('macOS notifications', () => {
  const originalPlatform = process.platform;

  const settings = (
    enabled: boolean = true,
  ): LoadedSettings =>
    ({
      merged: {
        general: {
          enableMacOsNotifications: enabled,
        },
      },
    }) as LoadedSettings;

  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  it('returns false without spawning on non-macOS platforms', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true,
    });

    const shown = await notifyMacOs(settings(true), {
      title: 't',
      body: 'b',
    });

    expect(shown).toBe(false);
    expect(spawnAsync).not.toHaveBeenCalled();
  });

  it('returns false without spawning when disabled in settings', async () => {
    const shown = await notifyMacOs(settings(false), {
      title: 't',
      body: 'b',
    });

    expect(shown).toBe(false);
    expect(spawnAsync).not.toHaveBeenCalled();
  });

  it('spawns osascript with escaped content on success', async () => {
    spawnAsync.mockResolvedValue({ stdout: '', stderr: '' });

    const shown = await notifyMacOs(settings(true), {
      title: 'Title "quoted"',
      subtitle: 'Sub\\title',
      body: 'Body',
    });

    expect(shown).toBe(true);
    expect(spawnAsync).toHaveBeenCalledTimes(1);
    expect(spawnAsync).toHaveBeenCalledWith(
      'osascript',
      expect.arrayContaining([
        '-e',
        expect.stringContaining('\\"quoted\\"'),
      ]),
    );
  });

  it('returns false and does not throw when osascript fails', async () => {
    spawnAsync.mockRejectedValue(new Error('no permissions'));

    await expect(
      notifyMacOs(settings(true), {
        title: 'Title',
        body: 'Body',
      }),
    ).resolves.toBe(false);
    expect(debugLogger.debug).toHaveBeenCalled();
  });

  it('truncates notification text with ellipsis', () => {
    const input = 'x'.repeat(300);
    const truncated = truncateForMacNotification(input, 12);
    expect(truncated).toHaveLength(12);
    expect(truncated.endsWith('...')).toBe(true);
  });

  it('builds bounded attention notification content', () => {
    const content = buildMacNotificationContent({
      type: 'attention',
      heading: 'h'.repeat(400),
      detail: 'd'.repeat(400),
    });

    expect(content.title.length).toBeLessThanOrEqual(
      MAX_MACOS_NOTIFICATION_TITLE_CHARS,
    );
    expect((content.subtitle ?? '').length).toBeLessThanOrEqual(
      MAX_MACOS_NOTIFICATION_SUBTITLE_CHARS,
    );
    expect(content.body.length).toBeLessThanOrEqual(
      MAX_MACOS_NOTIFICATION_BODY_CHARS,
    );
  });
});
