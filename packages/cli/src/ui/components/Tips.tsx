/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { UI_WIDTH } from '../constants.js';

export const Tips: React.FC = () => (
  <Box flexDirection="column" marginBottom={1} width={UI_WIDTH}>
    <Text>Tips for getting started:</Text>
    <Text>
      1. <Text bold>/help</Text> for more information.
    </Text>
    <Text>
      2. <Text bold>/init</Text> to create a GEMINI.md for instructions &
      context.
    </Text>
    <Text>3. Ask coding questions, edit code or run commands.</Text>
    <Text>4. Be specific for the best results.</Text>
  </Box>
);
