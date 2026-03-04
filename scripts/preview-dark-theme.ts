/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import chalk from 'chalk';
import tinycolor from 'tinycolor2';
import tinygradient from 'tinygradient';
import {
  darkTheme,
  lightTheme,
  type ColorsTheme,
} from '../packages/cli/src/ui/themes/theme.js';

const BLACK = '#000000';
const WHITE = '#FFFFFF';
const TABLE_WIDTH = 85;
const backgroundColors = new Set([
  'Background',
  'DiffAdded',
  'DiffRemoved',
  'InputBackground',
  'MessageBackground',
  'FocusBackground',
]);

// xterm-256 levels as specified
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255];
const GRAY_LEVELS = Array.from({ length: 24 }, (_, i) => 8 + i * 10);

function toHex(n: number) {
  return n.toString(16).padStart(2, '0');
}

function getClosestXterm(hex: string): { code: number; hex: string } {
  if (!hex || hex === '') return { code: 0, hex: '#000000' };
  const color = tinycolor(hex).toRgb();

  // 1. Check Grayscale ramp (232-255)
  let bestGray = -1;
  let minGrayDist = Infinity;
  // Simple grayscale conversion
  const avg = (color.r + color.g + color.b) / 3;
  for (let i = 0; i < GRAY_LEVELS.length; i++) {
    const dist = Math.abs(GRAY_LEVELS[i] - avg);
    if (dist < minGrayDist) {
      minGrayDist = dist;
      bestGray = i;
    }
  }

  // 2. Check Color Cube (16-231)
  const findClosestLevel = (val: number) => {
    let bestL = 0;
    let minDist = Infinity;
    for (let i = 0; i < CUBE_LEVELS.length; i++) {
      const dist = Math.abs(CUBE_LEVELS[i] - val);
      if (dist < minDist) {
        minDist = dist;
        bestL = i;
      }
    }
    return bestL;
  };

  const rIdx = findClosestLevel(color.r);
  const gIdx = findClosestLevel(color.g);
  const bIdx = findClosestLevel(color.b);

  const cubeDist = Math.sqrt(
    Math.pow(CUBE_LEVELS[rIdx] - color.r, 2) +
      Math.pow(CUBE_LEVELS[gIdx] - color.g, 2) +
      Math.pow(CUBE_LEVELS[bIdx] - color.b, 2),
  );

  // Compare grayscale vs cube distance (cube typically wins if it's colorful)
  // We'll also check if the input is very desaturated
  const isDesaturated =
    Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b) <
    10;

  if (isDesaturated && minGrayDist < cubeDist) {
    const code = 232 + bestGray;
    const v = GRAY_LEVELS[bestGray];
    return { code, hex: `#${toHex(v)}${toHex(v)}${toHex(v)}` };
  } else {
    const code = 16 + 36 * rIdx + 6 * gIdx + bIdx;
    return {
      code,
      hex: `#${toHex(CUBE_LEVELS[rIdx])}${toHex(CUBE_LEVELS[gIdx])}${toHex(CUBE_LEVELS[bIdx])}`,
    };
  }
}

function getRating(contrast: number): string {
  const contrastStr = `${contrast.toFixed(2)}:1`;
  if (contrast >= 7) return chalk.green(`(AAA) ${contrastStr.padEnd(7)}`);
  if (contrast >= 4.5) return chalk.cyan(`(AA)  ${contrastStr.padEnd(7)}`);
  if (contrast >= 3) return chalk.yellow(`(LG)  ${contrastStr.padEnd(7)}`);
  return chalk.red(`(FAIL) ${contrastStr.padEnd(7)}`);
}

function previewTheme(themeName: string, theme: ColorsTheme) {
  const isDark = theme.type === 'dark';
  const baseBackground = isDark ? BLACK : WHITE;
  const defaultForeground = isDark ? WHITE : BLACK;
  const foreground =
    theme.Foreground && theme.Foreground !== ''
      ? theme.Foreground
      : defaultForeground;

  console.log(
    '\n' +
      chalk.bold.underline(
        `${themeName}: Hex vs Corrected xterm-256 Comparison`,
      ),
  );
  console.log(chalk.dim('xterm cube levels: 00, 5f, 87, af, d7, ff'));
  console.log('');

  const headers = [
    'Name'.padEnd(18),
    'Original (Hex)'.padEnd(25),
    'Contrast Comparison',
  ];
  console.log(headers.join(' | '));
  console.log('-'.repeat(TABLE_WIDTH));

  for (const [name, hexValue] of Object.entries(theme)) {
    if (Array.isArray(hexValue) || !hexValue || name === 'type') continue;
    const hex = hexValue as string;

    // 1. Correct xterm Mapping
    const xterm = getClosestXterm(hex);
    const xtermFg = getClosestXterm(foreground);
    const xtermGreen = getClosestXterm(theme.AccentGreen);
    const xtermBaseBg = getClosestXterm(baseBackground);

    // 2. Previews
    let originalPreview: string;
    let label: string;

    if (name === 'FocusBackground') {
      originalPreview = chalk.bgHex(hex).hex(theme.AccentGreen)(' Text ');
      label = 'vs Green';
    } else if (backgroundColors.has(name)) {
      originalPreview = chalk.bgHex(hex).hex(foreground)(' Text ');
      label = 'vs Fore';
    } else {
      originalPreview = chalk.bgHex(baseBackground).hex(hex)(' Text ');
      label = isDark ? 'vs Black' : 'vs White';
    }

    // 3. Contrast Ratios
    const xtermFgHex =
      name === 'FocusBackground'
        ? xtermGreen.hex
        : backgroundColors.has(name)
          ? xtermFg.hex
          : xterm.hex;
    const xtermBgHex = backgroundColors.has(name) ? xterm.hex : xtermBaseBg.hex;

    const originalContrast = tinycolor.readability(
      backgroundColors.has(name)
        ? name === 'FocusBackground'
          ? theme.AccentGreen
          : foreground
        : hex,
      backgroundColors.has(name) ? hex : baseBackground,
    );
    const xtermContrast = tinycolor.readability(xtermFgHex, xtermBgHex);

    const originalCol = `${hex.toUpperCase().padEnd(10)} ${originalPreview}`;
    const contrastCol = `${getRating(originalContrast)} -> ${getRating(xtermContrast)} ${chalk.dim(label)}`;

    console.log(
      `${name.padEnd(18)} | ${originalCol.padEnd(25)} | ${contrastCol}`,
    );
  }

  console.log('-'.repeat(TABLE_WIDTH));
  if (theme.GradientColors && theme.GradientColors.length > 0) {
    const NAME_COL_WIDTH = 18;
    const SEP_WIDTH = 3; // " | "
    const gradientWidth = TABLE_WIDTH - NAME_COL_WIDTH - SEP_WIDTH;
    const gradient = tinygradient(theme.GradientColors);
    const gradientStr = Array.from({ length: gradientWidth }, (_, i) => {
      const color = gradient.rgbAt(i / (gradientWidth - 1));
      return chalk.hex(color.toHexString())('█');
    }).join('');
    console.log('Gradient Test'.padEnd(NAME_COL_WIDTH) + ' | ' + gradientStr);
    console.log('-'.repeat(TABLE_WIDTH));
  }
}

previewTheme('Dark Theme', darkTheme);
previewTheme('Light Theme', lightTheme);
console.log('');
