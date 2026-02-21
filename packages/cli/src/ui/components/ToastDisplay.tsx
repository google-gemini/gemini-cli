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
  return (
    uiState.ctrlCPressedOnce ||
    Boolean(uiState.transientMessage) ||
    uiState.ctrlDPressedOnce ||
    (uiState.showEscapePrompt &&
      (uiState.buffer.text.length > 0 || uiState.history.length > 0)) ||
    Boolean(uiState.queueErrorMessage) ||
    uiState.showIsExpandableHint
  );
}

export const ToastDisplay: React.FC = () => {
  const uiState = useUIState();

  if (uiState.ctrlCPressedOnce) {
    return (
      <Text color={theme.status.warning}>Press Ctrl+C again to exit.</Text>
    );
  }

  if (
    uiState.transientMessage?.type === TransientMessageType.Warning &&
    uiState.transientMessage.text
  ) {
    return (
      <Text color={theme.status.warning}>{uiState.transientMessage.text}</Text>
    );
  }

  if (uiState.ctrlDPressedOnce) {
    return (
      <Text color={theme.status.warning}>Press Ctrl+D again to exit.</Text>
    );
  }

  if (uiState.showEscapePrompt) {
    const isPromptEmpty = uiState.buffer.text.length === 0;
    const hasHistory = uiState.history.length > 0;

    if (isPromptEmpty && !hasHistory) {
      return null;
    }

    return (
      <Text color={theme.text.secondary}>
        Press Esc again to {isPromptEmpty ? 'rewind' : 'clear prompt'}.
      </Text>
    );
  }

  if (
    uiState.transientMessage?.type === TransientMessageType.Hint &&
    uiState.transientMessage.text
  ) {
    return (
      <Text color={theme.text.secondary}>{uiState.transientMessage.text}</Text>
    );
  }

  if (uiState.queueErrorMessage) {
    return <Text color={theme.status.error}>{uiState.queueErrorMessage}</Text>;
  }

  if (uiState.showIsExpandableHint) {
    const action = uiState.constrainHeight ? 'show more' : 'collapse';
    return (
      <Text color={theme.text.accent}>
        Press Ctrl+O to {action} lines for the most recent response
      </Text>
    );
  }

  return null;
};
