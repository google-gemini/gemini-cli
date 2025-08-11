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
          {`Do you want to connect your ${ideName ?? 'your'} editor to Gemini CLI?`}
        </Text>
        <Text
          dimColor
        >{`If you select Yes, we'll install an extension that allows the CLI to access your open files and display diffs directly in ${ideName ?? 'your editor'}.`}</Text>
      </Box>
      <RadioButtonSelect
        items={OPTIONS}
        onSelect={onComplete}
        isFocused={true}
      />
    </Box>
  );
}
