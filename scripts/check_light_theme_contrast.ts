/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import tinycolor from 'tinycolor2';
import {
  lightTheme,
  darkTheme,
  type ColorsTheme,
} from '../packages/cli/src/ui/themes/theme.js';

function hexToAnsi(fgHex: string, bgHex: string, text: string): string {
  const fg = tinycolor(fgHex).toRgb();
  const bg = tinycolor(bgHex).toRgb();
  return `\x1b[38;2;${fg.r};${fg.g};${fg.b}m\x1b[48;2;${bg.r};${bg.g};${bg.b}m ${text} \x1b[0m`;
}

function checkTheme(theme: ColorsTheme, themeName: string) {
  const background =
    theme.Background || (theme.type === 'light' ? '#FAFAFA' : '#1E1E2E');
  const defaultForeground =
    theme.Foreground || (theme.type === 'light' ? '#000000' : '#CDD6F4');

  console.log(`Checking contrast ratios for ${themeName} colors...\n`);
  console.log(
    `${'Name'.padEnd(20)} | ${'FG Hex'.padEnd(10)} | ${'Sample'.padEnd(
      10,
    )} | ${'Contrast'.padEnd(8)} | ${'Passes'}`,
  );
  console.log('-'.repeat(75));

  const results = [];

  for (const [name, color] of Object.entries(theme)) {
    if (name === 'Background' || name === 'type' || name === 'GradientColors')
      continue;

    // Skip non-color strings (except Foreground which we handle with a default)
    if (
      name !== 'Foreground' &&
      (typeof color !== 'string' || !color.startsWith('#'))
    )
      continue;

    const isBgLike =
      name.toLowerCase().includes('background') ||
      name.toLowerCase().includes('diff');
    const fg = isBgLike ? defaultForeground : color || defaultForeground;
    const bg = isBgLike ? color || background : background;

    const contrast = tinycolor.readability(bg, fg);
    const passes = contrast >= 4.5;
    const sample = hexToAnsi(fg, bg, 'TEXT');

    console.log(
      `${name.padEnd(20)} | ${fg.padEnd(10)} | ${sample}      | ${contrast
        .toFixed(2)
        .padEnd(8)} | ${passes ? '✅ PASS' : '❌ FAIL'}`,
    );

    results.push({ name, color, contrast, passes });
  }

  const failures = results.filter((r) => !r.passes);
  if (failures.length > 0) {
    console.log(`\nFailures detected in ${themeName}:`);
    failures.forEach((f) => {
      console.log(`- ${f.name} (${f.color}): ${f.contrast.toFixed(2)}`);
    });
    return false;
  } else {
    console.log(`\nAll ${themeName} colors pass the 4.5:1 contrast ratio!`);
    return true;
  }
}

const lightPass = checkTheme(lightTheme, 'lightTheme');
console.log('\n' + '='.repeat(75) + '\n');
const darkPass = checkTheme(darkTheme, 'darkTheme');

if (!lightPass || !darkPass) {
  process.exit(1);
}
