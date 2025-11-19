/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThemeCommand } from './useThemeCommand.js';
import * as themeManagerModule from '../themes/theme-manager.js';
import { MessageType } from '../types.js';
import type { LoadedSettings } from '../../config/settings.js';
import { SettingScope as ImportedSettingScope } from '../../config/settings.js';

vi.mock('../themes/theme-manager.js', () => ({
  themeManager: {
    setActiveTheme: vi.fn(),
    findThemeByName: vi.fn(),
    loadCustomThemes: vi.fn(),
  },
}));

describe('useThemeCommand', () => {
  let mockLoadedSettings: LoadedSettings;
  let mockSetThemeError: ReturnType<typeof vi.fn>;
  let mockAddItem: ReturnType<typeof vi.fn>;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['NO_COLOR'];

    mockLoadedSettings = {
      merged: {
        ui: {
          theme: 'default',
          customThemes: {},
        },
      },
      user: {
        settings: {
          ui: {
            theme: 'default',
            customThemes: {},
          },
        },
      },
      workspace: {
        settings: {
          ui: {
            customThemes: {},
          },
        },
      },
      setValue: vi.fn(),
    } as unknown as LoadedSettings;

    mockSetThemeError = vi.fn();
    mockAddItem = vi.fn();

    vi.mocked(themeManagerModule.themeManager.setActiveTheme).mockReturnValue(
      true,
    );
    vi.mocked(themeManagerModule.themeManager.findThemeByName).mockReturnValue(
      {} as never,
    );
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('initialization', () => {
    it('should return correct interface', () => {
      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      expect(result.current).toHaveProperty('isThemeDialogOpen');
      expect(result.current).toHaveProperty('openThemeDialog');
      expect(result.current).toHaveProperty('handleThemeSelect');
      expect(result.current).toHaveProperty('handleThemeHighlight');
    });

    it('should have dialog closed by default', () => {
      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      expect(result.current.isThemeDialogOpen).toBe(false);
    });

    it('should open dialog if initialThemeError is provided', () => {
      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          'Theme not found',
        ),
      );

      expect(result.current.isThemeDialogOpen).toBe(true);
    });

    it('should not open dialog if initialThemeError is null', () => {
      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      expect(result.current.isThemeDialogOpen).toBe(false);
    });
  });

  describe('openThemeDialog', () => {
    it('should open the theme dialog', () => {
      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.openThemeDialog();
      });

      expect(result.current.isThemeDialogOpen).toBe(true);
    });

    it('should not open dialog when NO_COLOR is set', () => {
      process.env['NO_COLOR'] = '1';

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.openThemeDialog();
      });

      expect(result.current.isThemeDialogOpen).toBe(false);
    });

    it('should add info message when NO_COLOR is set', () => {
      process.env['NO_COLOR'] = 'true';

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.openThemeDialog();
      });

      expect(mockAddItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: 'Theme configuration unavailable due to NO_COLOR env variable.',
        },
        expect.any(Number),
      );
    });

    it('should use stable callback reference', () => {
      const { result, rerender } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      const firstCallback = result.current.openThemeDialog;
      rerender();
      const secondCallback = result.current.openThemeDialog;

      expect(firstCallback).toBe(secondCallback);
    });
  });

  describe('handleThemeHighlight', () => {
    it('should apply theme when highlighted', () => {
      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeHighlight('dark');
      });

      expect(
        themeManagerModule.themeManager.setActiveTheme,
      ).toHaveBeenCalledWith('dark');
    });

    it('should clear error on successful theme application', () => {
      vi.mocked(themeManagerModule.themeManager.setActiveTheme).mockReturnValue(
        true,
      );

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeHighlight('valid-theme');
      });

      expect(mockSetThemeError).toHaveBeenCalledWith(null);
    });

    it('should set error when theme not found', () => {
      vi.mocked(themeManagerModule.themeManager.setActiveTheme).mockReturnValue(
        false,
      );

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeHighlight('invalid-theme');
      });

      expect(mockSetThemeError).toHaveBeenCalledWith(
        'Theme "invalid-theme" not found.',
      );
    });

    it('should open dialog when theme not found', () => {
      vi.mocked(themeManagerModule.themeManager.setActiveTheme).mockReturnValue(
        false,
      );

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeHighlight('invalid-theme');
      });

      expect(result.current.isThemeDialogOpen).toBe(true);
    });

    it('should handle undefined theme name', () => {
      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeHighlight(undefined);
      });

      expect(
        themeManagerModule.themeManager.setActiveTheme,
      ).toHaveBeenCalledWith(undefined);
    });
  });

  describe('handleThemeSelect', () => {
    it('should update settings with selected theme', () => {
      vi.mocked(
        themeManagerModule.themeManager.findThemeByName,
      ).mockReturnValue({} as never);

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeSelect('dark', ImportedSettingScope.User);
      });

      expect(mockLoadedSettings.setValue).toHaveBeenCalledWith(
        ImportedSettingScope.User,
        'ui.theme',
        'dark',
      );
    });

    it('should load custom themes', () => {
      vi.mocked(
        themeManagerModule.themeManager.findThemeByName,
      ).mockReturnValue({} as never);

      const customThemes = { myTheme: {} };
      mockLoadedSettings.merged.ui = { customThemes } as never;

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeSelect('dark', ImportedSettingScope.User);
      });

      expect(
        themeManagerModule.themeManager.loadCustomThemes,
      ).toHaveBeenCalledWith(customThemes);
    });

    it('should apply theme after selection', () => {
      vi.mocked(
        themeManagerModule.themeManager.findThemeByName,
      ).mockReturnValue({} as never);

      mockLoadedSettings.merged.ui = { theme: 'selected-theme' } as never;

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeSelect('dark', ImportedSettingScope.User);
      });

      expect(
        themeManagerModule.themeManager.setActiveTheme,
      ).toHaveBeenCalledWith('selected-theme');
    });

    it('should close dialog after selection', () => {
      vi.mocked(
        themeManagerModule.themeManager.findThemeByName,
      ).mockReturnValue({} as never);

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          'error',
        ),
      );

      expect(result.current.isThemeDialogOpen).toBe(true);

      act(() => {
        result.current.handleThemeSelect('dark', ImportedSettingScope.User);
      });

      expect(result.current.isThemeDialogOpen).toBe(false);
    });

    it('should clear theme error on successful selection', () => {
      vi.mocked(
        themeManagerModule.themeManager.findThemeByName,
      ).mockReturnValue({} as never);

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeSelect('dark', ImportedSettingScope.User);
      });

      expect(mockSetThemeError).toHaveBeenCalledWith(null);
    });

    it('should reject theme not in scope', () => {
      vi.mocked(
        themeManagerModule.themeManager.findThemeByName,
      ).mockReturnValue(undefined as never);

      mockLoadedSettings.user.settings.ui = { customThemes: {} } as never;
      mockLoadedSettings.workspace.settings.ui = { customThemes: {} } as never;

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeSelect(
          'nonexistent',
          ImportedSettingScope.User,
        );
      });

      expect(mockSetThemeError).toHaveBeenCalledWith(
        'Theme "nonexistent" not found in selected scope.',
      );
      expect(result.current.isThemeDialogOpen).toBe(true);
    });

    it('should accept custom theme from user settings', () => {
      vi.mocked(
        themeManagerModule.themeManager.findThemeByName,
      ).mockReturnValue(undefined as never);

      mockLoadedSettings.user.settings.ui = {
        customThemes: { myTheme: {} },
      } as never;

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeSelect('myTheme', ImportedSettingScope.User);
      });

      expect(mockLoadedSettings.setValue).toHaveBeenCalled();
      expect(mockSetThemeError).toHaveBeenCalledWith(null);
    });

    it('should accept custom theme from workspace settings', () => {
      vi.mocked(
        themeManagerModule.themeManager.findThemeByName,
      ).mockReturnValue(undefined as never);

      mockLoadedSettings.user.settings.ui = { customThemes: {} } as never;
      mockLoadedSettings.workspace.settings.ui = {
        customThemes: { workspaceTheme: {} },
      } as never;

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeSelect(
          'workspaceTheme',
          ImportedSettingScope.Workspace,
        );
      });

      expect(mockLoadedSettings.setValue).toHaveBeenCalled();
      expect(mockSetThemeError).toHaveBeenCalledWith(null);
    });

    it('should prefer workspace custom theme over user', () => {
      vi.mocked(
        themeManagerModule.themeManager.findThemeByName,
      ).mockReturnValue(undefined as never);

      mockLoadedSettings.user.settings.ui = {
        customThemes: { shared: { type: 'user' } },
      } as never;
      mockLoadedSettings.workspace.settings.ui = {
        customThemes: { shared: { type: 'workspace' } },
      } as never;

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeSelect('shared', ImportedSettingScope.User);
      });

      expect(mockSetThemeError).toHaveBeenCalledWith(null);
    });

    it('should close dialog even if error occurs', () => {
      vi.mocked(
        themeManagerModule.themeManager.setActiveTheme,
      ).mockImplementation(() => {
        throw new Error('Theme error');
      });

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          'error',
        ),
      );

      expect(result.current.isThemeDialogOpen).toBe(true);

      expect(() => {
        act(() => {
          result.current.handleThemeSelect('dark', ImportedSettingScope.User);
        });
      }).toThrow();

      expect(result.current.isThemeDialogOpen).toBe(false);
    });

    it('should handle undefined theme name', () => {
      vi.mocked(
        themeManagerModule.themeManager.findThemeByName,
      ).mockReturnValue({} as never);

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeSelect(undefined, ImportedSettingScope.User);
      });

      expect(mockLoadedSettings.setValue).toHaveBeenCalledWith(
        ImportedSettingScope.User,
        'ui.theme',
        undefined,
      );
    });
  });

  describe('scope handling', () => {
    it('should work with User scope', () => {
      vi.mocked(
        themeManagerModule.themeManager.findThemeByName,
      ).mockReturnValue({} as never);

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeSelect('dark', ImportedSettingScope.User);
      });

      expect(mockLoadedSettings.setValue).toHaveBeenCalledWith(
        ImportedSettingScope.User,
        'ui.theme',
        'dark',
      );
    });

    it('should work with Workspace scope', () => {
      vi.mocked(
        themeManagerModule.themeManager.findThemeByName,
      ).mockReturnValue({} as never);

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeSelect(
          'dark',
          ImportedSettingScope.Workspace,
        );
      });

      expect(mockLoadedSettings.setValue).toHaveBeenCalledWith(
        ImportedSettingScope.Workspace,
        'ui.theme',
        'dark',
      );
    });

    it('should work with System scope', () => {
      vi.mocked(
        themeManagerModule.themeManager.findThemeByName,
      ).mockReturnValue({} as never);

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeSelect('dark', ImportedSettingScope.System);
      });

      expect(mockLoadedSettings.setValue).toHaveBeenCalledWith(
        ImportedSettingScope.System,
        'ui.theme',
        'dark',
      );
    });
  });

  describe('edge cases', () => {
    it('should handle missing ui settings', () => {
      mockLoadedSettings.user.settings.ui = undefined as never;
      mockLoadedSettings.workspace.settings.ui = undefined as never;

      vi.mocked(
        themeManagerModule.themeManager.findThemeByName,
      ).mockReturnValue({} as never);

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeSelect('dark', ImportedSettingScope.User);
      });

      expect(mockLoadedSettings.setValue).toHaveBeenCalled();
    });

    it('should handle missing customThemes', () => {
      mockLoadedSettings.user.settings.ui = {} as never;
      mockLoadedSettings.workspace.settings.ui = {} as never;

      vi.mocked(
        themeManagerModule.themeManager.findThemeByName,
      ).mockReturnValue({} as never);

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeSelect('dark', ImportedSettingScope.User);
      });

      expect(mockLoadedSettings.setValue).toHaveBeenCalled();
    });

    it('should handle empty custom themes object', () => {
      mockLoadedSettings.user.settings.ui = { customThemes: {} } as never;
      mockLoadedSettings.workspace.settings.ui = { customThemes: {} } as never;

      vi.mocked(
        themeManagerModule.themeManager.findThemeByName,
      ).mockReturnValue({} as never);

      const { result } = renderHook(() =>
        useThemeCommand(
          mockLoadedSettings,
          mockSetThemeError,
          mockAddItem,
          null,
        ),
      );

      act(() => {
        result.current.handleThemeSelect('dark', ImportedSettingScope.User);
      });

      expect(mockSetThemeError).toHaveBeenCalledWith(null);
    });
  });
});
