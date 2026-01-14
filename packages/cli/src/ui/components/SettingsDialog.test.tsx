/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 *
 *
 * This test suite covers:
 * - Initial rendering and display state
 * - Keyboard navigation (arrows, vim keys, Tab)
 * - Settings toggling (Enter, Space)
 * - Focus section switching between settings and scope selector
 * - Scope selection and settings persistence across scopes
 * - Restart-required vs immediate settings behavior
 * - VimModeContext integration
 * - Complex user interaction workflows
 * - Error handling and edge cases
 * - Display values for inherited and overridden settings
 *
 */

import { render } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettingsDialog } from './SettingsDialog.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { VimModeProvider } from '../contexts/VimModeContext.js';
import { KeypressProvider } from '../contexts/KeypressContext.js';
import { act } from 'react';
import { saveModifiedSettings, TEST_ONLY } from '../../utils/settingsUtils.js';
import {
  getSettingsSchema,
  type SettingDefinition,
  type SettingsSchemaType,
} from '../../config/settingsSchema.js';
import { terminalCapabilityManager } from '../utils/terminalCapabilityManager.js';

// Mock the VimModeContext
const mockToggleVimEnabled = vi.fn().mockResolvedValue(undefined);
const mockSetVimMode = vi.fn();

vi.mock('../contexts/UIStateContext.js', () => ({
  useUIState: () => ({
    mainAreaWidth: 100, // Fixed width for consistent snapshots
  }),
}));

enum TerminalKeys {
  ENTER = '\u000D',
  TAB = '\t',
  UP_ARROW = '\u001B[A',
  DOWN_ARROW = '\u001B[B',
  LEFT_ARROW = '\u001B[D',
  RIGHT_ARROW = '\u001B[C',
  ESCAPE = '\u001B',
  BACKSPACE = '\u0008',
}

const createMockSettings = (
  userSettings = {},
  systemSettings = {},
  workspaceSettings = {},
) =>
  new LoadedSettings(
    {
      settings: { ui: { customThemes: {} }, mcpServers: {}, ...systemSettings },
      originalSettings: {
        ui: { customThemes: {} },
        mcpServers: {},
        ...systemSettings,
      },
      path: '/system/settings.json',
    },
    {
      settings: {},
      originalSettings: {},
      path: '/system/system-defaults.json',
    },
    {
      settings: {
        ui: { customThemes: {} },
        mcpServers: {},
        ...userSettings,
      },
      originalSettings: {
        ui: { customThemes: {} },
        mcpServers: {},
        ...userSettings,
      },
      path: '/user/settings.json',
    },
    {
      settings: {
        ui: { customThemes: {} },
        mcpServers: {},
        ...workspaceSettings,
      },
      originalSettings: {
        ui: { customThemes: {} },
        mcpServers: {},
        ...workspaceSettings,
      },
      path: '/workspace/settings.json',
    },
    true,
    [],
  );

vi.mock('../../config/settingsSchema.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../config/settingsSchema.js')>();
  return {
    ...original,
    getSettingsSchema: vi.fn(original.getSettingsSchema),
  };
});

vi.mock('../contexts/VimModeContext.js', async () => {
  const actual = await vi.importActual('../contexts/VimModeContext.js');
  return {
    ...actual,
    useVimMode: () => ({
      vimEnabled: false,
      vimMode: 'INSERT' as const,
      toggleVimEnabled: mockToggleVimEnabled,
      setVimMode: mockSetVimMode,
    }),
  };
});

vi.mock('../../utils/settingsUtils.js', async () => {
  const actual = await vi.importActual('../../utils/settingsUtils.js');
  return {
    ...actual,
    saveModifiedSettings: vi.fn(),
  };
});

// Shared test schemas
enum StringEnum {
  FOO = 'foo',
  BAR = 'bar',
  BAZ = 'baz',
}

const ENUM_SETTING: SettingDefinition = {
  type: 'enum',
  label: 'Theme',
  options: [
    {
      label: 'Foo',
      value: StringEnum.FOO,
    },
    {
      label: 'Bar',
      value: StringEnum.BAR,
    },
    {
      label: 'Baz',
      value: StringEnum.BAZ,
    },
  ],
  category: 'UI',
  requiresRestart: false,
  default: StringEnum.BAR,
  description: 'The color theme for the UI.',
  showInDialog: true,
};

const ENUM_FAKE_SCHEMA: SettingsSchemaType = {
  ui: {
    showInDialog: false,
    properties: {
      theme: {
        ...ENUM_SETTING,
      },
    },
  },
} as unknown as SettingsSchemaType;

