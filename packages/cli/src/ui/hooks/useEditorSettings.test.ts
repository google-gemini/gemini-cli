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
import { renderHook } from '@testing-library/react';
import { useEditorSettings } from './useEditorSettings.js';
import type { LoadedSettings } from '../../config/settings.js';
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
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );

    expect(result.current.isEditorDialogOpen).toBe(false);
  });

  it('should open editor dialog when openEditorDialog is called', () => {
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );

    act(() => {
      result.current.openEditorDialog();
    });

    expect(result.current.isEditorDialogOpen).toBe(true);
  });

  it('should close editor dialog when exitEditorDialog is called', () => {
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );
    act(() => {
      result.current.openEditorDialog();
      result.current.exitEditorDialog();
    });
    expect(result.current.isEditorDialogOpen).toBe(false);
  });

  it('should handle editor selection successfully', () => {
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );

    const editorType: EditorType = 'vscode';
    const scope = SettingScope.User;

    act(() => {
      result.current.openEditorDialog();
      result.current.handleEditorSelect(editorType, scope);
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
    expect(result.current.isEditorDialogOpen).toBe(false);
  });

  it('should handle clearing editor preference (undefined editor)', () => {
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );

    const scope = SettingScope.Workspace;

    act(() => {
      result.current.openEditorDialog();
      result.current.handleEditorSelect(undefined, scope);
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
    expect(result.current.isEditorDialogOpen).toBe(false);
  });

  it('should handle different editor types', () => {
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );

    const editorTypes: EditorType[] = ['cursor', 'windsurf', 'vim'];
    const scope = SettingScope.User;

    editorTypes.forEach((editorType) => {
      act(() => {
        result.current.handleEditorSelect(editorType, scope);
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
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );

    const editorType: EditorType = 'vscode';
    const scopes = [SettingScope.User, SettingScope.Workspace];

    scopes.forEach((scope) => {
      act(() => {
        result.current.handleEditorSelect(editorType, scope);
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
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );

    mockCheckHasEditorType.mockReturnValue(false);

    const editorType: EditorType = 'vscode';
    const scope = SettingScope.User;

    act(() => {
      result.current.openEditorDialog();
      result.current.handleEditorSelect(editorType, scope);
    });

    expect(mockLoadedSettings.setValue).not.toHaveBeenCalled();
    expect(mockAddItem).not.toHaveBeenCalled();
    expect(result.current.isEditorDialogOpen).toBe(true);
  });

  it('should not set preference for editors not allowed in sandbox', () => {
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );

    mockAllowEditorTypeInSandbox.mockReturnValue(false);

    const editorType: EditorType = 'vscode';
    const scope = SettingScope.User;

    act(() => {
      result.current.openEditorDialog();
      result.current.handleEditorSelect(editorType, scope);
    });

    expect(mockLoadedSettings.setValue).not.toHaveBeenCalled();
    expect(mockAddItem).not.toHaveBeenCalled();
    expect(result.current.isEditorDialogOpen).toBe(true);
  });

  it('should handle errors during editor selection', () => {
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );

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
      result.current.openEditorDialog();
      result.current.handleEditorSelect(editorType, scope);
    });

    expect(mockSetEditorError).toHaveBeenCalledWith(
      `Failed to set editor preference: Error: ${errorMessage}`,
    );
    expect(mockAddItem).not.toHaveBeenCalled();
    expect(result.current.isEditorDialogOpen).toBe(true);
  });
});
