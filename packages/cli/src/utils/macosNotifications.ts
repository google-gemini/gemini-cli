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
  if (normalized.length <= maxChars) {
    return normalized;
  }

  if (maxChars <= ELLIPSIS.length) {
    return ELLIPSIS.slice(0, maxChars);
  }

  return `${normalized.slice(0, maxChars - ELLIPSIS.length)}${ELLIPSIS}`;
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
  const pieces = [content.title, content.subtitle, content.body].filter(Boolean);
  const combined = pieces.join(' | ');
  return truncateForMacNotification(combined, MAX_OSC9_MESSAGE_CHARS);
}

function stripTerminalControlChars(input: string): string {
  return input
    .replace(/\x1b/g, '')
    .replace(/\x07/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
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
  settings: LoadedSettings,
  content: MacOsNotificationContent,
): Promise<boolean> {
  if (!isMacOsNotificationEnabled(settings)) {
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
