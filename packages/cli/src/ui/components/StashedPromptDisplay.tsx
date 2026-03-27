/**
 * @license
 * Copyright 2026 Google LLC
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
    <Box paddingLeft={2}>
      <Text dimColor>Stashed (restores after submit)</Text>
    </Box>
  );
};
