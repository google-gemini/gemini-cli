/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from 'vitest';
import { act } from 'react';
import { render } from '../../test-utils/render.js';
import { useEditorSettings } from './useEditorSettings.js';
import type {
  LoadableSettingScope,
  LoadedSettings,
} from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import { MessageType, type HistoryItem } from '../types.js';
import {
  type EditorType,
  checkHasEditorType,
  allowEditorTypeInSandbox,
} from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    checkHasEditorType: vi.fn(() => true),
    allowEditorTypeInSandbox: vi.fn(() => true),
  };
});

const mockCheckHasEditorType = vi.mocked(checkHasEditorType);
const mockAllowEditorTypeInSandbox = vi.mocked(allowEditorTypeInSandbox);

describe('useEditorSettings', () => {
  let mockLoadedSettings: LoadedSettings;
  let mockSetEditorError: MockedFunction<(error: string | null) => void>;
  let mockAddItem: MockedFunction<
    (item: Omit<HistoryItem, 'id'>, timestamp: number) => void
  >;
  let result: ReturnType<typeof useEditorSettings>;

  function TestComponent() {
    result = useEditorSettings(
      mockLoadedSettings,
      mockSetEditorError,
      mockAddItem,
    );
    return null;
  }

  beforeEach(() => {
    vi.resetAllMocks();

    mockLoadedSettings = {
      setValue: vi.fn(),
    } as unknown as LoadedSettings;

    mockSetEditorError = vi.fn();
    mockAddItem = vi.fn();

    // Reset mock implementations to default
    mockCheckHasEditorType.mockReturnValue(true);
    mockAllowEditorTypeInSandbox.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with dialog closed', () => {
    render(<TestComponent />);

    expect(result.isEditorDialogOpen).toBe(false);
  });

  it('should open editor dialog when openEditorDialog is called', () => {
    render(<TestComponent />);

    act(() => {
      result.openEditorDialog();
    });

    expect(result.isEditorDialogOpen).toBe(true);
  });

  it('should close editor dialog when exitEditorDialog is called', () => {
    render(<TestComponent />);
    act(() => {
      result.openEditorDialog();
      result.exitEditorDialog();
    });
    expect(result.isEditorDialogOpen).toBe(false);
  });

  it('should handle editor selection successfully', () => {
    render(<TestComponent />);

    const editorType: EditorType = 'vscode';
    const scope = SettingScope.User;

    act(() => {
      result.openEditorDialog();
      result.handleEditorSelect(editorType, scope);
    });

    expect(mockLoadedSettings.setValue).toHaveBeenCalledWith(
      scope,
      'preferredEditor',
      editorType,
    );

    expect(mockAddItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text: 'Editor preference set to "vscode" in User settings.',
      },
      expect.any(Number),
    );

    expect(mockSetEditorError).toHaveBeenCalledWith(null);
    expect(result.isEditorDialogOpen).toBe(false);
  });

  it('should handle clearing editor preference (undefined editor)', () => {
    render(<TestComponent />);

    const scope = SettingScope.Workspace;

    act(() => {
      result.openEditorDialog();
      result.handleEditorSelect(undefined, scope);
    });

    expect(mockLoadedSettings.setValue).toHaveBeenCalledWith(
      scope,
      'preferredEditor',
      undefined,
    );

    expect(mockAddItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text: 'Editor preference cleared in Workspace settings.',
      },
      expect.any(Number),
    );

    expect(mockSetEditorError).toHaveBeenCalledWith(null);
    expect(result.isEditorDialogOpen).toBe(false);
  });

  it('should handle different editor types', () => {
    render(<TestComponent />);

    const editorTypes: EditorType[] = ['cursor', 'windsurf', 'vim'];
    const scope = SettingScope.User;

    editorTypes.forEach((editorType) => {
      act(() => {
        result.handleEditorSelect(editorType, scope);
      });

      expect(mockLoadedSettings.setValue).toHaveBeenCalledWith(
        scope,
        'preferredEditor',
        editorType,
      );

      expect(mockAddItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: `Editor preference set to "${editorType}" in User settings.`,
        },
        expect.any(Number),
      );
    });
  });

  it('should handle different setting scopes', () => {
    render(<TestComponent />);

    const editorType: EditorType = 'vscode';
    const scopes: LoadableSettingScope[] = [
      SettingScope.User,
      SettingScope.Workspace,
    ];

    scopes.forEach((scope) => {
      act(() => {
        result.handleEditorSelect(editorType, scope);
      });

      expect(mockLoadedSettings.setValue).toHaveBeenCalledWith(
        scope,
        'preferredEditor',
        editorType,
      );

      expect(mockAddItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: `Editor preference set to "vscode" in ${scope} settings.`,
        },
        expect.any(Number),
      );
    });
  });

  it('should not set preference for unavailable editors', () => {
    render(<TestComponent />);

    mockCheckHasEditorType.mockReturnValue(false);

    const editorType: EditorType = 'vscode';
    const scope = SettingScope.User;

    act(() => {
      result.openEditorDialog();
      result.handleEditorSelect(editorType, scope);
    });

    expect(mockLoadedSettings.setValue).not.toHaveBeenCalled();
    expect(mockAddItem).not.toHaveBeenCalled();
    expect(result.isEditorDialogOpen).toBe(true);
  });

  it('should not set preference for editors not allowed in sandbox', () => {
    render(<TestComponent />);

    mockAllowEditorTypeInSandbox.mockReturnValue(false);

    const editorType: EditorType = 'vscode';
    const scope = SettingScope.User;

    act(() => {
      result.openEditorDialog();
      result.handleEditorSelect(editorType, scope);
    });

    expect(mockLoadedSettings.setValue).not.toHaveBeenCalled();
    expect(mockAddItem).not.toHaveBeenCalled();
    expect(result.isEditorDialogOpen).toBe(true);
  });

  it('should handle errors during editor selection', () => {
    render(<TestComponent />);

    const errorMessage = 'Failed to save settings';
    (
      mockLoadedSettings.setValue as MockedFunction<
        typeof mockLoadedSettings.setValue
      >
    ).mockImplementation(() => {
      throw new Error(errorMessage);
    });

    const editorType: EditorType = 'vscode';
    const scope = SettingScope.User;

    act(() => {
      result.openEditorDialog();
      result.handleEditorSelect(editorType, scope);
    });

    expect(mockSetEditorError).toHaveBeenCalledWith(
      `Failed to set editor preference: Error: ${errorMessage}`,
    );
    expect(mockAddItem).not.toHaveBeenCalled();
    expect(result.isEditorDialogOpen).toBe(true);
  });
});
