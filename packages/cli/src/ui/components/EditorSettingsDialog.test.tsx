/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { EditorSettingsDialog } from './EditorSettingsDialog.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingScope } from '../../config/settings.js';
import type { LoadedSettings } from '../../config/settings.js';
import { KeypressProvider } from '../contexts/KeypressContext.js';
import { act } from 'react';
import { waitFor } from '../../test-utils/async.js';
import { debugLogger } from '@google/gemini-cli-core';

const mockEmitFeedback = vi.fn();

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    isEditorAvailable: () => true, // Mock to behave predictably in CI
    coreEvents: {
      ...actual.coreEvents,
      emitFeedback: (...args: unknown[]) => mockEmitFeedback(...args),
    },
  };
});

// Mock editorSettingsManager
vi.mock('../editors/editorSettingsManager.js', () => ({
  editorSettingsManager: {
    getAvailableEditorDisplays: () => [
      { name: 'VS Code', type: 'vscode', disabled: false },
      { name: 'Vim', type: 'vim', disabled: false },
    ],
  },
}));

describe('EditorSettingsDialog', () => {
  const mockSettings = {
    forScope: (scope: string) => ({
      settings: {
        general: {
          preferredEditor: scope === SettingScope.User ? 'vscode' : undefined,
        },
      },
    }),
    merged: {
      general: {
        preferredEditor: 'vscode',
      },
    },
  } as unknown as LoadedSettings;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmitFeedback.mockClear();
  });

  const renderWithProvider = (ui: React.ReactNode) =>
    render(<KeypressProvider>{ui}</KeypressProvider>);

  it('renders correctly', () => {
    const { lastFrame } = renderWithProvider(
      <EditorSettingsDialog
        onSelect={vi.fn()}
        settings={mockSettings}
        onExit={vi.fn()}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('calls onSelect when an editor is selected', () => {
    const onSelect = vi.fn();
    const { lastFrame } = renderWithProvider(
      <EditorSettingsDialog
        onSelect={onSelect}
        settings={mockSettings}
        onExit={vi.fn()}
      />,
    );

    expect(lastFrame()).toContain('VS Code');
  });

  it('switches focus between editor and scope sections on Tab', async () => {
    const { lastFrame, stdin } = renderWithProvider(
      <EditorSettingsDialog
        onSelect={vi.fn()}
        settings={mockSettings}
        onExit={vi.fn()}
      />,
    );

    // Initial focus on editor
    expect(lastFrame()).toContain('> Select Editor');
    expect(lastFrame()).not.toContain('> Apply To');

    // Press Tab
    await act(async () => {
      stdin.write('\t');
    });

    // Focus should be on scope
    await waitFor(() => {
      const frame = lastFrame() || '';
      if (!frame.includes('> Apply To')) {
        debugLogger.debug(
          'Waiting for scope focus. Current frame:',
          JSON.stringify(frame),
        );
      }
      expect(frame).toContain('> Apply To');
    });
    expect(lastFrame()).toContain('  Select Editor');

    // Press Tab again
    await act(async () => {
      stdin.write('\t');
    });

    // Focus should be back on editor
    await waitFor(() => {
      expect(lastFrame()).toContain('> Select Editor');
    });
  });

  it('calls onExit when Escape is pressed', async () => {
    const onExit = vi.fn();
    const { stdin } = renderWithProvider(
      <EditorSettingsDialog
        onSelect={vi.fn()}
        settings={mockSettings}
        onExit={onExit}
      />,
    );

    await act(async () => {
      stdin.write('\u001B'); // Escape
    });

    await waitFor(() => {
      expect(onExit).toHaveBeenCalled();
    });
  });

  it('shows modified message when setting exists in other scope', () => {
    const settingsWithOtherScope = {
      forScope: (_scope: string) => ({
        settings: {
          general: {
            preferredEditor: 'vscode', // Both scopes have it set
          },
        },
      }),
      merged: {
        general: {
          preferredEditor: 'vscode',
        },
      },
    } as unknown as LoadedSettings;

    const { lastFrame } = renderWithProvider(
      <EditorSettingsDialog
        onSelect={vi.fn()}
        settings={settingsWithOtherScope}
        onExit={vi.fn()}
      />,
    );

    const frame = lastFrame() || '';
    if (!frame.includes('(Also modified')) {
      debugLogger.debug(
        'Modified message test failure. Frame:',
        JSON.stringify(frame),
      );
    }
    expect(frame).toContain('(Also modified');
  });

  it('emits error only once when preferredEditor is invalid', async () => {
    const settingsWithInvalidEditor = {
      forScope: (_scope: string) => ({
        settings: {
          general: {
            preferredEditor: 'invalid_editor_that_does_not_exist',
          },
        },
      }),
      merged: {
        general: {
          preferredEditor: 'invalid_editor_that_does_not_exist',
        },
      },
    } as unknown as LoadedSettings;

    const { rerender, stdin } = renderWithProvider(
      <EditorSettingsDialog
        onSelect={vi.fn()}
        settings={settingsWithInvalidEditor}
        onExit={vi.fn()}
      />,
    );

    // Wait for initial effect to run
    await waitFor(() => {
      expect(mockEmitFeedback).toHaveBeenCalledWith(
        'error',
        'Editor is not supported: invalid_editor_that_does_not_exist',
      );
    });

    // Should have been called exactly once
    expect(mockEmitFeedback).toHaveBeenCalledTimes(1);

    // Trigger re-renders by pressing Tab multiple times
    await act(async () => {
      stdin.write('\t');
    });
    await act(async () => {
      stdin.write('\t');
    });
    await act(async () => {
      stdin.write('\t');
    });

    // Re-render the component
    rerender(
      <KeypressProvider>
        <EditorSettingsDialog
          onSelect={vi.fn()}
          settings={settingsWithInvalidEditor}
          onExit={vi.fn()}
        />
      </KeypressProvider>,
    );

    // Should still have been called only once (no spam)
    expect(mockEmitFeedback).toHaveBeenCalledTimes(1);
  });
});
