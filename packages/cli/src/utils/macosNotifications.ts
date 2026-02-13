/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, spawnAsync } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../config/settings.js';

export const MAX_MACOS_NOTIFICATION_TITLE_CHARS = 48;
export const MAX_MACOS_NOTIFICATION_SUBTITLE_CHARS = 64;
export const MAX_MACOS_NOTIFICATION_BODY_CHARS = 180;

const ELLIPSIS = '...';

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
    settings.merged.general.enableMacOsNotifications !== false
  );
}

function escapeAppleScriptString(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildAppleScript(content: MacOsNotificationContent): string {
  const title = `"${escapeAppleScriptString(content.title)}"`;
  const body = `"${escapeAppleScriptString(content.body)}"`;
  const subtitlePart = content.subtitle
    ? ` subtitle "${escapeAppleScriptString(content.subtitle)}"`
    : '';

  return `display notification ${body} with title ${title}${subtitlePart}`;
}

export async function notifyMacOs(
  settings: LoadedSettings,
  content: MacOsNotificationContent,
): Promise<boolean> {
  if (!isMacOsNotificationEnabled(settings)) {
    return false;
  }

  try {
    const script = buildAppleScript(sanitizeNotificationContent(content));
    await spawnAsync('osascript', ['-e', script]);
    return true;
  } catch (error) {
    debugLogger.debug('Failed to show macOS notification:', error);
    return false;
  }
}
