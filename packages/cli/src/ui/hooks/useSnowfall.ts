/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { getAsciiArtWidth } from '../utils/textUtils.js';
import { debugState } from '../debug.js';
import { themeManager } from '../themes/theme-manager.js';
import { Holiday } from '../themes/holiday.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useTerminalSize } from './useTerminalSize.js';
import { shortAsciiLogo } from '../components/AsciiArt.js';

interface Snowflake {
  x: number;
  y: number;
  char: string;
}

const SNOW_CHARS = ['*', '.', '·', '+'];
const FRAME_RATE = 150; // ms

const addHolidayTrees = (art: string): string => {
  const holidayTree = `
      *
     ***
    *****
   *******
  *********
     |_|`;

  const treeLines = holidayTree.split('\n').filter((l) => l.length > 0);
  const treeWidth = getAsciiArtWidth(holidayTree);
  const logoWidth = getAsciiArtWidth(art);

  // Create three trees side by side
  const treeSpacing = '        ';
  const tripleTreeLines = treeLines.map((line) => {
    const paddedLine = line.padEnd(treeWidth, ' ');
    return `${paddedLine}${treeSpacing}${paddedLine}${treeSpacing}${paddedLine}`;
  });

  const tripleTreeWidth = treeWidth * 3 + treeSpacing.length * 2;
  const paddingCount = Math.max(
    0,
    Math.floor((logoWidth - tripleTreeWidth) / 2),
  );
  const treePadding = ' '.repeat(paddingCount);

  const centeredTripleTrees = tripleTreeLines
    .map((line) => treePadding + line)
    .join('\n');

  // Add vertical padding and the trees below the logo
  return `\n\n${art}\n${centeredTripleTrees}\n\n`;
};

export const useSnowfall = (displayTitle: string): string => {
  const isHolidaySeason =
    new Date().getMonth() === 11 || new Date().getMonth() === 0;

  const currentTheme = themeManager.getActiveTheme();
  const { columns: terminalWidth } = useTerminalSize();
  const { history, historyRemountKey } = useUIState();

  const hasStartedChat = history.some(
    (item) => item.type === 'user' && item.text !== '/theme',
  );
  const widthOfShortLogo = getAsciiArtWidth(shortAsciiLogo);

  const [showSnow, setShowSnow] = useState(true);

  useEffect(() => {
    setShowSnow(true);
    const timer = setTimeout(() => {
      setShowSnow(false);
    }, 15000);
    return () => clearTimeout(timer);
  }, [historyRemountKey]);

  const showAnimation =
    isHolidaySeason &&
    currentTheme.name === Holiday.name &&
    terminalWidth >= widthOfShortLogo &&
    !hasStartedChat &&
    showSnow;

  const displayArt = useMemo(() => {
    if (showAnimation) {
      return addHolidayTrees(displayTitle);
    }
    return displayTitle;
  }, [displayTitle, showAnimation]);

  const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);
  // We don't need 'frame' state if we just use functional updates for snowflakes,
  // but we need a trigger. A simple interval is fine.

  const lines = displayArt.split('\n');
  const height = lines.length;
  const width = getAsciiArtWidth(displayArt);

  useEffect(() => {
    if (!showAnimation) {
      setSnowflakes([]);
      return;
    }
    debugState.debugNumAnimatedComponents++;

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
    return () => {
      debugState.debugNumAnimatedComponents--;
      clearInterval(timer);
    };
  }, [height, width, showAnimation]);

  if (!showAnimation) return displayTitle;

  // Render current frame
  if (snowflakes.length === 0) return displayArt;
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
