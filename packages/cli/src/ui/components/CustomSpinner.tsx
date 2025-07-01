/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Text } from 'ink';
import { Colors } from '../colors.js';

const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const interval = 80;

export function CustomSpinner() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % frames.length);
    }, interval);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text color={Colors.GradientColors?.[2] || Colors.AccentCyan}>
      {String(frames[frame])}
    </Text>
  );
}