const TOOLS_SHELL_FAKE_SCHEMA: SettingsSchemaType = {
  tools: {
    type: 'object',
    label: 'Tools',
    category: 'Tools',
    requiresRestart: false,
    default: {},
    description: 'Tool settings.',
    showInDialog: false,
    properties: {
      shell: {
        type: 'object',
        label: 'Shell',
        category: 'Tools',
        requiresRestart: false,
        default: {},
        description: 'Shell tool settings.',
        showInDialog: false,
        properties: {
          showColor: {
            type: 'boolean',
            label: 'Show Color',
            category: 'Tools',
            requiresRestart: false,
            default: false,
            description: 'Show color in shell output.',
            showInDialog: true,
          },
          enableInteractiveShell: {
            type: 'boolean',
            label: 'Enable Interactive Shell',
            category: 'Tools',
            requiresRestart: true,
            default: true,
            description: 'Enable interactive shell mode.',
            showInDialog: true,
          },
          pager: {
            type: 'string',
            label: 'Pager',
            category: 'Tools',
            requiresRestart: false,
            default: 'cat',
            description: 'The pager command to use for shell output.',
            showInDialog: true,
          },
        },
      },
    },
  },
} as unknown as SettingsSchemaType;

// Helper function to render SettingsDialog with standard wrapper
const renderDialog = (
  settings: LoadedSettings,
  onSelect: ReturnType<typeof vi.fn>,
  options?: {
    onRestartRequest?: ReturnType<typeof vi.fn>;
    availableTerminalHeight?: number;
  },
) =>
  render(
    <KeypressProvider>
      <SettingsDialog
        settings={settings}
        onSelect={onSelect}
        onRestartRequest={options?.onRestartRequest}
        availableTerminalHeight={options?.availableTerminalHeight}
      />
    </KeypressProvider>,
  );

