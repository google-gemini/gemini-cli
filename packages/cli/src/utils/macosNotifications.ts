/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, writeToStdout } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../config/settings.js';

export const MAX_MACOS_NOTIFICATION_TITLE_CHARS = 48;
export const MAX_MACOS_NOTIFICATION_SUBTITLE_CHARS = 64;
export const MAX_MACOS_NOTIFICATION_BODY_CHARS = 180;

const ELLIPSIS = '...';
const BEL = '\x07';
const OSC9_PREFIX = '\x1b]9;';
const MAX_OSC9_MESSAGE_CHARS = 220;
const ESC = '\x1b';
const ESC_CODE = ESC.charCodeAt(0);
const BEL_CODE = BEL.charCodeAt(0);
const ESC_BACKSLASH = '\\';
const OSC_START_CODE = ']'.charCodeAt(0);
const CSI_START_CODE = '['.charCodeAt(0);
const DCS_START_CODE = 'P'.charCodeAt(0);
const PM_START_CODE = '^'.charCodeAt(0);
const APC_START_CODE = '_'.charCodeAt(0);

let graphemeSegmenter: Intl.Segmenter | undefined;
function getGraphemeSegmenter(): Intl.Segmenter | undefined {
  if (graphemeSegmenter !== undefined) {
    return graphemeSegmenter;
  }

  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    return graphemeSegmenter;
  }

  return undefined;
}

function splitIntoGraphemes(input: string): string[] {
  const segmenter = getGraphemeSegmenter();
  if (!segmenter) {
    return Array.from(input);
  }

  return Array.from(segmenter.segment(input), (segment) => segment.segment);
}

export interface MacOsNotificationContent {
  title: string;
  subtitle?: string;
  body: string;
}

export type MacOsNotificationEvent =
  | {
      type: 'attention';
      heading?: string;
      detail?: string;
    }
  | {
      type: 'session_complete';
      detail?: string;
    };

function normalizeText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function truncateForMacNotification(
  input: string,
  maxChars: number,
): string {
  if (maxChars <= 0) {
    return '';
  }

  const normalized = normalizeText(input);
  const graphemes = splitIntoGraphemes(normalized);
  if (graphemes.length <= maxChars) {
    return normalized;
  }

  if (maxChars <= ELLIPSIS.length) {
    return ELLIPSIS.slice(0, maxChars);
  }

  return `${graphemes.slice(0, maxChars - ELLIPSIS.length).join('')}${ELLIPSIS}`;
}

function sanitizeNotificationContent(
  content: MacOsNotificationContent,
): MacOsNotificationContent {
  const title = truncateForMacNotification(
    content.title,
    MAX_MACOS_NOTIFICATION_TITLE_CHARS,
  );
  const subtitle = content.subtitle
    ? truncateForMacNotification(
        content.subtitle,
        MAX_MACOS_NOTIFICATION_SUBTITLE_CHARS,
      )
    : undefined;
  const body = truncateForMacNotification(
    content.body,
    MAX_MACOS_NOTIFICATION_BODY_CHARS,
  );

  return {
    title: title || 'Gemini CLI',
    subtitle: subtitle || undefined,
    body: body || 'Open Gemini CLI for details.',
  };
}

export function buildMacNotificationContent(
  event: MacOsNotificationEvent,
): MacOsNotificationContent {
  if (event.type === 'attention') {
    return sanitizeNotificationContent({
      title: 'Gemini CLI needs your attention',
      subtitle: event.heading ?? 'Action required',
      body: event.detail ?? 'Open Gemini CLI to continue.',
    });
  }

  return sanitizeNotificationContent({
    title: 'Gemini CLI session complete',
    subtitle: 'Run finished',
    body: event.detail ?? 'The session finished successfully.',
  });
}

export function isMacOsNotificationEnabled(settings: LoadedSettings): boolean {
  return (
    process.platform === 'darwin' &&
    settings.merged.general.enableMacOsNotifications === true
  );
}

export function supportsOsc9Notifications(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env['WT_SESSION']) {
    return false;
  }

  if (env['TERM_PROGRAM'] === 'WezTerm' || env['TERM_PROGRAM'] === 'ghostty') {
    return true;
  }

  if (env['ITERM_SESSION_ID']) {
    return true;
  }

  return (
    env['TERM'] === 'xterm-kitty' ||
    env['TERM'] === 'wezterm' ||
    env['TERM'] === 'wezterm-mux'
  );
}

function buildTerminalNotificationMessage(
  content: MacOsNotificationContent,
): string {
  const pieces = [content.title, content.subtitle, content.body].filter(
    Boolean,
  );
  const combined = pieces.join(' | ');
  return truncateForMacNotification(combined, MAX_OSC9_MESSAGE_CHARS);
}

function stripTerminalControlChars(input: string): string {
  let output = '';
  let i = 0;

  while (i < input.length) {
    const code = input.charCodeAt(i);

    if (code === BEL_CODE) {
      i += 1;
      continue;
    }

    if (code !== ESC_CODE) {
      output += input[i];
      i += 1;
      continue;
    }

    const nextCode = input.charCodeAt(i + 1);

    // CSI: ESC [ ... final-byte
    if (nextCode === CSI_START_CODE) {
      i += 2;
      while (i < input.length) {
        const c = input.charCodeAt(i);
        if (c >= 0x40 && c <= 0x7e) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    // OSC/DCS/PM/APC: ESC ]|P|^|_ ... BEL or ESC \
    if (
      nextCode === OSC_START_CODE ||
      nextCode === DCS_START_CODE ||
      nextCode === PM_START_CODE ||
      nextCode === APC_START_CODE
    ) {
      i += 2;
      while (i < input.length) {
        const c = input.charCodeAt(i);
        if (c === BEL_CODE) {
          i += 1;
          break;
        }
        if (
          c === ESC_CODE &&
          input.charCodeAt(i + 1) === ESC_BACKSLASH.charCodeAt(0)
        ) {
          i += 2;
          break;
        }
        i += 1;
      }
      continue;
    }

    // Other two-byte ESC sequences.
    i += 2;
  }

  return output.replace(/[\r\n]+/g, ' ').trim();
}

function emitOsc9Notification(content: MacOsNotificationContent): void {
  const message = stripTerminalControlChars(
    buildTerminalNotificationMessage(content),
  );
  writeToStdout(`${OSC9_PREFIX}${message}${BEL}`);
}

function emitBellNotification(): void {
  writeToStdout(BEL);
}

function emitTerminalNotification(content: MacOsNotificationContent): void {
  if (supportsOsc9Notifications()) {
    emitOsc9Notification(content);
    return;
  }
  emitBellNotification();
}

export async function notifyMacOs(
  notificationsEnabled: boolean,
  content: MacOsNotificationContent,
): Promise<boolean> {
  if (!notificationsEnabled || process.platform !== 'darwin') {
    return false;
  }

  try {
    emitTerminalNotification(sanitizeNotificationContent(content));
    return true;
  } catch (error) {
    debugLogger.debug('Failed to emit terminal notification:', error);
    return false;
  }
}
