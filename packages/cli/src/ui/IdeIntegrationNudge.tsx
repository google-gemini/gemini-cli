/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IdeInfo } from '@google/gemini-cli-core';
import { Box, Text } from 'ink';
import type { RadioSelectItem } from './components/shared/RadioButtonSelect.js';
import { RadioButtonSelect } from './components/shared/RadioButtonSelect.js';
import { useKeypress } from './hooks/useKeypress.js';
import { theme } from './semantic-colors.js';

export type IdeIntegrationNudgeResult = {
  userSelection: 'yes' | 'no' | 'dismiss';
  isExtensionPreInstalled: boolean;
};

interface IdeIntegrationNudgeProps {
  ide: IdeInfo;
  onComplete: (result: IdeIntegrationNudgeResult) => void;
}

export function IdeIntegrationNudge({
  ide,
  onComplete,
}: IdeIntegrationNudgeProps) {
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onComplete({
          userSelection: 'no',
          isExtensionPreInstalled: false,
        });
      }
    },
    { isActive: true },
  );

  const { displayName: ideName } = ide;
  // Assume extension is already installed if the env variables are set.
  const isExtensionPreInstalled =
    !!process.env['GEMINI_CLI_IDE_SERVER_PORT'] &&
    !!process.env['GEMINI_CLI_IDE_WORKSPACE_PATH'];

  const OPTIONS: Array<RadioSelectItem<IdeIntegrationNudgeResult>> = [
    {
      label: 'Yes',
      value: {
        userSelection: 'yes',
        isExtensionPreInstalled,
      },
    },
    {
      label: 'No (esc)',
      value: {
        userSelection: 'no',
        isExtensionPreInstalled,
      },
    },
    {
      label: "No, don't ask again",
      value: {
        userSelection: 'dismiss',
        isExtensionPreInstalled,
      },
    },
  ];

  const installText = isExtensionPreInstalled
    ? `If you select Yes, the CLI will have access to your open files and display diffs directly in ${
        ideName ?? 'your editor'
      }.`
    : `If you select Yes, we'll install an extension that allows the CLI to access your open files and display diffs directly in ${
        ideName ?? 'your editor'
      }.`;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.status.warning}
      padding={1}
      width="100%"
      marginLeft={1}
    >
      <Box marginBottom={1} flexDirection="column">
        <Text>
          <Text color={theme.status.warning}>{'> '}</Text>
          {`Do you want to connect ${ideName ?? 'your editor'} to Gemini CLI?`}
        </Text>
        <Text color={theme.text.secondary}>{installText}</Text>
      </Box>
      <RadioButtonSelect items={OPTIONS} onSelect={onComplete} />
    </Box>
  );
}