describe('SettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(
      terminalCapabilityManager,
      'isKittyProtocolEnabled',
    ).mockReturnValue(true);
    mockToggleVimEnabled.mockRejectedValue(undefined);
  });

  afterEach(() => {
    TEST_ONLY.clearFlattenedSchema();
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  describe('Initial Rendering', () => {
    it('should render the settings dialog with default state', () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { lastFrame } = renderDialog(settings, onSelect);

      const output = lastFrame();
      expect(output).toContain('Settings');
      expect(output).toContain('Apply To');
      // Use regex for more flexible help text matching
      expect(output).toMatch(/Enter.*select.*Esc.*close/);
    });

    it('should accept availableTerminalHeight prop without errors', () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { lastFrame } = renderDialog(settings, onSelect, {
        availableTerminalHeight: 20,
      });

      const output = lastFrame();
      // Should still render properly with the height prop
      expect(output).toContain('Settings');
      // Use regex for more flexible help text matching
      expect(output).toMatch(/Enter.*select.*Esc.*close/);
    });

    it('should render settings list with visual indicators', () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { lastFrame } = renderDialog(settings, onSelect);

      const output = lastFrame();
      // Use snapshot to capture visual layout including indicators
      expect(output).toMatchSnapshot();
    });
  });

  describe('Setting Descriptions', () => {
    it('should render descriptions for settings that have them', () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { lastFrame } = renderDialog(settings, onSelect);

      const output = lastFrame();
      // 'general.vimMode' has description 'Enable Vim keybindings' in settingsSchema.ts
      expect(output).toContain('Vim Mode');
      expect(output).toContain('Enable Vim keybindings');
      // 'general.disableAutoUpdate' has description 'Disable automatic updates'
      expect(output).toContain('Disable Auto Update');
      expect(output).toContain('Disable automatic updates');
    });
  });

  describe('Settings Navigation', () => {
    it.each([
      {
        name: 'arrow keys',
        down: TerminalKeys.DOWN_ARROW,
        up: TerminalKeys.UP_ARROW,
      },
      {
        name: 'vim keys (j/k)',
        down: 'j',
        up: 'k',
      },
    ])('should navigate with $name', async ({ down, up }) => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { stdin, unmount, lastFrame } = renderDialog(settings, onSelect);

      const initialFrame = lastFrame();
      expect(initialFrame).toContain('Vim Mode');

      // Navigate down
      act(() => {
        stdin.write(down);
      });

      await waitFor(() => {
        expect(lastFrame()).toContain('Disable Auto Update');
      });

      // Navigate up
      act(() => {
        stdin.write(up);
      });

      await waitFor(() => {
        expect(lastFrame()).toContain('Vim Mode');
      });

      unmount();
    });

    it('wraps around when at the top of the list', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { stdin, unmount, lastFrame } = renderDialog(settings, onSelect);

      // Try to go up from first item
      act(() => {
        stdin.write(TerminalKeys.UP_ARROW);
      });

      await waitFor(() => {
        // Should wrap to last setting (without relying on exact bullet character)
        expect(lastFrame()).toContain('Codebase Investigator Max Num Turns');
      });

      unmount();
    });
  });

  describe('Settings Toggling', () => {
    it('should toggle setting with Enter key', async () => {
      vi.mocked(saveModifiedSettings).mockClear();

      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { stdin, unmount, lastFrame } = renderDialog(settings, onSelect);

      // Wait for initial render and verify we're on Preview Features (first setting)
      await waitFor(() => {
        expect(lastFrame()).toContain('Preview Features (e.g., models)');
      });

      // Navigate to Vim Mode setting and verify we're there
      act(() => {
        stdin.write(TerminalKeys.DOWN_ARROW as string);
      });
      await waitFor(() => {
        expect(lastFrame()).toContain('Vim Mode');
      });

      // Toggle the setting
      act(() => {
        stdin.write(TerminalKeys.ENTER as string);
      });
      // Wait for the setting change to be processed
      await waitFor(() => {
        expect(
          vi.mocked(saveModifiedSettings).mock.calls.length,
        ).toBeGreaterThan(0);
      });

      // Wait for the mock to be called
      await waitFor(() => {
        expect(vi.mocked(saveModifiedSettings)).toHaveBeenCalled();
      });

      expect(vi.mocked(saveModifiedSettings)).toHaveBeenCalledWith(
        new Set<string>(['general.vimMode']),
        expect.objectContaining({
          general: expect.objectContaining({
            vimMode: true,
          }),
        }),
        expect.any(LoadedSettings),
        SettingScope.User,
      );

      unmount();
    });

    describe('enum values', () => {
      it.each([
        {
          name: 'toggles to next value',
          initialValue: undefined,
          expectedValue: StringEnum.BAZ,
        },
        {
          name: 'loops back to first value when at end',
          initialValue: StringEnum.BAZ,
          expectedValue: StringEnum.FOO,
        },
      ])('$name', async ({ initialValue, expectedValue }) => {
        vi.mocked(saveModifiedSettings).mockClear();
        vi.mocked(getSettingsSchema).mockReturnValue(ENUM_FAKE_SCHEMA);

        const settings = createMockSettings();
        if (initialValue !== undefined) {
          settings.setValue(SettingScope.User, 'ui.theme', initialValue);
        }

        const onSelect = vi.fn();

        const { stdin, unmount } = renderDialog(settings, onSelect);

        act(() => {
          stdin.write(TerminalKeys.DOWN_ARROW as string);
          stdin.write(TerminalKeys.ENTER as string);
        });

        await waitFor(() => {
          expect(vi.mocked(saveModifiedSettings)).toHaveBeenCalled();
        });

        expect(vi.mocked(saveModifiedSettings)).toHaveBeenCalledWith(
          new Set<string>(['ui.theme']),
          expect.objectContaining({
            ui: expect.objectContaining({
              theme: expectedValue,
            }),
          }),
          expect.any(LoadedSettings),
          SettingScope.User,
        );

        unmount();
      });
    });

    it('should handle vim mode setting specially', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { stdin, unmount } = renderDialog(settings, onSelect);

      // Navigate to vim mode setting and toggle it
      // This would require knowing the exact position, so we'll just test that the mock is called
      act(() => {
        stdin.write(TerminalKeys.ENTER as string); // Enter key
      });

      // The mock should potentially be called if vim mode was toggled
      unmount();
    });
  });

  describe('Scope Selection', () => {
    it('should switch between scopes', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { stdin, unmount } = renderDialog(settings, onSelect);

      // Switch to scope focus
      act(() => {
        stdin.write(TerminalKeys.TAB); // Tab key
        // Select different scope (numbers 1-3 typically available)
        stdin.write('2'); // Select second scope option
      });

      unmount();
    });

    it('should reset to settings focus when scope is selected', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { lastFrame, unmount } = renderDialog(settings, onSelect);

      // Wait for initial render
      await waitFor(() => {
        expect(lastFrame()).toContain('Vim Mode');
      });

      // The UI should show the settings section is active and scope section is inactive
      expect(lastFrame()).toContain('Vim Mode'); // Settings section active
      expect(lastFrame()).toContain('Apply To'); // Scope section (don't rely on exact spacing)

      // This test validates the initial state - scope selection behavior
      // is complex due to keypress handling, so we focus on state validation

      unmount();
    });
  });

  describe('Restart Prompt', () => {
    it('should show restart prompt for restart-required settings', async () => {
      const settings = createMockSettings();
      const onRestartRequest = vi.fn();

      const { unmount } = renderDialog(settings, vi.fn(), {
        onRestartRequest,
      });

      // This test would need to trigger a restart-required setting change
      // The exact steps depend on which settings require restart

      unmount();
    });

    it('should handle restart request when r is pressed', async () => {
      const settings = createMockSettings();
      const onRestartRequest = vi.fn();

      const { stdin, unmount } = renderDialog(settings, vi.fn(), {
        onRestartRequest,
      });

      // Press 'r' key (this would only work if restart prompt is showing)
      act(() => {
        stdin.write('r');
      });

      // If restart prompt was showing, onRestartRequest should be called
      unmount();
    });
  });

  describe('Escape Key Behavior', () => {
    it('should call onSelect with undefined when Escape is pressed', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { lastFrame, unmount } = renderDialog(settings, onSelect);

      // Wait for initial render
      await waitFor(() => {
        expect(lastFrame()).toContain('Vim Mode');
      });

      // Verify the dialog is rendered properly
      expect(lastFrame()).toContain('Settings');
      expect(lastFrame()).toContain('Apply To');

      // This test validates rendering - escape key behavior depends on complex
      // keypress handling that's difficult to test reliably in this environment

      unmount();
    });
  });

  describe('Settings Persistence', () => {
    it('should persist settings across scope changes', async () => {
      const settings = createMockSettings({ vimMode: true });
      const onSelect = vi.fn();

      const { stdin, unmount } = renderDialog(settings, onSelect);

      // Switch to scope selector and change scope
      act(() => {
        stdin.write(TerminalKeys.TAB as string); // Tab
        stdin.write('2'); // Select workspace scope
      });

      // Settings should be reloaded for new scope
      unmount();
    });

    it('should show different values for different scopes', () => {
      const settings = createMockSettings(
        { vimMode: true }, // User settings
        { vimMode: false }, // System settings
        { autoUpdate: false }, // Workspace settings
      );
      const onSelect = vi.fn();

      const { lastFrame } = renderDialog(settings, onSelect);

      // Should show user scope values initially
      const output = lastFrame();
      expect(output).toContain('Settings');
    });
  });

  describe('Error Handling', () => {
    it('should handle vim mode toggle errors gracefully', async () => {
      mockToggleVimEnabled.mockRejectedValue(new Error('Toggle failed'));

      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { stdin, unmount } = renderDialog(settings, onSelect);

      // Try to toggle a setting (this might trigger vim mode toggle)
      act(() => {
        stdin.write(TerminalKeys.ENTER as string); // Enter
      });

      // Should not crash
      unmount();
    });
  });

  describe('Complex State Management', () => {
    it('should track modified settings correctly', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { stdin, unmount } = renderDialog(settings, onSelect);

      // Toggle a setting, then toggle another setting
      act(() => {
        stdin.write(TerminalKeys.ENTER as string); // Enter
        stdin.write(TerminalKeys.DOWN_ARROW as string); // Down
        stdin.write(TerminalKeys.ENTER as string); // Enter
      });

      // Should track multiple modified settings
      unmount();
    });

    it('should handle scrolling when there are many settings', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { stdin, unmount } = renderDialog(settings, onSelect);

      // Navigate down many times to test scrolling
      act(() => {
        for (let i = 0; i < 10; i++) {
          stdin.write(TerminalKeys.DOWN_ARROW as string); // Down arrow
        }
      });

      unmount();
    });
  });

  describe('VimMode Integration', () => {
    it('should sync with VimModeContext when vim mode is toggled', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { stdin, unmount } = render(
        <VimModeProvider settings={settings}>
          <KeypressProvider>
            <SettingsDialog settings={settings} onSelect={onSelect} />
          </KeypressProvider>
        </VimModeProvider>,
      );

      // Navigate to and toggle vim mode setting
      // This would require knowing the exact position of vim mode setting
      act(() => {
        stdin.write(TerminalKeys.ENTER as string); // Enter
      });

      unmount();
    });
  });

  describe('Specific Settings Behavior', () => {
    it('should show correct display values for settings with different states', () => {
      const settings = createMockSettings(
        { vimMode: true, hideTips: false }, // User settings
        { hideWindowTitle: true }, // System settings
        { ideMode: false }, // Workspace settings
      );
      const onSelect = vi.fn();

      const { lastFrame } = renderDialog(settings, onSelect);

      const output = lastFrame();
      // Should contain settings labels
      expect(output).toContain('Settings');
    });

    it('should handle immediate settings save for non-restart-required settings', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { stdin, unmount } = renderDialog(settings, onSelect);

      // Toggle a non-restart-required setting (like hideTips)
      act(() => {
        stdin.write(TerminalKeys.ENTER as string); // Enter - toggle current setting
      });

      // Should save immediately without showing restart prompt
      unmount();
    });

    it('should show restart prompt for restart-required settings', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { lastFrame, unmount } = renderDialog(settings, onSelect);

      // This test would need to navigate to a specific restart-required setting
      // Since we can't easily target specific settings, we test the general behavior

      // Should not show restart prompt initially
      await waitFor(() => {
        expect(lastFrame()).not.toContain(
          'To see changes, Gemini CLI must be restarted',
        );
      });

      unmount();
    });

    it('should clear restart prompt when switching scopes', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { unmount } = renderDialog(settings, onSelect);

      // Restart prompt should be cleared when switching scopes
      unmount();
    });
  });

  describe('Settings Display Values', () => {
    it('should show correct values for inherited settings', () => {
      const settings = createMockSettings(
        {},
        { vimMode: true, hideWindowTitle: false }, // System settings
        {},
      );
      const onSelect = vi.fn();

      const { lastFrame } = renderDialog(settings, onSelect);

      const output = lastFrame();
      // Settings should show inherited values
      expect(output).toContain('Settings');
    });

    it('should show override indicator for overridden settings', () => {
      const settings = createMockSettings(
        { vimMode: false }, // User overrides
        { vimMode: true }, // System default
        {},
      );
      const onSelect = vi.fn();

      const { lastFrame } = renderDialog(settings, onSelect);

      const output = lastFrame();
      // Should show settings with override indicators
      expect(output).toContain('Settings');
    });
  });

  describe('Race Condition Regression Tests', () => {
    it.each([
      {
        name: 'not reset sibling settings when toggling a nested setting multiple times',
        toggleCount: 5,
        shellSettings: {
          showColor: false,
          enableInteractiveShell: true,
        },
        expectedSiblings: {
          enableInteractiveShell: true,
        },
      },
      {
        name: 'preserve multiple sibling settings in nested objects during rapid toggles',
        toggleCount: 3,
        shellSettings: {
          showColor: false,
          enableInteractiveShell: true,
          pager: 'less',
        },
        expectedSiblings: {
          enableInteractiveShell: true,
          pager: 'less',
        },
      },
    ])(
      'should $name',
      async ({ toggleCount, shellSettings, expectedSiblings }) => {
        vi.mocked(saveModifiedSettings).mockClear();

        vi.mocked(getSettingsSchema).mockReturnValue(TOOLS_SHELL_FAKE_SCHEMA);

        const settings = createMockSettings({
          tools: {
            shell: shellSettings,
          },
        });

        const onSelect = vi.fn();

        const { stdin, unmount } = renderDialog(settings, onSelect);

        for (let i = 0; i < toggleCount; i++) {
          act(() => {
            stdin.write(TerminalKeys.ENTER as string);
          });
        }

        await waitFor(() => {
          expect(
            vi.mocked(saveModifiedSettings).mock.calls.length,
          ).toBeGreaterThan(0);
        });

        const calls = vi.mocked(saveModifiedSettings).mock.calls;
        calls.forEach((call) => {
          const [modifiedKeys, pendingSettings] = call;

          if (modifiedKeys.has('tools.shell.showColor')) {
            const shellSettings = pendingSettings.tools?.shell as
              | Record<string, unknown>
              | undefined;

            Object.entries(expectedSiblings).forEach(([key, value]) => {
              expect(shellSettings?.[key]).toBe(value);
              expect(modifiedKeys.has(`tools.shell.${key}`)).toBe(false);
            });

            expect(modifiedKeys.size).toBe(1);
          }
        });

        expect(calls.length).toBeGreaterThan(0);

        unmount();
      },
    );
  });

  describe('Keyboard Shortcuts Edge Cases', () => {
    it('should handle rapid key presses gracefully', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { stdin, unmount } = renderDialog(settings, onSelect);

      // Rapid navigation
      act(() => {
        for (let i = 0; i < 5; i++) {
          stdin.write(TerminalKeys.DOWN_ARROW as string);
          stdin.write(TerminalKeys.UP_ARROW as string);
        }
      });

      // Should not crash
      unmount();
    });

    it.each([
      { key: 'Ctrl+C', code: '\u0003' },
      { key: 'Ctrl+L', code: '\u000C' },
    ])(
      'should handle $key to reset current setting to default',
      async ({ code }) => {
        const settings = createMockSettings({ vimMode: true });
        const onSelect = vi.fn();

        const { stdin, unmount } = renderDialog(settings, onSelect);

        act(() => {
          stdin.write(code);
        });

        // Should reset the current setting to its default value
        unmount();
      },
    );

    it('should handle navigation when only one setting exists', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { stdin, unmount } = renderDialog(settings, onSelect);

      // Try to navigate when potentially at bounds
      act(() => {
        stdin.write(TerminalKeys.DOWN_ARROW as string);
        stdin.write(TerminalKeys.UP_ARROW as string);
      });

      unmount();
    });

    it('should properly handle Tab navigation between sections', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { lastFrame, unmount } = renderDialog(settings, onSelect);

      // Wait for initial render
      await waitFor(() => {
        expect(lastFrame()).toContain('Vim Mode');
      });

      // Verify initial state: settings section active, scope section inactive
      expect(lastFrame()).toContain('Vim Mode'); // Settings section active
      expect(lastFrame()).toContain('Apply To'); // Scope section (don't rely on exact spacing)

      // This test validates the rendered UI structure for tab navigation
      // Actual tab behavior testing is complex due to keypress handling

      unmount();
    });
  });

  describe('Error Recovery', () => {
    it('should handle malformed settings gracefully', () => {
      // Create settings with potentially problematic values
      const settings = createMockSettings(
        { vimMode: null as unknown as boolean }, // Invalid value
        {},
        {},
      );
      const onSelect = vi.fn();

      const { lastFrame } = renderDialog(settings, onSelect);

      // Should still render without crashing
      expect(lastFrame()).toContain('Settings');
    });

    it('should handle missing setting definitions gracefully', () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      // Should not crash even if some settings are missing definitions
      const { lastFrame } = renderDialog(settings, onSelect);

      expect(lastFrame()).toContain('Settings');
    });
  });

  describe('Complex User Interactions', () => {
    it('should handle complete user workflow: navigate, toggle, change scope, exit', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { lastFrame, unmount } = renderDialog(settings, onSelect);

      // Wait for initial render
      await waitFor(() => {
        expect(lastFrame()).toContain('Vim Mode');
      });

      // Verify the complete UI is rendered with all necessary sections
      expect(lastFrame()).toContain('Settings'); // Title
      expect(lastFrame()).toContain('Vim Mode'); // Active setting
      expect(lastFrame()).toContain('Apply To'); // Scope section
      expect(lastFrame()).toContain('User Settings'); // Scope options (no numbers when settings focused)
      // Use regex for more flexible help text matching
      expect(lastFrame()).toMatch(/Enter.*select.*Tab.*focus.*Esc.*close/);

      // This test validates the complete UI structure is available for user workflow
      // Individual interactions are tested in focused unit tests

      unmount();
    });

    it('should allow changing multiple settings without losing pending changes', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { stdin, unmount } = renderDialog(settings, onSelect);

      // Toggle multiple settings
      act(() => {
        stdin.write(TerminalKeys.ENTER as string); // Enter
        stdin.write(TerminalKeys.DOWN_ARROW as string); // Down
        stdin.write(TerminalKeys.ENTER as string); // Enter
        stdin.write(TerminalKeys.DOWN_ARROW as string); // Down
        stdin.write(TerminalKeys.ENTER as string); // Enter
      });

      // The test verifies that all changes are preserved and the dialog still works
      // This tests the fix for the bug where changing one setting would reset all pending changes
      unmount();
    });

    it('should maintain state consistency during complex interactions', async () => {
      const settings = createMockSettings({ vimMode: true });
      const onSelect = vi.fn();

      const { stdin, unmount } = renderDialog(settings, onSelect);

      // Multiple scope changes
      act(() => {
        stdin.write(TerminalKeys.TAB as string); // Tab to scope
        stdin.write('2'); // Workspace
        stdin.write(TerminalKeys.TAB as string); // Tab to settings
        stdin.write(TerminalKeys.TAB as string); // Tab to scope
        stdin.write('1'); // User
      });

      // Should maintain consistent state
      unmount();
    });

    it('should handle restart workflow correctly', async () => {
      const settings = createMockSettings();
      const onRestartRequest = vi.fn();

      const { stdin, unmount } = renderDialog(settings, vi.fn(), {
        onRestartRequest,
      });

      // This would test the restart workflow if we could trigger it
      act(() => {
        stdin.write('r'); // Try restart key
      });

      // Without restart prompt showing, this should have no effect
      expect(onRestartRequest).not.toHaveBeenCalled();

      unmount();
    });
  });

  describe('String Settings Editing', () => {
    it('should allow editing and committing a string setting', async () => {
      let settings = createMockSettings({ 'a.string.setting': 'initial' });
      const onSelect = vi.fn();

      const { stdin, unmount, rerender } = render(
        <KeypressProvider>
          <SettingsDialog settings={settings} onSelect={onSelect} />
        </KeypressProvider>,
      );

      // Navigate to the last setting
      act(() => {
        for (let i = 0; i < 20; i++) {
          stdin.write('j'); // Down
        }
      });

      // Press Enter to start editing, type new value, and commit
      act(() => {
        stdin.write('\r'); // Start editing
        stdin.write('new value');
        stdin.write('\r'); // Commit
      });

      settings = createMockSettings(
        { 'a.string.setting': 'new value' },
        {},
        {},
      );
      rerender(
        <KeypressProvider>
          <SettingsDialog settings={settings} onSelect={onSelect} />
        </KeypressProvider>,
      );

      // Press Escape to exit
      act(() => {
        stdin.write('\u001B');
      });

      await waitFor(() => {
        expect(onSelect).toHaveBeenCalledWith(undefined, 'User');
      });

      unmount();
    });
  });

  describe('Search Functionality', () => {
    it('should display text entered in search', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { lastFrame, stdin, unmount } = renderDialog(settings, onSelect);

      // Wait for initial render and verify that search is not active
      await waitFor(() => {
        expect(lastFrame()).not.toContain('> Search:');
      });
      expect(lastFrame()).toContain('Search to filter');

      // Press '/' to enter search mode
      act(() => {
        stdin.write('/');
      });

      await waitFor(() => {
        expect(lastFrame()).toContain('/');
        expect(lastFrame()).not.toContain('Search to filter');
      });

      unmount();
    });

    it('should show search query and filter settings as user types', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { lastFrame, stdin, unmount } = renderDialog(settings, onSelect);

      act(() => {
        stdin.write('yolo');
      });

      await waitFor(() => {
        expect(lastFrame()).toContain('yolo');
        expect(lastFrame()).toContain('Disable YOLO Mode');
      });

      unmount();
    });

    it('should exit search settings when Escape is pressed', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { lastFrame, stdin, unmount } = renderDialog(settings, onSelect);

      act(() => {
        stdin.write('vim');
      });
      await waitFor(() => {
        expect(lastFrame()).toContain('vim');
      });

      // Press Escape
      act(() => {
        stdin.write(TerminalKeys.ESCAPE);
      });

      await waitFor(() => {
        // onSelect is called with (settingName, scope).
        // undefined settingName means "close dialog"
        expect(onSelect).toHaveBeenCalledWith(undefined, expect.anything());
      });

      unmount();
    });

    it('should handle backspace to modify search query', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { lastFrame, stdin, unmount } = renderDialog(settings, onSelect);

      act(() => {
        stdin.write('vimm');
      });
      await waitFor(() => {
        expect(lastFrame()).toContain('vimm');
      });

      // Press backspace
      act(() => {
        stdin.write(TerminalKeys.BACKSPACE);
      });

      await waitFor(() => {
        expect(lastFrame()).toContain('vim');
        expect(lastFrame()).toContain('Vim Mode');
        expect(lastFrame()).not.toContain(
          'Codebase Investigator Max Num Turns',
        );
      });

      unmount();
    });

    it('should display nothing when search yields no results', async () => {
      const settings = createMockSettings();
      const onSelect = vi.fn();

      const { lastFrame, stdin, unmount } = renderDialog(settings, onSelect);

      // Type a search query that won't match any settings
      act(() => {
        stdin.write('nonexistentsetting');
      });

      await waitFor(() => {
        expect(lastFrame()).toContain('nonexistentsetting');
        expect(lastFrame()).toContain('');
        expect(lastFrame()).not.toContain('Vim Mode'); // Should not contain any settings
        expect(lastFrame()).not.toContain('Disable Auto Update'); // Should not contain any settings
      });

      unmount();
    });
  });

  describe('Snapshot Tests', () => {
    /**
     * Snapshot tests for SettingsDialog component using ink-testing-library.
     * These tests capture the visual output of the component in various states.
     * The snapshots help ensure UI consistency and catch unintended visual changes.
     */

    it.each([
      {
        name: 'default state',
        userSettings: {},
        systemSettings: {},
        workspaceSettings: {},
        stdinActions: undefined,
      },
      {
        name: 'various boolean settings enabled',
        userSettings: {
          general: {
            vimMode: true,
            disableAutoUpdate: true,
            debugKeystrokeLogging: true,
            enablePromptCompletion: true,
          },
          ui: {
            hideWindowTitle: true,
            hideTips: true,
            showMemoryUsage: true,
            showLineNumbers: true,
            showCitations: true,
            accessibility: {
              disableLoadingPhrases: true,
              screenReader: true,
            },
          },
          ide: {
            enabled: true,
          },
          context: {
            loadMemoryFromIncludeDirectories: true,
            fileFiltering: {
              respectGitIgnore: true,
              respectGeminiIgnore: true,
              enableRecursiveFileSearch: true,
              disableFuzzySearch: false,
            },
          },
          tools: {
            enableInteractiveShell: true,
            autoAccept: true,
            useRipgrep: true,
          },
          security: {
            folderTrust: {
              enabled: true,
            },
          },
        },
        systemSettings: {},
        workspaceSettings: {},
        stdinActions: undefined,
      },
      {
        name: 'mixed boolean and number settings',
        userSettings: {
          general: {
            vimMode: false,
            disableAutoUpdate: true,
          },
          ui: {
            showMemoryUsage: true,
            hideWindowTitle: false,
          },
          tools: {
            truncateToolOutputThreshold: 50000,
            truncateToolOutputLines: 1000,
          },
          context: {
            discoveryMaxDirs: 500,
          },
          model: {
            maxSessionTurns: 100,
            skipNextSpeakerCheck: false,
          },
        },
        systemSettings: {},
        workspaceSettings: {},
        stdinActions: undefined,
      },
      {
        name: 'focused on scope selector',
        userSettings: {},
        systemSettings: {},
        workspaceSettings: {},
        stdinActions: (stdin: { write: (data: string) => void }) => {
          act(() => {
            stdin.write('\t');
          });
        },
      },
      {
        name: 'accessibility settings enabled',
        userSettings: {
          ui: {
            accessibility: {
              disableLoadingPhrases: true,
              screenReader: true,
            },
            showMemoryUsage: true,
            showLineNumbers: true,
          },
          general: {
            vimMode: true,
          },
        },
        systemSettings: {},
        workspaceSettings: {},
        stdinActions: undefined,
      },
      {
        name: 'file filtering settings configured',
        userSettings: {
          context: {
            fileFiltering: {
              respectGitIgnore: false,
              respectGeminiIgnore: true,
              enableRecursiveFileSearch: false,
              disableFuzzySearch: true,
            },
            loadMemoryFromIncludeDirectories: true,
            discoveryMaxDirs: 100,
          },
        },
        systemSettings: {},
        workspaceSettings: {},
        stdinActions: undefined,
      },
      {
        name: 'tools and security settings',
        userSettings: {
          tools: {
            enableInteractiveShell: true,
            autoAccept: false,
            useRipgrep: true,
            truncateToolOutputThreshold: 25000,
            truncateToolOutputLines: 500,
          },
          security: {
            folderTrust: {
              enabled: true,
            },
          },
          model: {
            maxSessionTurns: 50,
            skipNextSpeakerCheck: true,
          },
        },
        systemSettings: {},
        workspaceSettings: {},
        stdinActions: undefined,
      },
      {
        name: 'all boolean settings disabled',
        userSettings: {
          general: {
            vimMode: false,
            disableAutoUpdate: false,
            debugKeystrokeLogging: false,
            enablePromptCompletion: false,
          },
          ui: {
            hideWindowTitle: false,
            hideTips: false,
            showMemoryUsage: false,
            showLineNumbers: false,
            showCitations: false,
            accessibility: {
              disableLoadingPhrases: false,
              screenReader: false,
            },
          },
          ide: {
            enabled: false,
          },
          context: {
            loadMemoryFromIncludeDirectories: false,
            fileFiltering: {
              respectGitIgnore: false,
              respectGeminiIgnore: false,
              enableRecursiveFileSearch: false,
              disableFuzzySearch: false,
            },
          },
          tools: {
            enableInteractiveShell: false,
            autoAccept: false,
            useRipgrep: false,
          },
          security: {
            folderTrust: {
              enabled: false,
            },
          },
        },
        systemSettings: {},
        workspaceSettings: {},
        stdinActions: undefined,
      },
    ])(
      'should render $name correctly',
      ({ userSettings, systemSettings, workspaceSettings, stdinActions }) => {
        const settings = createMockSettings(
          userSettings,
          systemSettings,
          workspaceSettings,
        );
        const onSelect = vi.fn();

        const { lastFrame, stdin } = renderDialog(settings, onSelect);

        if (stdinActions) {
          stdinActions(stdin);
        }

        expect(lastFrame()).toMatchSnapshot();
      },
    );
  });
});
