/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildRunEventNotificationContent,
  MAX_NOTIFICATION_BODY_CHARS,
  MAX_NOTIFICATION_SUBTITLE_CHARS,
  MAX_NOTIFICATION_TITLE_CHARS,
  notifyViaTerminal,
} from './terminalNotifications.js';

const writeToStdout = vi.hoisted(() => vi.fn());
const debugLogger = vi.hoisted(() => ({
  debug: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', () => ({
  writeToStdout,
  debugLogger,
}));

describe('terminal notifications', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  it('returns false without writing on non-macOS platforms', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true,
    });

    const shown = await notifyViaTerminal(true, {
      title: 't',
      body: 'b',
    });

    expect(shown).toBe(false);
    expect(writeToStdout).not.toHaveBeenCalled();
  });

  it('returns false without writing when disabled', async () => {
    const shown = await notifyViaTerminal(false, {
      title: 't',
      body: 'b',
    });

    expect(shown).toBe(false);
    expect(writeToStdout).not.toHaveBeenCalled();
  });

  it('emits OSC 9 notification when supported terminal is detected', async () => {
    vi.stubEnv('TERM_PROGRAM', 'iTerm.app');

    const shown = await notifyViaTerminal(true, {
      title: 'Title "quoted"',
      subtitle: 'Sub\\title',
      body: 'Body',
    });

    expect(shown).toBe(true);
    expect(writeToStdout).toHaveBeenCalledTimes(1);
    const emitted = String(writeToStdout.mock.calls[0][0]);
    expect(emitted.startsWith('\x1b]9;')).toBe(true);
    expect(emitted.endsWith('\x07')).toBe(true);
  });

  it('emits BEL fallback when OSC 9 is not supported', async () => {
    vi.stubEnv('TERM_PROGRAM', '');
    vi.stubEnv('TERM', '');

    const shown = await notifyViaTerminal(true, {
      title: 'Title',
      subtitle: 'Subtitle',
      body: 'Body',
    });

    expect(shown).toBe(true);
    expect(writeToStdout).toHaveBeenCalledWith('\x07');
  });

  it('uses BEL fallback when WT_SESSION is set', async () => {
    vi.stubEnv('WT_SESSION', '1');
    vi.stubEnv('TERM_PROGRAM', 'WezTerm');

    const shown = await notifyViaTerminal(true, {
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
      notifyViaTerminal(true, {
        title: 'Title',
        body: 'Body',
      }),
    ).resolves.toBe(false);
    expect(debugLogger.debug).toHaveBeenCalledTimes(1);
  });

  it('strips terminal control sequences and newlines from payload text', async () => {
    vi.stubEnv('TERM_PROGRAM', 'iTerm.app');

    const shown = await notifyViaTerminal(true, {
      title: 'Title',
      body: '\x1b[32mGreen\x1b[0m\nLine',
    });

    expect(shown).toBe(true);
    const emitted = String(writeToStdout.mock.calls[0][0]);
    const payload = emitted.slice('\x1b]9;'.length, -1);
    expect(payload).toContain('Green');
    expect(payload).toContain('Line');
    expect(payload).not.toContain('[32m');
    expect(payload).not.toContain('\n');
    expect(payload).not.toContain('\r');
  });

  it('builds bounded attention notification content', () => {
    const content = buildRunEventNotificationContent({
      type: 'attention',
      heading: 'h'.repeat(400),
      detail: 'd'.repeat(400),
    });

    expect(content.title.length).toBeLessThanOrEqual(
      MAX_NOTIFICATION_TITLE_CHARS,
    );
    expect((content.subtitle ?? '').length).toBeLessThanOrEqual(
      MAX_NOTIFICATION_SUBTITLE_CHARS,
    );
    expect(content.body.length).toBeLessThanOrEqual(
      MAX_NOTIFICATION_BODY_CHARS,
    );
  });
});
