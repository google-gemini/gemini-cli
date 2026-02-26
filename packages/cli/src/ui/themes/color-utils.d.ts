/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export declare const INK_SUPPORTED_NAMES: Set<string>;
export declare const CSS_NAME_TO_HEX_MAP: {
  [k: string]: string;
};
/**
 * Checks if a color string is valid (hex, Ink-supported color name, or CSS color name).
 * This function uses the same validation logic as the Theme class's _resolveColor method
 * to ensure consistency between validation and resolution.
 * @param color The color string to validate.
 * @returns True if the color is valid.
 */
export declare function isValidColor(color: string): boolean;
/**
 * Resolves a CSS color value (name or hex) into an Ink-compatible color string.
 * @param colorValue The raw color string (e.g., 'blue', '#ff0000', 'darkkhaki').
 * @returns An Ink-compatible color string (hex or name), or undefined if not resolvable.
 */
export declare function resolveColor(colorValue: string): string | undefined;
/**
 * Returns a "safe" background color to use in low-color terminals if the
 * terminal background is a standard black or white.
 * Returns undefined if no safe background color is available for the given
 * terminal background.
 */
export declare function getSafeLowColorBackground(
  terminalBg: string,
): string | undefined;
export declare function interpolateColor(
  color1: string,
  color2: string,
  factor: number,
): string;
export declare function getThemeTypeFromBackgroundColor(
  backgroundColor: string | undefined,
): 'light' | 'dark' | undefined;
export declare const INK_NAME_TO_HEX_MAP: Readonly<Record<string, string>>;
/**
 * Calculates the relative luminance of a color.
 * See https://www.w3.org/TR/WCAG20/#relativeluminancedef
 *
 * @param color Color string (hex or Ink-supported name)
 * @returns Luminance value (0-255)
 */
export declare function getLuminance(color: string): number;
export declare const LIGHT_THEME_LUMINANCE_THRESHOLD = 140;
export declare const DARK_THEME_LUMINANCE_THRESHOLD = 110;
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
export declare function shouldSwitchTheme(
  currentThemeName: string | undefined,
  luminance: number,
  defaultThemeName: string,
  defaultLightThemeName: string,
): string | undefined;
/**
 * Parses an X11 RGB string (e.g. from OSC 11) into a hex color string.
 * Supports 1-4 digit hex values per channel (e.g., F, FF, FFF, FFFF).
 *
 * @param rHex Red component as hex string
 * @param gHex Green component as hex string
 * @param bHex Blue component as hex string
 * @returns Hex color string (e.g. #RRGGBB)
 */
export declare function parseColor(
  rHex: string,
  gHex: string,
  bHex: string,
): string;
