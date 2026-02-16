/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, writeToStdout } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../config/settings.js';
import { cpLen, cpSlice, stripUnsafeCharacters } from '../ui/utils/textUtils.js';

export const MAX_NOTIFICATION_TITLE_CHARS = 48;
export const MAX_NOTIFICATION_SUBTITLE_CHARS = 64;
export const MAX_NOTIFICATION_BODY_CHARS = 180;

const ELLIPSIS = '...';
const BEL = '\x07';
const OSC9_PREFIX = '\x1b]9;';
const OSC9_SEPARATOR = ' | ';
const MAX_OSC9_MESSAGE_CHARS =
  MAX_NOTIFICATION_TITLE_CHARS +
  MAX_NOTIFICATION_SUBTITLE_CHARS +
  MAX_NOTIFICATION_BODY_CHARS +
  OSC9_SEPARATOR.length * 2;

export interface RunEventNotificationContent {
  title: string;
  subtitle?: string;
  body: string;
}

export type RunEventNotificationEvent =
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
  return stripUnsafeCharacters(input).replace(/\s+/g, ' ').trim();
}

export function truncateForNotification(input: string, maxChars: number): string {
  if (maxChars <= 0) {
    return '';
  }

  const normalized = normalizeText(input);
  if (cpLen(normalized) <= maxChars) {
    return normalized;
  }

  if (maxChars <= ELLIPSIS.length) {
    return ELLIPSIS.slice(0, maxChars);
  }

  return `${cpSlice(normalized, 0, maxChars - ELLIPSIS.length)}${ELLIPSIS}`;
}

function sanitizeNotificationContent(
  content: RunEventNotificationContent,
): RunEventNotificationContent {
  const title = truncateForNotification(content.title, MAX_NOTIFICATION_TITLE_CHARS);
  const subtitle = content.subtitle
    ? truncateForNotification(content.subtitle, MAX_NOTIFICATION_SUBTITLE_CHARS)
    : undefined;
  const body = truncateForNotification(content.body, MAX_NOTIFICATION_BODY_CHARS);

  return {
    title: title || 'Gemini CLI',
    subtitle: subtitle || undefined,
    body: body || 'Open Gemini CLI for details.',
  };
}

export function buildRunEventNotificationContent(
  event: RunEventNotificationEvent,
): RunEventNotificationContent {
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

export function isNotificationsEnabled(settings: LoadedSettings): boolean {
  const general = settings.merged.general as
    | {
        enableNotifications?: boolean;
        enableMacOsNotifications?: boolean;
      }
    | undefined;

  return (
    process.platform === 'darwin' &&
    (general?.enableNotifications === true ||
      general?.enableMacOsNotifications === true)
  );
}

function hasOsc9TerminalSignature(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();
  return (
    normalized.includes('wezterm') ||
    normalized.includes('ghostty') ||
    normalized.includes('iterm') ||
    normalized.includes('kitty')
  );
}

export function supportsOsc9Notifications(
  env: NodeJS.ProcessEnv = process.env,
  terminalName?: string,
): boolean {
  if (env['WT_SESSION']) {
    return false;
  }

  return (
    hasOsc9TerminalSignature(terminalName) ||
    hasOsc9TerminalSignature(env['TERM_PROGRAM']) ||
    hasOsc9TerminalSignature(env['TERM'])
  );
}

function buildTerminalNotificationMessage(
  content: RunEventNotificationContent,
): string {
  const pieces = [content.title, content.subtitle, content.body].filter(Boolean);
  const combined = pieces.join(OSC9_SEPARATOR);
  return truncateForNotification(combined, MAX_OSC9_MESSAGE_CHARS);
}

function emitOsc9Notification(content: RunEventNotificationContent, terminalName?: string): void {
  const message = buildTerminalNotificationMessage(content);
  if (!supportsOsc9Notifications(process.env, terminalName)) {
    writeToStdout(BEL);
    return;
  }

  writeToStdout(`${OSC9_PREFIX}${message}${BEL}`);
}

export async function notifyViaTerminal(
  notificationsEnabled: boolean,
  content: RunEventNotificationContent,
  terminalName?: string,
): Promise<boolean> {
  if (!notificationsEnabled || process.platform !== 'darwin') {
    return false;
  }

  try {
    emitOsc9Notification(sanitizeNotificationContent(content), terminalName);
    return true;
  } catch (error) {
    debugLogger.debug('Failed to emit terminal notification:', error);
    return false;
  }
}
