/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { JSX } from 'react';
import { Box, Text } from 'ink';
import type { ExportSessionProps } from '../../types.js';
import { CliSpinner } from '../CliSpinner.js';
import { theme } from '../../semantic-colors.js';

export interface ExportSessionDisplayProps {
  exportSession: ExportSessionProps;
}

/*
 * Export session messages appear when the /export-session command is run, and show a loading spinner
 * while export is in progress, followed by a success message.
 */
export function ExportSessionMessage({
  exportSession,
}: ExportSessionDisplayProps): JSX.Element {
  const { isPending, targetPath } = exportSession;

  return (
    <Box flexDirection="row" marginTop={1}>
      <Box marginRight={1}>
        {isPending ? (
          <CliSpinner type="dots" />
        ) : (
          <Text color={theme.status.success}>✓</Text>
        )}
      </Box>
      <Box>
        <Text color={isPending ? theme.text.accent : theme.status.success}>
          {isPending
            ? 'Exporting session...'
            : `Successfully exported session to ${targetPath}`}
        </Text>
      </Box>
    </Box>
  );
}
