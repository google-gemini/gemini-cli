/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';

interface BannerProps {
  bannerText: string;
  color: string;
  width: number;
}

export const Banner = ({ bannerText, color, width }: BannerProps) => (
  <Box
    flexDirection="column"
    borderStyle="round"
    borderColor={color}
    width={width}
    paddingLeft={1}
    paddingRight={1}
  >
    <Text color={color}>{bannerText}</Text>
  </Box>
);
