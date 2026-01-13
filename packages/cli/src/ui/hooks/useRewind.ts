/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import type {
  ConversationRecord,
  MessageRecord,
} from '@google/gemini-cli-core';
import {
  calculateTurnStats,
  calculateRewindImpact,
  type FileChangeStats,
} from '../utils/rewindFileOps.js';

export function useRewind(conversation: ConversationRecord) {
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );
  const [confirmationStats, setConfirmationStats] =
    useState<FileChangeStats | null>(null);

  const getStats = useCallback(
    (userMessage: MessageRecord) =>
      calculateTurnStats(conversation, userMessage),
    [conversation],
  );

  const selectMessage = useCallback(
    (messageId: string) => {
      const msg = conversation.messages.find((m) => m.id === messageId);
      if (msg) {
        setSelectedMessageId(messageId);
        setConfirmationStats(calculateRewindImpact(conversation, msg));
      }
    },
    [conversation],
  );

  const clearSelection = useCallback(() => {
    setSelectedMessageId(null);
    setConfirmationStats(null);
  }, []);

  return {
    selectedMessageId,
    getStats,
    confirmationStats,
    selectMessage,
    clearSelection,
  };
}
