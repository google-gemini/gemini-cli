/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import { theme } from '../semantic-colors.js';

export const ShortcutsHint: React.FC = () => (
  <Text color={theme.text.secondary}>
    <Text color={theme.text.accent}> ?</Text> for shortcuts
  </Text>
);
