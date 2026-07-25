/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  resolveColor,
  interpolateColor,
  getThemeTypeFromBackgroundColor,
  INK_SUPPORTED_NAMES,
  INK_NAME_TO_HEX_MAP,
  getLuminance,
  CSS_NAME_TO_HEX_MAP,
} from './theme.js';

export {
  resolveColor,
  interpolateColor,
  getThemeTypeFromBackgroundColor,
  INK_SUPPORTED_NAMES,
  INK_NAME_TO_HEX_MAP,
  getLuminance,
  CSS_NAME_TO_HEX_MAP,
};

/**
 * Checks if a color string is valid (hex, Ink-supported color name, or CSS color name).
 * This function uses the same validation logic as the Theme class's _resolveColor method
 * to ensure consistency between validation and resolution.
 * @param color The color string to validate.
 * @returns True if the color is valid.
 */
export function isValidColor(color: string): boolean {
  const lowerColor = color.toLowerCase();

  // 1. Check if it's a hex code
  if (lowerColor.startsWith('#')) {
    return /^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/.test(color);
  }

  // 2. Check if it's an Ink supported name
  if (INK_SUPPORTED_NAMES.has(lowerColor)) {
    return true;
  }

  // 3. Check if it's a known CSS name we can map to hex
  if (CSS_NAME_TO_HEX_MAP[lowerColor]) {
    return true;
  }

  // 4. Not a valid color
  return false;
}

/**
 * Returns a "safe" background color to use in low-color terminals if the
 * terminal background is a standard black or white.
 * Returns undefined if no safe background color is available for the given
 * terminal background.
 */
export function getSafeLowColorBackground(
  terminalBg: string,
): string | undefined {
  const resolvedTerminalBg = resolveColor(terminalBg) || terminalBg;
  if (
    resolvedTerminalBg === 'black' ||
    resolvedTerminalBg === '#000000' ||
    resolvedTerminalBg === '#000'
  ) {
    return '#1c1c1c';
  }
  if (
    resolvedTerminalBg === 'white' ||
    resolvedTerminalBg === '#ffffff' ||
    resolvedTerminalBg === '#fff'
  ) {
    return '#eeeeee';
  }
  return undefined;
}

// Hysteresis thresholds to prevent flickering when the background color
// is ambiguous (near the midpoint).
export const LIGHT_THEME_LUMINANCE_THRESHOLD = 140;
export const DARK_THEME_LUMINANCE_THRESHOLD = 110;

/**
 * Determines if the theme should be switched based on background luminance.
 * Uses hysteresis to prevent flickering.
 *
 * @param currentThemeName The name of the currently active theme
 * @param luminance The calculated relative luminance of the background (0-255)
 * @param defaultThemeName The name of the default (dark) theme
 * @param defaultLightThemeName The name of the default light theme
 * @returns The name of the theme to switch to, or undefined if no switch is needed.
 */
export function shouldSwitchTheme(
  currentThemeName: string | undefined,
  luminance: number,
  defaultThemeName: string,
  defaultLightThemeName: string,
): string | undefined {
  const isDefaultTheme =
    currentThemeName === defaultThemeName || currentThemeName === undefined;
  const isDefaultLightTheme = currentThemeName === defaultLightThemeName;

  if (luminance > LIGHT_THEME_LUMINANCE_THRESHOLD && isDefaultTheme) {
    return defaultLightThemeName;
  } else if (
    luminance < DARK_THEME_LUMINANCE_THRESHOLD &&
    isDefaultLightTheme
  ) {
    return defaultThemeName;
  }

  return undefined;
}

/**
 * Parses an X11 RGB string (e.g. from OSC 11) into a hex color string.
 * Supports 1-4 digit hex values per channel (e.g., F, FF, FFF, FFFF).
 *
 * @param rHex Red component as hex string
 * @param gHex Green component as hex string
 * @param bHex Blue component as hex string
 * @returns Hex color string (e.g. #RRGGBB)
 */
export function parseColor(rHex: string, gHex: string, bHex: string): string {
  const parseComponent = (hex: string) => {
    const val = parseInt(hex, 16);
    if (hex.length === 1) return (val / 15) * 255;
    if (hex.length === 2) return val;
    if (hex.length === 3) return (val / 4095) * 255;
    if (hex.length === 4) return (val / 65535) * 255;
    return val;
  };

  const r = parseComponent(rHex);
  const g = parseComponent(gHex);
  const b = parseComponent(bHex);

  const toHex = (c: number) => Math.round(c).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
