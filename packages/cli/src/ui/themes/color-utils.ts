/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';
import tinygradient from 'tinygradient';
import tinycolor from 'tinycolor2';

// Define the set of Ink's named colors for quick lookup
export const INK_SUPPORTED_NAMES = new Set([
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'cyan',
  'magenta',
  'white',
  'gray',
  'grey',
  'blackbright',
  'redbright',
  'greenbright',
  'yellowbright',
  'bluebright',
  'cyanbright',
  'magentabright',
  'whitebright',
]);

// Use tinycolor's built-in names map for CSS colors, excluding ones Ink supports
export const CSS_NAME_TO_HEX_MAP = Object.fromEntries(
  Object.entries(tinycolor.names)
    .filter(([name]) => !INK_SUPPORTED_NAMES.has(name))
    .map(([name, hex]) => [name, `#${hex}`]),
);

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
 * Resolves a CSS color value (name or hex) into an Ink-compatible color string.
 * @param colorValue The raw color string (e.g., 'blue', '#ff0000', 'darkkhaki').
 * @returns An Ink-compatible color string (hex or name), or undefined if not resolvable.
 */
export function resolveColor(colorValue: string): string | undefined {
  const lowerColor = colorValue.toLowerCase();

  // 1. Check if it's already a hex code and valid
  if (lowerColor.startsWith('#')) {
    if (/^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/.test(colorValue)) {
      return lowerColor;
    } else {
      return undefined;
    }
  }

  // Handle hex codes without #
  if (/^[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/.test(colorValue)) {
    return `#${lowerColor}`;
  }

  // 2. Check if it's an Ink supported name (lowercase)
  if (INK_SUPPORTED_NAMES.has(lowerColor)) {
    return lowerColor; // Use Ink name directly
  }

  // 3. Check if it's a known CSS name we can map to hex
  if (CSS_NAME_TO_HEX_MAP[lowerColor]) {
    return CSS_NAME_TO_HEX_MAP[lowerColor]; // Use mapped hex
  }

  // 4. Could not resolve
  debugLogger.warn(
    `[ColorUtils] Could not resolve color "${colorValue}" to an Ink-compatible format.`,
  );
  return undefined;
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

export function interpolateColor(
  color1: string,
  color2: string,
  factor: number,
) {
  if (factor <= 0 && color1) {
    return color1;
  }
  if (factor >= 1 && color2) {
    return color2;
  }
  if (!color1 || !color2) {
    return '';
  }
  const gradient = tinygradient(color1, color2);
  const color = gradient.rgbAt(factor);
  return color.toHexString();
}

export function getThemeTypeFromBackgroundColor(
  backgroundColor: string | undefined,
): 'light' | 'dark' | undefined {
  if (!backgroundColor) {
    return undefined;
  }

  const resolvedColor = resolveColor(backgroundColor);
  if (!resolvedColor) {
    return undefined;
  }

  const luminance = getLuminance(resolvedColor);
  return luminance > 128 ? 'light' : 'dark';
}

// Mapping for ANSI bright colors that are not in tinycolor's standard CSS names
export const INK_NAME_TO_HEX_MAP: Readonly<Record<string, string>> = {
  blackbright: '#555555',
  redbright: '#ff5555',
  greenbright: '#55ff55',
  yellowbright: '#ffff55',
  bluebright: '#5555ff',
  magentabright: '#ff55ff',
  cyanbright: '#55ffff',
  whitebright: '#ffffff',
};

/**
 * Calculates the relative luminance of a color.
 * See https://www.w3.org/TR/WCAG20/#relativeluminancedef
 *
 * @param color Color string (hex or Ink-supported name)
 * @returns Luminance value (0-255)
 */
export function getLuminance(color: string): number {
  const resolved = color.toLowerCase();
  const hex = INK_NAME_TO_HEX_MAP[resolved] || resolved;

  const colorObj = tinycolor(hex);
  if (!colorObj.isValid()) {
    return 0;
  }

  // tinycolor returns 0-1, we need 0-255
  return colorObj.getLuminance() * 255;
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
