/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Newline, Text } from 'ink';
import { theme as semanticTheme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';

interface CloudPaidPrivacyNoticeProps {
  onExit: () => void;
}

export const CloudPaidPrivacyNotice = ({
  onExit,
}: CloudPaidPrivacyNoticeProps) => {
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onExit();
      }
    },
    { isActive: true },
  );

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={semanticTheme.text.accent}>
        Vertex AI Notice
      </Text>
      <Newline />
      <Text color={semanticTheme.text.primary}>
        Service Specific Terms<Text color={semanticTheme.text.link}>[1]</Text>{' '}
        are incorporated into the agreement under which Google has agreed to
        provide Google Cloud Platform
        <Text color={semanticTheme.status.success}>[2]</Text> to Customer (the
        “Agreement”). If the Agreement authorizes the resale or supply of Google
        Cloud Platform under a Google Cloud partner or reseller program, then
        except for in the section entitled “Partner-Specific Terms”, all
        references to Customer in the Service Specific Terms mean Partner or
        Reseller (as applicable), and all references to Customer Data in the
        Service Specific Terms mean Partner Data. Capitalized terms used but not
        defined in the Service Specific Terms have the meaning given to them in
        the Agreement.
      </Text>
      <Newline />
      <Text color={semanticTheme.text.primary}>
        <Text color={semanticTheme.text.link}>[1]</Text>{' '}
        https://cloud.google.com/terms/service-terms
      </Text>
      <Text color={semanticTheme.text.primary}>
        <Text color={semanticTheme.status.success}>[2]</Text>{' '}
        https://cloud.google.com/terms/services
      </Text>
      <Newline />
      <Text color={semanticTheme.text.secondary}>Press Esc to exit.</Text>
    </Box>
  );
};
