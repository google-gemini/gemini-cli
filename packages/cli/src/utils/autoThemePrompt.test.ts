/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promptEnableAutoTheme } from './autoThemePrompt.js';
import type { LoadedSettings } from '../config/settings.js';
import { SettingScope } from '../config/settings.js';
import { AUTO_THEME } from '../ui/themes/theme.js';
import readline from 'node:readline';

// Mock readline module
vi.mock('node:readline', () => ({
  default: {
    createInterface: vi.fn(),
  },
}));

describe('promptEnableAutoTheme', () => {
  let mockSettings: LoadedSettings;
  let mockReadlineInterface: {
    question: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Create mock settings
    mockSettings = {
      merged: {
        ui: {
          autoThemePrompt: true,
        },
      },
      setValue: vi.fn(),
    } as unknown as LoadedSettings;

    // Create mock readline interface
    mockReadlineInterface = {
      question: vi.fn(),
      close: vi.fn(),
    };

    // Mock readline.createInterface
    vi.mocked(readline.createInterface).mockReturnValue(
      mockReadlineInterface as unknown as ReturnType<
        typeof readline.createInterface
      >,
    );

    // Spy on console.log
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleLogSpy.mockRestore();
  });

  describe('Prompt suppression', () => {
    it('should show notification but not prompt if autoThemePrompt is false', async () => {
      mockSettings.merged.ui = { autoThemePrompt: false };

      const result = await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(result).toBe(false);
      // Should show the notification
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Terminal background is light'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('using a dark theme'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Use /theme to switch themes'),
      );
      // Should NOT create readline interface (no interactive prompt)
      expect(readline.createInterface).not.toHaveBeenCalled();
      expect(mockSettings.setValue).not.toHaveBeenCalled();
    });

    it('should show prompt if autoThemePrompt is undefined (defaults to showing)', async () => {
      mockSettings.merged.ui = {};

      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('n');
      });

      const result = await promptEnableAutoTheme('light', 'dark', mockSettings);

      // When undefined, it defaults to showing the prompt (not suppressing it)
      expect(readline.createInterface).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('should show prompt if autoThemePrompt is true', async () => {
      mockSettings.merged.ui = { autoThemePrompt: true };

      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('n');
      });

      await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(readline.createInterface).toHaveBeenCalled();
    });

    it('should show prompt if autoThemePrompt is not set (default behavior)', async () => {
      mockSettings.merged.ui = undefined;

      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('n');
      });

      await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(readline.createInterface).toHaveBeenCalled();
    });
  });

  describe('Readline interface creation', () => {
    it('should create readline interface with stdin and stdout', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('y');
      });

      await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(readline.createInterface).toHaveBeenCalledWith({
        input: process.stdin,
        output: process.stdout,
      });
    });

    it('should close readline interface after answer', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('y');
      });

      await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(mockReadlineInterface.close).toHaveBeenCalled();
    });
  });

  describe('Notification and prompt messages', () => {
    it('should display notification for light terminal with dark theme', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('n');
      });

      await promptEnableAutoTheme('light', 'dark', mockSettings);

      // Check notification message
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Terminal background is light'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('using a dark theme'),
      );
    });

    it('should display notification for dark terminal with light theme', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('n');
      });

      await promptEnableAutoTheme('dark', 'light', mockSettings);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Terminal background is dark'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('using a light theme'),
      );
    });

    it('should handle ANSI theme type in notification', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('n');
      });

      await promptEnableAutoTheme('light', 'ansi', mockSettings);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('using an ansi theme'),
      );
    });

    it('should handle custom theme type in notification', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('n');
      });

      await promptEnableAutoTheme('dark', 'custom', mockSettings);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('using a custom theme'),
      );
    });

    it('should display correct prompt message', async () => {
      let questionMessage = '';
      mockReadlineInterface.question.mockImplementation((msg, callback) => {
        questionMessage = msg;
        callback('n');
      });

      await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(questionMessage).toContain('enable auto theme');
      expect(questionMessage).toContain('automatically match your terminal');
    });
  });

  describe('User accepts prompt', () => {
    it('should enable auto theme when user enters "y"', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('y');
      });

      const result = await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(result).toBe(true);
      expect(mockSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'ui.theme',
        AUTO_THEME,
      );
    });

    it('should enable auto theme when user enters "Y" (uppercase)', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('Y');
      });

      const result = await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(result).toBe(true);
      expect(mockSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'ui.theme',
        AUTO_THEME,
      );
    });

    it('should enable auto theme when user enters "yes"', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('yes');
      });

      const result = await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(result).toBe(true);
      expect(mockSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'ui.theme',
        AUTO_THEME,
      );
    });

    it('should enable auto theme when user enters "YES" (uppercase)', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('YES');
      });

      const result = await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(result).toBe(true);
    });

    it('should enable auto theme when user presses Enter (empty input)', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('');
      });

      const result = await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(result).toBe(true);
      expect(mockSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'ui.theme',
        AUTO_THEME,
      );
    });

    it('should trim whitespace from answer', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('  y  ');
      });

      const result = await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(result).toBe(true);
    });

    it('should display success message when enabled', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('y');
      });

      await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Auto theme enabled'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('match your terminal background'),
      );
    });

    it('should display instructions about /theme command when enabled', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('y');
      });

      await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('/theme'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('gemini theme'),
      );
    });

    it('should not disable autoThemePrompt when user accepts', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('y');
      });

      await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(mockSettings.setValue).not.toHaveBeenCalledWith(
        SettingScope.User,
        'ui.autoThemePrompt',
        expect.anything(),
      );
    });
  });

  describe('User declines prompt', () => {
    it('should not enable auto theme when user enters "n"', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('n');
      });

      const result = await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(result).toBe(false);
      expect(mockSettings.setValue).not.toHaveBeenCalledWith(
        SettingScope.User,
        'ui.theme',
        expect.anything(),
      );
    });

    it('should not enable auto theme when user enters "N" (uppercase)', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('N');
      });

      const result = await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(result).toBe(false);
    });

    it('should not enable auto theme when user enters "no"', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('no');
      });

      const result = await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(result).toBe(false);
    });

    it('should not enable auto theme when user enters "NO" (uppercase)', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('NO');
      });

      const result = await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(result).toBe(false);
    });

    it('should disable future prompts when user declines', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('n');
      });

      await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(mockSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'ui.autoThemePrompt',
        false,
      );
    });

    it('should display message about disabling prompt when declined', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('n');
      });

      await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Auto theme prompt disabled'),
      );
    });

    it('should display instructions about manual theme switching when declined', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('n');
      });

      await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('/theme'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('gemini theme'),
      );
    });

    it('should treat any other input as declining', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('maybe');
      });

      const result = await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(result).toBe(false);
      expect(mockSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'ui.autoThemePrompt',
        false,
      );
    });

    it('should treat random input as declining', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('askjdhaksjdh');
      });

      const result = await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(result).toBe(false);
    });
  });

  describe('SettingScope usage', () => {
    it('should save theme setting to User scope', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('y');
      });

      await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(mockSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        expect.any(String),
        expect.anything(),
      );
    });

    it('should save autoThemePrompt to User scope when declining', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('n');
      });

      await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(mockSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'ui.autoThemePrompt',
        false,
      );
    });
  });

  describe('AUTO_THEME constant usage', () => {
    it('should use AUTO_THEME constant instead of string literal', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('y');
      });

      await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(mockSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'ui.theme',
        AUTO_THEME,
      );

      // Verify it's not using the string 'auto'
      const calls = vi.mocked(mockSettings.setValue).mock.calls;
      const themeCall = calls.find((call) => call[1] === 'ui.theme');
      expect(themeCall?.[2]).toBe(AUTO_THEME);
      expect(AUTO_THEME).toBe('auto'); // Just to verify the constant value
    });
  });

  describe('Edge cases', () => {
    it('should handle settings without ui object', async () => {
      // Create new settings object without ui property
      const settingsWithoutUi = {
        merged: {},
        setValue: vi.fn(),
      } as unknown as LoadedSettings;

      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('y');
      });

      const result = await promptEnableAutoTheme(
        'light',
        'dark',
        settingsWithoutUi,
      );

      expect(result).toBe(true);
      expect(settingsWithoutUi.setValue).toHaveBeenCalled();
    });

    it('should handle all theme types correctly', async () => {
      const themeTypes: Array<'light' | 'dark' | 'ansi' | 'custom'> = [
        'light',
        'dark',
        'ansi',
        'custom',
      ];

      for (const themeType of themeTypes) {
        vi.clearAllMocks();

        mockReadlineInterface.question.mockImplementation((_, callback) => {
          callback('y');
        });

        const result = await promptEnableAutoTheme(
          'light',
          themeType,
          mockSettings,
        );

        expect(result).toBe(true);
        // Check that notification contains the theme type
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining(themeType),
        );
      }
    });

    it('should handle both terminal backgrounds correctly', async () => {
      // Light terminal
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('y');
      });

      await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('light'),
      );

      vi.clearAllMocks();

      // Dark terminal
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('y');
      });

      await promptEnableAutoTheme('dark', 'light', mockSettings);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('dark'),
      );
    });

    it('should handle newline characters in input', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('y\n');
      });

      const result = await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(result).toBe(true);
    });

    it('should handle tabs and spaces in input', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        callback('\t  y  \t');
      });

      const result = await promptEnableAutoTheme('light', 'dark', mockSettings);

      expect(result).toBe(true);
    });
  });

  describe('Promise resolution', () => {
    it('should resolve promise after user answers', async () => {
      mockReadlineInterface.question.mockImplementation((_, callback) => {
        // Simulate async user input
        setTimeout(() => callback('y'), 10);
      });

      const start = Date.now();
      const result = await promptEnableAutoTheme('light', 'dark', mockSettings);
      const duration = Date.now() - start;

      expect(result).toBe(true);
      expect(duration).toBeGreaterThanOrEqual(10);
    });

    it('should not resolve until user provides input', async () => {
      let resolveCallback: ((answer: string) => void) | undefined;

      mockReadlineInterface.question.mockImplementation((_, callback) => {
        resolveCallback = callback;
      });

      const promise = promptEnableAutoTheme('light', 'dark', mockSettings);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Promise should still be pending
      let resolved = false;
      promise.then(() => {
        resolved = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(resolved).toBe(false);

      // Now resolve it
      if (resolveCallback) {
        resolveCallback('y');
      }
      await promise;
      expect(resolved).toBe(true);
    });
  });
});
