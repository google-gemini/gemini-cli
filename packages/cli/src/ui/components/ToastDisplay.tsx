/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useUIState, type UIState } from '../contexts/UIStateContext.js';
import { TransientMessageType } from '../../utils/events.js';

export function shouldShowToast(uiState: UIState): boolean {
  return Boolean(uiState.transientMessage);
}

export const ToastDisplay: React.FC = () => {
  const uiState = useUIState();

  if (
    uiState.transientMessage?.type === TransientMessageType.Warning &&
    uiState.transientMessage.message
  ) {
    return (
      <Text color={theme.status.warning}>{uiState.transientMessage.message}</Text>
    );
  }

  if (
    uiState.transientMessage?.type === TransientMessageType.Error &&
    uiState.transientMessage.message
  ) {
    return (
      <Text color={theme.status.error}>{uiState.transientMessage.message}</Text>
    );
  }

  if (
    uiState.transientMessage?.type === TransientMessageType.Hint &&
    uiState.transientMessage.message
  ) {
    return (
      <Text color={theme.text.secondary}>{uiState.transientMessage.message}</Text>
    );
  }

  if (
    uiState.transientMessage?.type === TransientMessageType.Accent &&
    uiState.transientMessage.message
  ) {
    return (
      <Text color={theme.text.accent}>{uiState.transientMessage.message}</Text>
    );
  }

  return null;
};
