/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import type { HistoryItemCompression } from '../types.js';
import { MessageType } from '../types.js';
import type { SlashCommand, CommandContext } from './types.js';
import { CommandKind } from './types.js';
import { GoalSelectionPrompt } from '../components/GoalSelectionPrompt.js';
import { CustomGoalInput } from '../components/CustomGoalInput.js';
import type { GeminiClient, CompressionOptions } from '@google/gemini-cli-core';

interface CompressionDialogProps {
  goals: string[];
  geminiClient: GeminiClient;
  promptId: string;
  terminalWidth: number;
  onComplete: () => void;
  addItem: CommandContext['ui']['addItem'];
  setPendingItem: CommandContext['ui']['setPendingItem'];
  /** Whether this is a safety valve trigger (for manual /compress, always false) */
  isSafetyValve?: boolean;
}

type DialogState =
  | { type: 'goal_selection' }
  | { type: 'custom_input' }
  | { type: 'compressing' };

/**
 * Dialog component that handles the goal selection and compression flow
 */
const CompressionDialog = (props: CompressionDialogProps) => {
  const {
    goals,
    geminiClient,
    promptId,
    terminalWidth,
    onComplete,
    addItem,
    setPendingItem,
    isSafetyValve = false,
  } = props;

  const [dialogState, setDialogState] = useState<DialogState>({
    type: 'goal_selection',
  });

  const performCompression = useCallback(
    async (selectedGoal: string | null) => {
      setDialogState({ type: 'compressing' });
      onComplete(); // Close dialog before showing pending state

      const pendingMessage: HistoryItemCompression = {
        type: MessageType.COMPRESSION,
        compression: {
          isPending: true,
          originalTokenCount: null,
          newTokenCount: null,
          compressionStatus: null,
        },
      };

      try {
        setPendingItem(pendingMessage);

        // Create compression options based on goal selection
        const options: CompressionOptions | undefined = selectedGoal
          ? {
              userGoal: selectedGoal,
              preserveStrategy: 'since-last-prompt',
            }
          : undefined;

        const compressed = await geminiClient.tryCompressChat(
          promptId,
          true,
          options,
        );

        if (compressed) {
          addItem(
            {
              type: MessageType.COMPRESSION,
              compression: {
                isPending: false,
                originalTokenCount: compressed.originalTokenCount,
                newTokenCount: compressed.newTokenCount,
                compressionStatus: compressed.compressionStatus,
              },
            } as HistoryItemCompression,
            Date.now(),
          );
        } else {
          addItem(
            {
              type: MessageType.ERROR,
              text: 'Failed to compress chat history.',
            },
            Date.now(),
          );
        }
      } catch (e) {
        addItem(
          {
            type: MessageType.ERROR,
            text: `Failed to compress chat history: ${
              e instanceof Error ? e.message : String(e)
            }`,
          },
          Date.now(),
        );
      } finally {
        setPendingItem(null);
      }
    },
    [geminiClient, promptId, onComplete, addItem, setPendingItem],
  );

  const handleGoalSelect = useCallback(
    (goal: string | 'auto' | 'other' | 'disable' | 'less_frequent' | null) => {
      if (goal === 'other') {
        // Show custom goal input
        setDialogState({ type: 'custom_input' });
      } else if (goal === 'disable' || goal === 'less_frequent') {
        // For /compress command, these preference options just do auto-compress
        // The user can change settings via /settings if they want to disable
        performCompression(null);
      } else if (goal === 'auto' || goal === null) {
        // Auto compress without specific goal
        performCompression(null);
      } else {
        // User selected a specific goal
        performCompression(goal);
      }
    },
    [performCompression],
  );

  const handleCustomGoalSubmit = useCallback(
    (customGoal: string) => {
      // If empty, fall back to auto
      performCompression(customGoal.trim() || null);
    },
    [performCompression],
  );

  const handleCustomGoalCancel = useCallback(() => {
    // Cancel goes back to goal selection or just auto-compress
    performCompression(null);
  }, [performCompression]);

  // Don't render anything during compression - we already closed the dialog
  if (dialogState.type === 'compressing') {
    return null;
  }

  if (dialogState.type === 'custom_input') {
    return (
      <CustomGoalInput
        terminalWidth={terminalWidth}
        onSubmit={handleCustomGoalSubmit}
        onCancel={handleCustomGoalCancel}
      />
    );
  }

  return (
    <GoalSelectionPrompt
      goals={goals}
      terminalWidth={terminalWidth}
      isSafetyValve={isSafetyValve}
      onSelect={handleGoalSelect}
    />
  );
};

