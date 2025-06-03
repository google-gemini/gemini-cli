/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box } from 'ink';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import { Colors } from '../colors.js';

interface HeaderProps {
  title?: string;
}

export const Header: React.FC<HeaderProps> = ({ title = 'GEMINI' }) => (
  <>
    <Box alignItems="flex-start">
      {Colors.GradientColors ? (
        <Gradient colors={Colors.GradientColors}>
          <BigText text={title} letterSpacing={0} space={false} />
        </Gradient>
      ) : (
        <BigText text={title} letterSpacing={0} space={false} />
      )}
    </Box>
  </>
);
