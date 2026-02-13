/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import type { HomographResult } from '../../utils/urlSecurityUtils.js';

export interface UriSecurityWarningProps {
  warnings: HomographResult[];
}

/**
 * A security component that warns users about potential homograph attacks
 * in URIs by showing the original Unicode version and its Punycode equivalent.
 */
export const UriSecurityWarning: React.FC<UriSecurityWarningProps> = ({
  warnings,
}) => {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      padding={1}
      borderStyle="round"
      borderColor={theme.status.warning}
      marginTop={1}
      marginBottom={1}
    >
      <Box marginBottom={1}>
        <Text color={theme.status.warning} bold>
          ⚠️ WARNING: Potential homograph attack detected in URI:
        </Text>
      </Box>

      {warnings.map((warning, index) => (
        <Box
          key={index}
          flexDirection="column"
          marginBottom={index < warnings.length - 1 ? 1 : 0}
        >
          <Box>
            <Text color={theme.text.primary} bold>
              Original:
            </Text>
            <Text color={theme.text.primary}> {warning.original}</Text>
          </Box>
          <Box>
            <Text color={theme.text.primary} bold>
              Actual Host (Punycode):
            </Text>
            <Text color={theme.text.link}> {warning.punycode}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
};
