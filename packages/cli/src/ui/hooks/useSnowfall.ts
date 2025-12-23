/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { getAsciiArtWidth } from '../utils/textUtils.js';

interface Snowflake {
  x: number;
  y: number;
  char: string;
}

const SNOW_CHARS = ['*', '.', '·', '+'];
const FRAME_RATE = 100; // ms

export const useSnowfall = (art: string, enabled: boolean): string => {
  const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);
  // We don't need 'frame' state if we just use functional updates for snowflakes,
  // but we need a trigger. A simple interval is fine.

  const lines = art.split('\n');
  const height = lines.length;
  const width = getAsciiArtWidth(art);

  useEffect(() => {
    if (!enabled) {
      setSnowflakes([]);
      return;
    }

    const timer = setInterval(() => {
      setSnowflakes((prev) => {
        // Move existing flakes
        const moved = prev
          .map((flake) => ({ ...flake, y: flake.y + 1 }))
          .filter((flake) => flake.y < height);

        // Spawn new flakes
        // Adjust spawn rate based on width to keep density consistent
        const spawnChance = 0.3;
        const newFlakes: Snowflake[] = [];

        if (Math.random() < spawnChance) {
          // Spawn 1 to 2 flakes
          const count = Math.floor(Math.random() * 2) + 1;
          for (let i = 0; i < count; i++) {
            newFlakes.push({
              x: Math.floor(Math.random() * width),
              y: 0,
              char: SNOW_CHARS[Math.floor(Math.random() * SNOW_CHARS.length)],
            });
          }
        }

        return [...moved, ...newFlakes];
      });
    }, FRAME_RATE);
    return () => clearInterval(timer);
  }, [height, width, enabled]);

  if (!enabled) return art;

  // Render current frame
  const grid = lines.map((line) => line.padEnd(width, ' ').split(''));

  snowflakes.forEach((flake) => {
    if (flake.y >= 0 && flake.y < height && flake.x >= 0 && flake.x < width) {
      // Overwrite with snow character
      // We check if the row exists just in case
      if (grid[flake.y]) {
        grid[flake.y][flake.x] = flake.char;
      }
    }
  });

  return grid.map((row) => row.join('')).join('\n');
};
