/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, writeToStdout } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../config/settings.js';
import { sanitizeForDisplay } from '../ui/utils/textUtils.js';
import { TerminalCapabilityManager } from '../ui/utils/terminalCapabilityManager.js';

export const MAX_NOTIFICATION_TITLE_CHARS = 48;
export const MAX_NOTIFICATION_SUBTITLE_CHARS = 64;
export const MAX_NOTIFICATION_BODY_CHARS = 180;

const BEL = '\x07';
const OSC9_PREFIX = '\x1b]9;';
const OSC777_PREFIX = '\x1b]777;notify;';
const OSC_TEXT_SEPARATOR = ' | ';

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

function sanitizeNotificationContent(
  content: RunEventNotificationContent,
): RunEventNotificationContent {
  const title = sanitizeForDisplay(content.title, MAX_NOTIFICATION_TITLE_CHARS);
  const subtitle = content.subtitle
    ? sanitizeForDisplay(content.subtitle, MAX_NOTIFICATION_SUBTITLE_CHARS)
    : undefined;
  const body = sanitizeForDisplay(content.body, MAX_NOTIFICATION_BODY_CHARS);

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
    | { enableNotifications?: boolean }
    | undefined;

  return general?.enableNotifications === true;
}

export enum TerminalNotificationMethod {
  Auto = 'auto',
  Osc9 = 'osc9',
  Osc777 = 'osc777',
  Bell = 'bell',
}

export function getNotificationMethod(
  settings: LoadedSettings,
): TerminalNotificationMethod {
  switch (settings.merged.general?.notificationMethod) {
    case TerminalNotificationMethod.Osc9:
      return TerminalNotificationMethod.Osc9;
    case TerminalNotificationMethod.Osc777:
      return TerminalNotificationMethod.Osc777;
    case TerminalNotificationMethod.Bell:
      return TerminalNotificationMethod.Bell;
    default:
      return TerminalNotificationMethod.Auto;
  }
}

function wrapWithPassthrough(sequence: string): string {
  const capabilityManager = TerminalCapabilityManager.getInstance();
  if (capabilityManager.isTmux()) {
    // eslint-disable-next-line no-control-regex
    return `\x1bPtmux;${sequence.replace(/\x1b/g, '\x1b\x1b')}\x1b\\`;
  } else if (capabilityManager.isScreen()) {
    return `\x1bP${sequence}\x1b\\`;
  }
  return sequence;
}

function emitOsc9Notification(content: RunEventNotificationContent): void {
  const sanitized = sanitizeNotificationContent(content);
  const pieces = [sanitized.title, sanitized.subtitle, sanitized.body].filter(
    Boolean,
  );
  const combined = pieces.join(OSC_TEXT_SEPARATOR);

  writeToStdout(wrapWithPassthrough(`${OSC9_PREFIX}${combined}${BEL}`));
}

function emitOsc777Notification(content: RunEventNotificationContent): void {
  const sanitized = sanitizeNotificationContent(content);
  const bodyParts = [sanitized.subtitle, sanitized.body].filter(Boolean);
  const body = bodyParts.join(OSC_TEXT_SEPARATOR);

  // Replace ';' with ':' to avoid breaking the OSC 777 sequence
  const safeTitle = sanitized.title.replace(/;/g, ':');
  const safeBody = body.replace(/;/g, ':');

  writeToStdout(
    wrapWithPassthrough(`${OSC777_PREFIX}${safeTitle};${safeBody}${BEL}`),
  );
}

function emitBellNotification(): void {
  writeToStdout(BEL);
}

export async function notifyViaTerminal(
  notificationsEnabled: boolean,
  content: RunEventNotificationContent,
  method: TerminalNotificationMethod = TerminalNotificationMethod.Auto,
): Promise<boolean> {
  if (!notificationsEnabled) {
    return false;
  }

  try {
    if (method === TerminalNotificationMethod.Osc9) {
      emitOsc9Notification(content);
    } else if (method === TerminalNotificationMethod.Osc777) {
      emitOsc777Notification(content);
    } else if (method === TerminalNotificationMethod.Bell) {
      emitBellNotification();
    } else {
      // auto
      const capabilityManager = TerminalCapabilityManager.getInstance();
      if (capabilityManager.isITerm2()) {
        emitOsc9Notification(content);
      } else if (
        capabilityManager.isAlacritty() ||
        capabilityManager.isAppleTerminal() ||
        capabilityManager.isVSCodeTerminal() ||
        capabilityManager.isWindowsTerminal()
      ) {
        emitBellNotification();
      } else {
        emitOsc777Notification(content);
      }
    }

    return true;
  } catch (error) {
    debugLogger.debug('Failed to emit terminal notification:', error);
    return false;
  }
}
