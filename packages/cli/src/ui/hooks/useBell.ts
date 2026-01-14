/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { useStdout } from 'ink';
import { useSettings } from '../contexts/SettingsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import {
  debugLogger,
  MessageBusType,
  NotificationType,
  type HookExecutionRequest,
} from '@google/gemini-cli-core';

export const useBell = () => {
  const { stdout } = useStdout();
  const { merged: settings } = useSettings();
  const config = useConfig();

  const bellEnabled = settings.ui?.bell;
  const bellDurationThreshold = settings.ui?.bellDurationThreshold ?? 10;

  // Track start time of the current operation
  const startTime = useRef<number | null>(null);

  useEffect(() => {
    if (!bellEnabled) {
      return;
    }

    const messageBus = config.getMessageBus();

    const handler = (message: HookExecutionRequest) => {
      const { eventName, input } = message;

      // Start timer on operation start
      if (eventName === 'BeforeAgent' || eventName === 'BeforeTool') {
        if (startTime.current === null) {
          startTime.current = Date.now();
        }
        return;
      }

      // Check for notifications that might trigger a bell
      if (eventName === 'Notification') {
        const notificationType = input['notification_type'] as NotificationType;

        if (
          notificationType === NotificationType.OperationComplete ||
          notificationType === NotificationType.ActionRequired ||
          notificationType === NotificationType.ToolPermission
        ) {
          const duration = startTime.current
            ? (Date.now() - startTime.current) / 1000
            : 0;

          if (duration >= bellDurationThreshold) {
            try {
              // Write bell character to stdout
              stdout.write('\x07');
            } catch (e) {
              debugLogger.error('Failed to write bell character', e);
            }
          }

          // Reset timer after operation complete
          if (notificationType === NotificationType.OperationComplete) {
            startTime.current = null;
          }
        }
      }
    };

    messageBus.subscribe(MessageBusType.HOOK_EXECUTION_REQUEST, handler);

    return () => {
      messageBus.unsubscribe(MessageBusType.HOOK_EXECUTION_REQUEST, handler);
    };
  }, [bellEnabled, bellDurationThreshold, config, stdout]);
};
