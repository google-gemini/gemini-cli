/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text, useInput } from 'ink';
import {
  RadioButtonSelect,
  RadioSelectItem,
} from './components/shared/RadioButtonSelect.js';

export type IdeIntegrationNudgeResult = 'yes' | 'no' | 'dismiss';

interface IdeIntegrationNudgeProps {
  ideName?: string;
  onComplete: (result: IdeIntegrationNudgeResult) => void;
}

export function IdeIntegrationNudge({
  ideName,
  onComplete,
}: IdeIntegrationNudgeProps) {
  useInput((_input, key) => {
    if (key.escape) {
      onComplete('no');
    }
  });

  const OPTIONS: Array<RadioSelectItem<IdeIntegrationNudgeResult>> = [
    {
      label: 'Yes',
      value: 'yes',
    },
    {
      label: 'No (esc)',
      value: 'no',
    },
    {
      label: "No, don't ask again",
      value: 'dismiss',
    },
  ];

  const question = ideName
    ? `Do you want to connect your ${ideName} editor to Gemini CLI?`
    : 'Do you want to connect your editor to Gemini CLI?';
  const description = ideName
    ? `If you select Yes, we'll install an extension that allows the CLI to access your open files and display diffs directly in ${ideName}.`
    : "If you select Yes, we'll install an extension that allows the CLI to access your open files and display diffs directly in your editor.";

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      padding={1}
      width="100%"
      marginLeft={1}
    >
      <Box marginBottom={1} flexDirection="column">
        <Text>
          <Text color="yellow">{'> '}</Text>
          {question}
        </Text>
        <Text dimColor>{description}</Text>
      </Box>
      <RadioButtonSelect
        items={OPTIONS}
        onSelect={onComplete}
        isFocused={true}
      />
    </Box>
  );
}
