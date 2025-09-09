/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';

/**
 * Displays an approximate FPS (renders per second) for the Ink UI.
 * Note: This is approximate and includes the update caused by the counter itself once per second.
 */
export const FpsDisplay: React.FC = () => {
  const renderCountRef = useRef(0);
  const lastCountRef = useRef(0);
  const [fps, setFps] = useState(0);

  // Count renders
  useEffect(() => {
    renderCountRef.current += 1;
  });

  // Update FPS once per second
  useEffect(() => {
    const id = setInterval(() => {
      const total = renderCountRef.current;
      const diff = total - lastCountRef.current;
      lastCountRef.current = total;
      // Subtract 1 to account for this update's render, but ensure minimum 0
      setFps(Math.max(0, diff - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const color =
    fps >= 30
      ? Colors.AccentGreen
      : fps >= 10
        ? Colors.AccentYellow
        : Colors.AccentRed;

  return (
    <Box>
      <Text color={Colors.Gray}> | </Text>
      <Text color={color}>{fps} fps</Text>
    </Box>
  );
};
