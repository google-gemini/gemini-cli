/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text } from 'ink';
import { useEffect, useRef, useState } from 'react';
import { Colors } from '../colors.js';
import { useKeypress } from '../hooks/useKeypress.js';

export const DebugProfiler = () => {
  const numRenders = useRef(0);
  const [showNumRenders, setShowNumRenders] = useState(false);

  useEffect(() => {
    numRenders.current++;
  });

  useKeypress(
    (key) => {
      if (key.ctrl && key.name === 'b') {
        setShowNumRenders((prev) => !prev);
      }
    },
    { isActive: true },
  );

  if (!showNumRenders) {
    return null;
  }

  return (
    <Text color={Colors.AccentYellow}>Renders: {numRenders.current} </Text>
  );
};
