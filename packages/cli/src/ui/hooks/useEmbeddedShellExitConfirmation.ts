/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text } from 'ink';
import { useState, useEffect, createElement, useCallback } from 'react';
import { type PartListUnion } from '@google/genai';
import type { SlashCommandProcessorResult } from '../types.js';

export function useEmbeddedShellExitConfirmation(
  handleSlashCommand: (
    rawQuery: PartListUnion,
  ) => Promise<SlashCommandProcessorResult | false>,
) {
  const [isExitingEmbeddingShell, setIsExitingEmbeddingShell] = useState(false);
  const [triggerEmbeddedShellExit, setTriggerEmbeddedShellExit] =
    useState(false);
  const [
    embeddedShellExitConfirmationRequest,
    setEmbeddedShellExitConfirmationRequest,
  ] = useState<null | {
    prompt: React.ReactNode;
    onConfirm: (confirmed: boolean) => void;
  }>(null);

  const quit = useCallback(() => {
    handleSlashCommand('/quit');
  }, [handleSlashCommand]);

  useEffect(() => {
    if (triggerEmbeddedShellExit) {
      setTriggerEmbeddedShellExit(false);
      setEmbeddedShellExitConfirmationRequest({
        prompt: createElement(
          Text,
          null,
          'Are you sure you want to quit? Any unsaved conversation history will be lost.',
        ),
        onConfirm: (answer) => {
          setEmbeddedShellExitConfirmationRequest(null);
          if (answer) quit();
        },
      });
    }
  }, [triggerEmbeddedShellExit, quit]);

  return {
    embeddedShellExitConfirmationRequest,
    setTriggerEmbeddedShellExit,
    isExitingEmbeddingShell,
    setIsExitingEmbeddingShell,
  };
}
