/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { theme } from '../semantic-colors.js';

interface BannerProps {
  bannerText: string;
  color: string;
  width: number;
}

export const Banner = ({ bannerText, color, width }: BannerProps) => {
  const gradient = theme.ui.gradient;
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={color}
      width={width}
      paddingLeft={1}
      paddingRight={1}
    >
      <Gradient colors={gradient}>
        <Text>{bannerText}</Text>
      </Gradient>
    </Box>
  );
};