/**
 * Helper function to perform basic compression without goal selection
 */
async function performBasicCompression(context: CommandContext): Promise<void> {
  const { ui } = context;

  const pendingMessage: HistoryItemCompression = {
    type: MessageType.COMPRESSION,
    compression: {
      isPending: true,
      originalTokenCount: null,
      newTokenCount: null,
      compressionStatus: null,
    },
  };

  try {
    ui.setPendingItem(pendingMessage);
    const promptId = `compress-${Date.now()}`;
    const compressed = await context.services.config
      ?.getGeminiClient()
      ?.tryCompressChat(promptId, true);
    if (compressed) {
      ui.addItem(
        {
          type: MessageType.COMPRESSION,
          compression: {
            isPending: false,
            originalTokenCount: compressed.originalTokenCount,
            newTokenCount: compressed.newTokenCount,
            compressionStatus: compressed.compressionStatus,
          },
        } as HistoryItemCompression,
        Date.now(),
      );
    } else {
      ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Failed to compress chat history.',
        },
        Date.now(),
      );
    }
  } catch (e) {
    ui.addItem(
      {
        type: MessageType.ERROR,
        text: `Failed to compress chat history: ${
          e instanceof Error ? e.message : String(e)
        }`,
      },
      Date.now(),
    );
  } finally {
    ui.setPendingItem(null);
  }
}

export const compressCommand: SlashCommand = {
  name: 'compress',
  altNames: ['summarize'],
  description: 'Compresses the context by replacing it with a summary',
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    const { ui } = context;
    const config = context.services.config;
    const geminiClient = config?.getGeminiClient();

    if (ui.pendingItem) {
      ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Already compressing, wait for previous request to complete',
        },
        Date.now(),
      );
      return;
    }

    if (!geminiClient || !config) {
      ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Client not initialized.',
        },
        Date.now(),
      );
      return;
    }

    // Check if interactive compression with goal selection is enabled
    const isInteractive = config.isCompressionInteractive();
    const isDeliberateEnabled = await config.isDeliberateCompressionEnabled();

    if (!isInteractive || !isDeliberateEnabled) {
      // Fall back to basic compression without goal selection
      await performBasicCompression(context);
      return;
    }

    // Try to extract goals for goal selection
    const promptId = `compress-${Date.now()}`;

    try {
      const prepareResult = await geminiClient.prepareDeliberateCompression(
        promptId,
        false, // Not a safety valve trigger
      );

      if (
        prepareResult.shouldPromptUser &&
        prepareResult.extractedGoals &&
        prepareResult.extractedGoals.length > 0
      ) {
        // Return custom dialog with goal selection
        // Terminal width defaults to 80 if not available in context
        const terminalWidth = 80;

        return {
          type: 'custom_dialog' as const,
          component: (
            <CompressionDialog
              goals={prepareResult.extractedGoals}
              geminiClient={geminiClient}
              promptId={promptId}
              terminalWidth={terminalWidth}
              onComplete={ui.removeComponent}
              addItem={ui.addItem}
              setPendingItem={ui.setPendingItem}
            />
          ),
        };
      }

      // Goal extraction failed or no goals - fall back to basic compression
      await performBasicCompression(context);
      return;
    } catch (_error) {
      // If anything fails, fall back to basic compression
      await performBasicCompression(context);
      return;
    }
  },
};
