/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState } from 'react';
import type {
  ConversationRecord,
  MessageRecord,
} from '@google/gemini-cli-core';
import {
  calculateTurnStats,
  calculateRewindImpact,
  type FileChangeStats,
} from '../utils/rewindFileOps.js';

export function useRewindLogic(conversation: ConversationRecord) {
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );
  const [confirmationStats, setConfirmationStats] =
    useState<FileChangeStats | null>(null);

  const interactions = useMemo(() => {
    const prompts: MessageRecord[] = [];

    for (const msg of conversation.messages) {
      if (msg.type === 'user') {
        prompts.push(msg);
      }
    }
    return prompts;
  }, [conversation.messages]);

  const getStats = (userMessage: MessageRecord) =>
    calculateTurnStats(conversation, userMessage);

  const selectMessage = (messageId: string) => {
    const msg = conversation.messages.find((m) => m.id === messageId);
    if (msg) {
      setSelectedMessageId(messageId);
      setConfirmationStats(calculateRewindImpact(conversation, msg));
    }
  };

  const clearSelection = () => {
    setSelectedMessageId(null);
    setConfirmationStats(null);
  };

  return {
    interactions,
    selectedMessageId,
    getStats,
    confirmationStats,
    selectMessage,
    clearSelection,
  };
}
