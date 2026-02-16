/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type MacOsNotificationEvent } from '../../utils/macosNotifications.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';
import {
  type ConfirmationRequest,
  type HistoryItemWithoutId,
  type IndividualToolCallDisplay,
  type PermissionConfirmationRequest,
} from '../types.js';

export interface PendingAttentionNotification {
  key: string;
  event: MacOsNotificationEvent;
}

function getFirstConfirmingTool(
  pendingHistoryItems: HistoryItemWithoutId[],
): IndividualToolCallDisplay | null {
  for (const item of pendingHistoryItems) {
    if (item.type !== 'tool_group') {
      continue;
    }

    const confirmingTool = item.tools.find(
      (tool) => tool.status === CoreToolCallStatus.AwaitingApproval,
    );
    if (confirmingTool) {
      return confirmingTool;
    }
  }

  return null;
}

export function getPendingAttentionNotification(
  pendingHistoryItems: HistoryItemWithoutId[],
  commandConfirmationRequest: ConfirmationRequest | null,
  authConsentRequest: ConfirmationRequest | null,
  permissionConfirmationRequest: PermissionConfirmationRequest | null,
  hasConfirmUpdateExtensionRequests: boolean,
  hasLoopDetectionConfirmationRequest: boolean,
): PendingAttentionNotification | null {
  const confirmingTool = getFirstConfirmingTool(pendingHistoryItems);
  if (confirmingTool) {
    const details = confirmingTool.confirmationDetails;
    if (details?.type === 'ask_user') {
      const firstQuestion = details.questions.at(0)?.header;
      return {
        key: `ask_user:${confirmingTool.callId}`,
        event: {
          type: 'attention',
          heading: 'Answer requested by agent',
          detail: firstQuestion || 'The agent needs your response to continue.',
        },
      };
    }

    const toolTitle = details?.title || confirmingTool.description;
    return {
      key: `tool_confirmation:${confirmingTool.callId}`,
      event: {
        type: 'attention',
        heading: 'Approval required',
        detail: toolTitle
          ? `Approve tool action: ${toolTitle}`
          : 'Approve a pending tool action to continue.',
      },
    };
  }

  if (commandConfirmationRequest) {
    return {
      key: 'command_confirmation',
      event: {
        type: 'attention',
        heading: 'Confirmation required',
        detail: 'A command is waiting for your confirmation.',
      },
    };
  }

  if (authConsentRequest) {
    return {
      key: 'auth_consent',
      event: {
        type: 'attention',
        heading: 'Authentication confirmation required',
        detail: 'Authentication is waiting for your confirmation.',
      },
    };
  }

  if (permissionConfirmationRequest) {
    return {
      key: 'filesystem_permission_confirmation',
      event: {
        type: 'attention',
        heading: 'Filesystem permission required',
        detail: 'Read-only path access is waiting for your confirmation.',
      },
    };
  }

  if (hasConfirmUpdateExtensionRequests) {
    return {
      key: 'extension_update_confirmation',
      event: {
        type: 'attention',
        heading: 'Extension update confirmation required',
        detail: 'An extension update is waiting for your confirmation.',
      },
    };
  }

  if (hasLoopDetectionConfirmationRequest) {
    return {
      key: 'loop_detection_confirmation',
      event: {
        type: 'attention',
        heading: 'Loop detection confirmation required',
        detail: 'A loop detection prompt is waiting for your response.',
      },
    };
  }

  return null;
}
