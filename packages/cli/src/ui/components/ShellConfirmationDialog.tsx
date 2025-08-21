/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolConfirmationOutcome } from '@google/gemini-cli-core';
import { Box, Text } from 'ink';
import React from 'react';
import { Colors } from '../colors.js';
import { RenderInline } from '../utils/InlineMarkdownRenderer.js';
import {
  RadioButtonSelect,
  RadioSelectItem,
} from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { useTranslation } from '../../i18n/useTranslation.js';

export interface ShellConfirmationRequest {
  commands: string[];
  onConfirm: (
    outcome: ToolConfirmationOutcome,
    approvedCommands?: string[],
  ) => void;
}

export interface ShellConfirmationDialogProps {
  request: ShellConfirmationRequest;
}

export const ShellConfirmationDialog: React.FC<
  ShellConfirmationDialogProps
> = ({ request }) => {
  const { t } = useTranslation('dialogs');
  const { commands, onConfirm } = request;

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onConfirm(ToolConfirmationOutcome.Cancel);
      }
    },
    { isActive: true },
  );

  const handleSelect = (item: ToolConfirmationOutcome) => {
    if (item === ToolConfirmationOutcome.Cancel) {
      onConfirm(item);
    } else {
      // For both ProceedOnce and ProceedAlways, we approve all the
      // commands that were requested.
      onConfirm(item, commands);
    }
  };

  const options: Array<RadioSelectItem<ToolConfirmationOutcome>> = [
    {
      label: t('shellConfirm.options.allowOnce'),
      value: ToolConfirmationOutcome.ProceedOnce,
    },
    {
      label: t('shellConfirm.options.allowAlways'),
      value: ToolConfirmationOutcome.ProceedAlways,
    },
    {
      label: t('shellConfirm.options.cancel'),
      value: ToolConfirmationOutcome.Cancel,
    },
  ];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={Colors.AccentYellow}
      padding={1}
      width="100%"
      marginLeft={1}
    >
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>{t('shellConfirm.title')}</Text>
        <Text>{t('shellConfirm.description')}</Text>
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={Colors.Gray}
          paddingX={1}
          marginTop={1}
        >
          {commands.map((cmd) => (
            <Text key={cmd} color={Colors.AccentCyan}>
              <RenderInline text={cmd} />
            </Text>
          ))}
        </Box>
      </Box>

      <Box marginBottom={1}>
        <Text>{t('shellConfirm.question')}</Text>
      </Box>

      <RadioButtonSelect items={options} onSelect={handleSelect} isFocused />
    </Box>
  );
};
