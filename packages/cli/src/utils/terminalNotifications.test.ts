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
  TerminalNotificationMethod,
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
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('TMUX', '');
    vi.stubEnv('STY', '');
    vi.stubEnv('WT_SESSION', '');
    vi.stubEnv('TERM_PROGRAM', '');
    vi.stubEnv('TERM', '');
    vi.stubEnv('ALACRITTY_WINDOW_ID', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns false without writing when disabled', async () => {
    const shown = await notifyViaTerminal(false, {
      title: 't',
      body: 'b',
    });

    expect(shown).toBe(false);
    expect(writeToStdout).not.toHaveBeenCalled();
  });

  it('emits OSC 9 notification when iTerm2 is detected', async () => {
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

  it('emits OSC 777 for unknown terminals', async () => {
    const shown = await notifyViaTerminal(true, {
      title: 'Title',
      subtitle: 'Subtitle',
      body: 'Body',
    });

    expect(shown).toBe(true);
    expect(writeToStdout).toHaveBeenCalledTimes(1);
    const emitted = String(writeToStdout.mock.calls[0][0]);
    expect(emitted.startsWith('\x1b]777;notify;')).toBe(true);
  });

  it('uses BEL when Windows Terminal is detected', async () => {
    vi.stubEnv('WT_SESSION', '1');

    const shown = await notifyViaTerminal(true, {
      title: 'Title',
      body: 'Body',
    });

    expect(shown).toBe(true);
    expect(writeToStdout).toHaveBeenCalledWith('\x07');
  });

  it('uses BEL when Alacritty is detected', async () => {
    vi.stubEnv('ALACRITTY_WINDOW_ID', '1');

    const shown = await notifyViaTerminal(true, {
      title: 'Title',
      body: 'Body',
    });

    expect(shown).toBe(true);
    expect(writeToStdout).toHaveBeenCalledWith('\x07');
  });

  it('uses BEL when Apple Terminal is detected', async () => {
    vi.stubEnv('TERM_PROGRAM', 'Apple_Terminal');

    const shown = await notifyViaTerminal(true, {
      title: 'Title',
      body: 'Body',
    });

    expect(shown).toBe(true);
    expect(writeToStdout).toHaveBeenCalledWith('\x07');
  });

  it('uses BEL when VSCode Terminal is detected', async () => {
    vi.stubEnv('TERM_PROGRAM', 'vscode');

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

  it('emits OSC 9 notification when method is explicitly set to osc9', async () => {
    // Explicitly set terminal to something that would normally use BEL
    vi.stubEnv('WT_SESSION', '1');

    const shown = await notifyViaTerminal(
      true,
      {
        title: 'Explicit OSC 9',
        body: 'Body',
      },
      TerminalNotificationMethod.Osc9,
    );

    expect(shown).toBe(true);
    expect(writeToStdout).toHaveBeenCalledTimes(1);
    const emitted = String(writeToStdout.mock.calls[0][0]);
    expect(emitted.startsWith('\x1b]9;')).toBe(true);
    expect(emitted.endsWith('\x07')).toBe(true);
    expect(emitted).toContain('Explicit OSC 9');
  });

  it('emits OSC 777 notification when method is explicitly set to osc777', async () => {
    // Explicitly set terminal to something that would normally use BEL
    vi.stubEnv('WT_SESSION', '1');
    const shown = await notifyViaTerminal(
      true,
      {
        title: 'Explicit OSC 777',
        body: 'Body',
      },
      TerminalNotificationMethod.Osc777,
    );

    expect(shown).toBe(true);
    expect(writeToStdout).toHaveBeenCalledTimes(1);
    const emitted = String(writeToStdout.mock.calls[0][0]);
    expect(emitted.startsWith('\x1b]777;notify;')).toBe(true);
    expect(emitted.endsWith('\x07')).toBe(true);
    expect(emitted).toContain('Explicit OSC 777');
  });

  it('emits BEL notification when method is explicitly set to bell', async () => {
    // Explicitly set terminal to something that supports OSC 9
    vi.stubEnv('TERM_PROGRAM', 'iTerm.app');

    const shown = await notifyViaTerminal(
      true,
      {
        title: 'Explicit BEL',
        body: 'Body',
      },
      TerminalNotificationMethod.Bell,
    );

    expect(shown).toBe(true);
    expect(writeToStdout).toHaveBeenCalledTimes(1);
    expect(writeToStdout).toHaveBeenCalledWith('\x07');
  });

  it('replaces semicolons with colons in OSC 777 to avoid breaking the sequence', async () => {
    const shown = await notifyViaTerminal(
      true,
      {
        title: 'Title; with; semicolons',
        subtitle: 'Sub;title',
        body: 'Body; with; semicolons',
      },
      TerminalNotificationMethod.Osc777,
    );

    expect(shown).toBe(true);
    const emitted = String(writeToStdout.mock.calls[0][0]);

    // Format: \x1b]777;notify;title;body\x07
    expect(emitted).toContain('Title: with: semicolons');
    expect(emitted).toContain('Sub:title');
    expect(emitted).toContain('Body: with: semicolons');
    expect(emitted).not.toContain('Title; with; semicolons');
    expect(emitted).not.toContain('Body; with; semicolons');

    // Extract everything after '\x1b]777;notify;' and before '\x07'
    const payload = emitted.slice('\x1b]777;notify;'.length, -1);

    // There should be exactly one semicolon separating title and body
    const semicolonsCount = (payload.match(/;/g) || []).length;
    expect(semicolonsCount).toBe(1);
  });

  it('wraps OSC sequence in tmux passthrough when TMUX env var is set', async () => {
    vi.stubEnv('TMUX', '1');
    vi.stubEnv('TERM_PROGRAM', 'iTerm.app');

    const shown = await notifyViaTerminal(true, {
      title: 'Title',
      body: 'Body',
    });

    expect(shown).toBe(true);
    expect(writeToStdout).toHaveBeenCalledTimes(1);
    const emitted = String(writeToStdout.mock.calls[0][0]);
    expect(emitted.startsWith('\x1bPtmux;\x1b\x1b]9;')).toBe(true);
    expect(emitted.endsWith('\x1b\\')).toBe(true);
  });

  it('wraps OSC sequence in GNU screen passthrough when STY env var is set', async () => {
    vi.stubEnv('STY', '1');
    vi.stubEnv('TERM_PROGRAM', 'iTerm.app');

    const shown = await notifyViaTerminal(true, {
      title: 'Title',
      body: 'Body',
    });

    expect(shown).toBe(true);
    expect(writeToStdout).toHaveBeenCalledTimes(1);
    const emitted = String(writeToStdout.mock.calls[0][0]);
    expect(emitted.startsWith('\x1bP\x1b]9;')).toBe(true);
    expect(emitted.endsWith('\x1b\\')).toBe(true);
  });
});
