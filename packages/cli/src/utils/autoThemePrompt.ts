/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import readline from 'node:readline';
import type { LoadedSettings } from '../config/settings.js';
import { SettingScope } from '../config/settings.js';
import type { ThemeType } from '../ui/themes/theme.js';
import { AUTO_THEME } from '../ui/themes/theme.js';

/**
 * Prompts the user to enable auto theme when a theme/terminal mismatch is detected.
 *
 * This function displays an interactive prompt asking whether the user wants to enable
 * automatic theme matching. It only shows if `ui.autoThemePrompt` is not explicitly
 * disabled in settings.
 *
 * Behavior:
 * - If user accepts (Y/y/yes/Enter): Sets `ui.theme` to AUTO_THEME and returns true
 * - If user declines (n/no): Sets `ui.autoThemePrompt` to false to prevent future prompts
 *
 * The prompt uses readline for input and blocks until the user responds.
 *
 * @param terminalBackground The detected terminal background ('light' | 'dark').
 * @param currentThemeType The current theme type ('light' | 'dark' | 'ansi' | 'custom').
 * @param settings The loaded settings object.
 * @returns Promise<boolean> - True if user wants to enable auto theme, false otherwise.
 *
 * @example
 * ```typescript
 * if (terminalBackground === 'light' && currentTheme.type === 'dark') {
 *   const enabled = await promptEnableAutoTheme(terminalBackground, currentTheme.type, settings);
 *   if (enabled) {
 *     // Theme has been set to AUTO_THEME
 *   }
 * }
 * ```
 */
/**
 * Helper function to determine the correct article (a/an) for a word.
 */
function getArticle(word: string): string {
  const firstLetter = word.charAt(0).toLowerCase();
  return ['a', 'e', 'i', 'o', 'u'].includes(firstLetter) ? 'an' : 'a';
}

export async function promptEnableAutoTheme(
  terminalBackground: 'light' | 'dark',
  currentThemeType: ThemeType,
  settings: LoadedSettings,
): Promise<boolean> {
  const article = getArticle(currentThemeType);

  // Always show a notification about the mismatch
  console.log(
    `\n⚠️  Terminal background is ${terminalBackground}, but using ${article} ${currentThemeType} theme.`,
  );

  // Check if we should show the interactive prompt to enable auto-theme
  if (settings.merged.ui?.autoThemePrompt === false) {
    console.log(`    Use /theme to switch themes or enable auto-theme.\n`);
    return false;
  }

  let rl: readline.Interface | undefined;
  try {
    // Ensure stdin is in the correct mode for readline
    // detectTerminalBackground() may have left it paused
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.resume();
    }

    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const message = `Would you like to enable auto theme to automatically match your terminal? (Y/n): `;

    const answer = await new Promise<string>((resolve) => {
      rl!.question(message, resolve);
    });

    const normalizedAnswer = answer.trim().toLowerCase();
    const shouldEnable =
      normalizedAnswer === '' ||
      normalizedAnswer === 'y' ||
      normalizedAnswer === 'yes';

    if (shouldEnable) {
      // Enable auto theme
      settings.setValue(SettingScope.User, 'ui.theme', AUTO_THEME);
      console.log(
        '\n✓ Auto theme enabled. Gemini will now match your terminal background.',
      );
      console.log(
        '  You can change this anytime with /theme or: gemini theme <theme-name>\n',
      );
    } else {
      // Disable the prompt for future sessions
      settings.setValue(SettingScope.User, 'ui.autoThemePrompt', false);
      console.log(
        '\n  Auto theme prompt disabled. You can manually switch themes with /theme or: gemini theme <theme-name>',
      );
    }
    return shouldEnable;
  } catch (error) {
    console.error(
      '\nAn unexpected error occurred during the auto-theme prompt. Skipping.',
      error,
    );
    return false; // Default to not enabling on error
  } finally {
    rl?.close();
  }
}
