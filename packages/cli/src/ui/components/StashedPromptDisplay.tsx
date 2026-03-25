/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';

export interface StashedPromptDisplayProps {
  stashedPrompt: string | null;
}

export const StashedPromptDisplay = ({
  stashedPrompt,
}: StashedPromptDisplayProps) => {
  if (!stashedPrompt) {
    return null;
  }

  return (
    <Box paddingLeft={2} marginTop={1}>
      <Text dimColor>Stashed (restores after submit)</Text>
    </Box>
  );
};
