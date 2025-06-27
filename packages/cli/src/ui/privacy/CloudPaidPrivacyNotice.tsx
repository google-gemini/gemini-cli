/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Newline, Text, useInput } from 'ink';
import { Colors } from '../colors.js';

interface CloudPaidPrivacyNoticeProps {
  onExit: () => void;
}

export const CloudPaidPrivacyNotice = ({
  onExit,
}: CloudPaidPrivacyNoticeProps) => {
  useInput((input, key) => {
    if (key.escape) {
      onExit();
    }
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={Colors.AccentPurple}>
        Vertex AI Notice
      </Text>
      <Newline />
      <Text>
        Service Specific Terms<Text color={Colors.AccentBlue}>[1]</Text> are
        incorporated into the agreement under which Google has agreed to provide
        Google Cloud Platform<Text color={Colors.AccentGreen}>[2]</Text> to
        Customer (the “Agreement”). If the Agreement authorizes the resale or
        supply of Google Cloud Platform under a Google Cloud partner or reseller
        program, then except for in the section entitled “Partner-Specific
        Terms”, all references to Customer in the Service Specific Terms mean
        Partner or Reseller (as applicable), and all references to Customer Data
        in the Service Specific Terms mean Partner Data. Capitalized terms used
        but not defined in the Service Specific Terms have the meaning given to
        them in the Agreement.
      </Text>
      <Newline />
      <Text>
        <Text color={Colors.AccentBlue}>[1]</Text>{' '}
        https://cloud.google.com/terms/service-terms
      </Text>
      <Text>
        <Text color={Colors.AccentGreen}>[2]</Text>{' '}
        https://cloud.google.com/terms/services
      </Text>
      <Newline />
      <Text color={Colors.Gray}>Press Esc to exit.</Text>
    </Box>
  );
};
