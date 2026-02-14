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
  supportsOsc9Notifications,
  truncateForMacNotification,
} from './macosNotifications.js';

const writeToStdout = vi.hoisted(() => vi.fn());
const debugLogger = vi.hoisted(() => ({
  debug: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', () => ({
  writeToStdout,
  debugLogger,
}));

describe('macOS notifications', () => {
  const originalPlatform = process.platform;
  const originalTermProgram = process.env['TERM_PROGRAM'];
  const originalTerm = process.env['TERM'];
  const originalItTermSessionId = process.env['ITERM_SESSION_ID'];
  const originalWtSession = process.env['WT_SESSION'];

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
    delete process.env['TERM_PROGRAM'];
    delete process.env['TERM'];
    delete process.env['ITERM_SESSION_ID'];
    delete process.env['WT_SESSION'];
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true,
    });
  });

  afterEach(() => {
    process.env['TERM_PROGRAM'] = originalTermProgram;
    process.env['TERM'] = originalTerm;
    process.env['ITERM_SESSION_ID'] = originalItTermSessionId;
    process.env['WT_SESSION'] = originalWtSession;
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
    expect(writeToStdout).not.toHaveBeenCalled();
  });

  it('returns false without spawning when disabled in settings', async () => {
    const shown = await notifyMacOs(settings(false), {
      title: 't',
      body: 'b',
    });

    expect(shown).toBe(false);
    expect(writeToStdout).not.toHaveBeenCalled();
  });

  it('emits OSC 9 notification when supported terminal is detected', async () => {
    process.env['ITERM_SESSION_ID'] = 'iterm-123';

    const shown = await notifyMacOs(settings(true), {
      title: 'Title "quoted"',
      subtitle: 'Sub\\title',
      body: 'Body',
    });

    expect(shown).toBe(true);
    expect(writeToStdout).toHaveBeenCalledTimes(1);
    expect(writeToStdout).toHaveBeenCalledWith(
      expect.stringMatching(/^\x1b\]9;.*\x07$/),
    );
  });

  it('emits BEL notification when OSC 9 is not supported', async () => {
    const shown = await notifyMacOs(settings(true), {
      title: 'Title',
      subtitle: 'Subtitle',
      body: 'Body',
    });

    expect(shown).toBe(true);
    expect(writeToStdout).toHaveBeenCalledWith('\x07');
  });

  it('uses BEL fallback when WT_SESSION is set even with OSC-capable terminal hints', async () => {
    process.env['WT_SESSION'] = '1';
    process.env['TERM_PROGRAM'] = 'WezTerm';

    const shown = await notifyMacOs(settings(true), {
      title: 'Title',
      body: 'Body',
    });

    expect(shown).toBe(true);
    expect(writeToStdout).toHaveBeenCalledWith('\x07');
  });

  it('returns false and does not throw when terminal write fails', async () => {
    writeToStdout.mockImplementation(() => {
      throw new Error('no permissions');
    });

    await expect(
      notifyMacOs(settings(true), {
        title: 'Title',
        body: 'Body',
      }),
    ).resolves.toBe(false);
    expect(debugLogger.debug).toHaveBeenCalledTimes(1);
  });

  it('detects OSC 9 support using terminal env hints', () => {
    expect(supportsOsc9Notifications({ TERM_PROGRAM: 'WezTerm' })).toBe(true);
    expect(supportsOsc9Notifications({ TERM_PROGRAM: 'ghostty' })).toBe(true);
    expect(supportsOsc9Notifications({ ITERM_SESSION_ID: 'abc' })).toBe(true);
    expect(supportsOsc9Notifications({ TERM: 'xterm-kitty' })).toBe(true);
    expect(supportsOsc9Notifications({ TERM: 'wezterm' })).toBe(true);
    expect(
      supportsOsc9Notifications({ TERM_PROGRAM: 'WezTerm', WT_SESSION: '1' }),
    ).toBe(false);
    expect(supportsOsc9Notifications({})).toBe(false);
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
