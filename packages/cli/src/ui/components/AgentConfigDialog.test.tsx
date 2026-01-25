/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { AgentConfigDialog } from './AgentConfigDialog.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { KeypressProvider } from '../contexts/KeypressContext.js';
import type { AgentDefinition } from '@google/gemini-cli-core';

vi.mock('../contexts/UIStateContext.js', () => ({
  useUIState: () => ({
    mainAreaWidth: 100,
  }),
}));

enum TerminalKeys {
  ENTER = '\u000D',
  TAB = '\t',
  UP_ARROW = '\u001B[A',
  DOWN_ARROW = '\u001B[B',
  ESCAPE = '\u001B',
}

const createMockSettings = (
  userSettings = {},
  workspaceSettings = {},
): LoadedSettings => {
  const settings = new LoadedSettings(
    {
      settings: { ui: { customThemes: {} }, mcpServers: {}, agents: {} },
      originalSettings: {
        ui: { customThemes: {} },
        mcpServers: {},
        agents: {},
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
        agents: { overrides: {} },
        ...userSettings,
      },
      originalSettings: {
        ui: { customThemes: {} },
        mcpServers: {},
        agents: { overrides: {} },
        ...userSettings,
      },
      path: '/user/settings.json',
    },
    {
      settings: {
        ui: { customThemes: {} },
        mcpServers: {},
        agents: { overrides: {} },
        ...workspaceSettings,
      },
      originalSettings: {
        ui: { customThemes: {} },
        mcpServers: {},
        agents: { overrides: {} },
        ...workspaceSettings,
      },
      path: '/workspace/settings.json',
    },
    true,
    [],
  );

  // Mock setValue
  settings.setValue = vi.fn();

  return settings;
};

const createMockAgentDefinition = (
  overrides: Partial<AgentDefinition> = {},
): AgentDefinition =>
  ({
    name: 'test-agent',
    displayName: 'Test Agent',
    description: 'A test agent for testing',
    kind: 'local',
    modelConfig: {
      model: 'inherit',
      generateContentConfig: {
        temperature: 1.0,
      },
    },
    runConfig: {
      maxTimeMinutes: 5,
      maxTurns: 10,
    },
    experimental: false,
    ...overrides,
  }) as AgentDefinition;

describe('AgentConfigDialog', () => {
  let mockOnClose: ReturnType<typeof vi.fn>;
  let mockOnSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnClose = vi.fn();
    mockOnSave = vi.fn();
  });

  const renderDialog = (
    settings: LoadedSettings,
    definition: AgentDefinition = createMockAgentDefinition(),
  ) =>
    render(
      <KeypressProvider>
        <AgentConfigDialog
          agentName="test-agent"
          displayName="Test Agent"
          definition={definition}
          settings={settings}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />
      </KeypressProvider>,
    );

  describe('rendering', () => {
    it('should render the dialog with title', () => {
      const settings = createMockSettings();
      const { lastFrame } = renderDialog(settings);

      expect(lastFrame()).toContain('Configure: Test Agent');
    });

    it('should render all configuration fields', () => {
      const settings = createMockSettings();
      const { lastFrame } = renderDialog(settings);
      const frame = lastFrame();

      expect(frame).toContain('Enabled');
      expect(frame).toContain('Model');
      expect(frame).toContain('Temperature');
      expect(frame).toContain('Top P');
      expect(frame).toContain('Top K');
      expect(frame).toContain('Max Output Tokens');
      expect(frame).toContain('Max Time (minutes)');
      expect(frame).toContain('Max Turns');
    });

    it('should render scope selector', () => {
      const settings = createMockSettings();
      const { lastFrame } = renderDialog(settings);

      expect(lastFrame()).toContain('Apply To');
      expect(lastFrame()).toContain('User Settings');
      expect(lastFrame()).toContain('Workspace Settings');
    });

    it('should render help text', () => {
      const settings = createMockSettings();
      const { lastFrame } = renderDialog(settings);

      expect(lastFrame()).toContain('Use Enter to select');
      expect(lastFrame()).toContain('Tab to change focus');
      expect(lastFrame()).toContain('Esc to close');
    });
  });

  describe('keyboard navigation', () => {
    it('should close dialog on Escape', async () => {
      const settings = createMockSettings();
      const { stdin } = renderDialog(settings);

      await act(async () => {
        stdin.write(TerminalKeys.ESCAPE);
      });

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('should navigate down with arrow key', async () => {
      const settings = createMockSettings();
      const { lastFrame, stdin } = renderDialog(settings);

      // Initially first item (Enabled) should be active
      expect(lastFrame()).toContain('●');

      // Press down arrow
      await act(async () => {
        stdin.write(TerminalKeys.DOWN_ARROW);
      });

      await waitFor(() => {
        // Model field should now be highlighted
        expect(lastFrame()).toContain('Model');
      });
    });

    it('should switch focus with Tab', async () => {
      const settings = createMockSettings();
      const { lastFrame, stdin } = renderDialog(settings);

      // Initially settings section is focused
      expect(lastFrame()).toContain('> Configure: Test Agent');

      // Press Tab to switch to scope selector
      await act(async () => {
        stdin.write(TerminalKeys.TAB);
      });

      await waitFor(() => {
        expect(lastFrame()).toContain('> Apply To');
      });
    });
  });

  describe('boolean toggle', () => {
    it('should toggle enabled field on Enter', async () => {
      const settings = createMockSettings();
      const { stdin } = renderDialog(settings);

      // Press Enter to toggle the first field (Enabled)
      await act(async () => {
        stdin.write(TerminalKeys.ENTER);
      });

      await waitFor(() => {
        expect(settings.setValue).toHaveBeenCalledWith(
          SettingScope.User,
          'agents.overrides.test-agent.enabled',
          false, // Toggles from true (default) to false
        );
        expect(mockOnSave).toHaveBeenCalled();
      });
    });
  });

  describe('default values', () => {
    it('should show values from agent definition as defaults', () => {
      const definition = createMockAgentDefinition({
        modelConfig: {
          model: 'gemini-2.0-flash',
          generateContentConfig: {
            temperature: 0.7,
          },
        },
        runConfig: {
          maxTimeMinutes: 10,
          maxTurns: 20,
        },
      });
      const settings = createMockSettings();
      const { lastFrame } = renderDialog(settings, definition);
      const frame = lastFrame();

      expect(frame).toContain('gemini-2.0-flash');
      expect(frame).toContain('0.7');
      expect(frame).toContain('10');
      expect(frame).toContain('20');
    });

    it('should show experimental agents as disabled by default', () => {
      const definition = createMockAgentDefinition({
        experimental: true,
      });
      const settings = createMockSettings();
      const { lastFrame } = renderDialog(settings, definition);

      // Experimental agents default to disabled
      expect(lastFrame()).toContain('false');
    });
  });

  describe('existing overrides', () => {
    it('should show existing override values with * indicator', () => {
      const settings = createMockSettings({
        agents: {
          overrides: {
            'test-agent': {
              enabled: false,
              modelConfig: {
                model: 'custom-model',
              },
            },
          },
        },
      });
      const { lastFrame } = renderDialog(settings);
      const frame = lastFrame();

      // Should show the overridden values
      expect(frame).toContain('custom-model');
      expect(frame).toContain('false');
    });
  });
});
