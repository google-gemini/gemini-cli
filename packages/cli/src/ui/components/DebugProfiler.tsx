/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text, useInput } from 'ink';
import { useEffect, useRef, useState } from 'react';
import { Colors } from '../colors.js';

export const DebugProfiler = () => {
  const numRenders = useRef(0);
  const [showNumRenders, setShowNumRenders] = useState(false);

  useEffect(() => {
    numRenders.current++;
  });

  useInput((input, key) => {
    if (key.ctrl && input === 'b') {
      setShowNumRenders((prev) => !prev);
    }
  });

  if (!showNumRenders) {
    return null;
  }

  return (
    <Text color={Colors.AccentYellow}>Renders: {numRenders.current} </Text>
  );
};
