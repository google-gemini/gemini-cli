/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import notifier from 'node-notifier';
import process from 'node:process';
import { debugLogger } from '../../utils/debugLogger.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import {
  MessageBusType,
  type ToolConfirmationRequest,
  type NotificationRequest,
} from '../../confirmation-bus/types.js';
import {
  coreEvents,
  CoreEvent,
  type CoreEventEmitter,
} from '../../utils/events.js';

export interface NotificationConfig {
  enabled: boolean;
}

export interface NotificationOptions {
  title?: string;
  message: string;
  sound?: boolean;
  wait?: boolean;
  activate?: string;
  /**
   * If true, bypasses focus and config checks.
   * Useful for policy-mandated notifications.
   */
  force?: boolean;
}

export class NotificationService {
  private isFocused = true; // Default to focused

  constructor(
    private config: NotificationConfig,
    eventEmitter: CoreEventEmitter = coreEvents,
  ) {
    eventEmitter.on(CoreEvent.WindowFocusChanged, (payload) => {
      this.isFocused = payload.focused;
    });
  }

  notify(options: NotificationOptions): void {
    if (!this.config.enabled && !options.force) {
      debugLogger.debug('Notification suppressed (disabled in settings)');
      return;
    }

    if (!options.force) {
      // List of terminals that do not properly support focus detection.
      // In these terminals, we always send notifications.
      const unsupportedTerminals: string[] = ['WarpTerminal'];
      const currentTerminal = process.env['TERM_PROGRAM'];
      const isUnsupportedTerminal =
        currentTerminal && unsupportedTerminals.includes(currentTerminal);

      if (this.isFocused && !isUnsupportedTerminal) {
        // Don't notify if focused, unless it's an unsupported terminal
        return;
      }
    }

    const platform = process.platform;
    const isMac = platform === 'darwin';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notifierOptions: any = {
      title: options.title || 'Gemini CLI',
      message: options.message,
      sound: options.sound ?? false,
      wait: options.wait ?? false,
      force: options.force,
    };

    if (isMac) {
      if (options.activate) {
        notifierOptions.activate = options.activate;
      } else if (process.env['__CFBundleIdentifier']) {
        notifierOptions.activate = process.env['__CFBundleIdentifier'];
      }
    }

    try {
      notifier.notify(notifierOptions);
      debugLogger.debug(`Notification sent: ${options.message}`);
    } catch (error) {
      debugLogger.warn('Failed to send notification', error);
    }
  }

  updateConfig(config: NotificationConfig) {
    this.config = config;
  }

  subscribeToBus(bus: MessageBus): void {
    bus.subscribe(
      MessageBusType.TOOL_CONFIRMATION_REQUEST,
      (message: ToolConfirmationRequest) => {
        this.handleToolConfirmationRequest(message);
      },
    );

    bus.subscribe(
      MessageBusType.NOTIFICATION_REQUEST,
      (message: NotificationRequest) => {
        this.handleNotificationRequest(message);
      },
    );
  }

  private handleToolConfirmationRequest(
    message: ToolConfirmationRequest,
  ): void {
    const toolName = message.toolCall.name;
    this.notify({
      message: `Confirm: ${toolName}`,
    });
  }

  private handleNotificationRequest(message: NotificationRequest): void {
    this.notify({
      message: message.message,
      title: message.title,
      force: message.force,
    });
  }
}
