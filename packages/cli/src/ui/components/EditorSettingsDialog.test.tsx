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

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    isEditorAvailable: () => true, // Mock to behave predictably in CI
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
  });

  const renderWithProvider = (ui: React.ReactNode) =>
    render(<KeypressProvider>{ui}</KeypressProvider>);

  it('renders correctly', async () => {
    const { lastFrame, waitUntilReady } = renderWithProvider(
      <EditorSettingsDialog
        onSelect={vi.fn()}
        settings={mockSettings}
        onExit={vi.fn()}
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('calls onSelect when an editor is selected', async () => {
    const onSelect = vi.fn();
    const { lastFrame, waitUntilReady } = renderWithProvider(
      <EditorSettingsDialog
        onSelect={onSelect}
        settings={mockSettings}
        onExit={vi.fn()}
      />,
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('VS Code');
  });

  it('switches focus between editor and scope sections on Tab', async () => {
    const { lastFrame, stdin, waitUntilReady } = renderWithProvider(
      <EditorSettingsDialog
        onSelect={vi.fn()}
        settings={mockSettings}
        onExit={vi.fn()}
      />,
    );
    await waitUntilReady();

    // Initial focus on editor
    expect(lastFrame()).toContain('> Select Editor');
    expect(lastFrame()).not.toContain('> Apply To');

    // Press Tab
    await act(async () => {
      stdin.write('\t');
    });
    await waitUntilReady();

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
    await waitUntilReady();

    // Focus should be back on editor
    await waitFor(() => {
      expect(lastFrame()).toContain('> Select Editor');
    });
  });

  it('calls onExit when Escape is pressed', async () => {
    const onExit = vi.fn();
    const { stdin, waitUntilReady } = renderWithProvider(
      <EditorSettingsDialog
        onSelect={vi.fn()}
        settings={mockSettings}
        onExit={onExit}
      />,
    );
    await waitUntilReady();

    await act(async () => {
      stdin.write('\u001B'); // Escape
    });
    await waitUntilReady();

    await waitFor(() => {
      expect(onExit).toHaveBeenCalled();
    });
  });

  it('shows modified message when setting exists in other scope', async () => {
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

    const { lastFrame, waitUntilReady } = renderWithProvider(
      <EditorSettingsDialog
        onSelect={vi.fn()}
        settings={settingsWithOtherScope}
        onExit={vi.fn()}
      />,
    );
    await waitUntilReady();

    const frame = lastFrame() || '';
    if (!frame.includes('(Also modified')) {
      debugLogger.debug(
        'Modified message test failure. Frame:',
        JSON.stringify(frame),
      );
    }
    expect(frame).toContain('(Also modified');
  });
});
