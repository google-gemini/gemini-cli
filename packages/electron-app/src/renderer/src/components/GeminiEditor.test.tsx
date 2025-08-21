/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as React from 'react';
import { GeminiEditor } from './GeminiEditor';
import * as ThemeContext from '../contexts/ThemeContext';
import * as languageUtils from '../utils/language';

// Mock dependencies
vi.mock('@monaco-editor/react', () => ({
  DiffEditor: vi.fn((props) => {
    const { onMount, modified } = props as {
      modified: string;
      onMount: (editor: {
        getModifiedEditor: () => {
          onDidChangeModelContent: (callback: () => void) => {
            dispose: () => void;
          };
          getValue: () => string;
        };
      }) => void;
    };
    // Mock the editor's onMount callback to simulate content change
    React.useEffect(() => {
      const mockEditor = {
        getModifiedEditor: () => ({
          onDidChangeModelContent: (callback: () => void) => {
            // Store the callback to be called later
            (window as CustomWindow).monacoChangeCallback = callback;
            return { dispose: vi.fn() };
          },
          getValue: () => (window as CustomWindow).mockModifiedContent,
        }),
      };
      onMount(mockEditor);
    }, [onMount]);

    return (
      <div data-testid="mock-diff-editor">
        <textarea
          data-testid="mock-modified-content"
          value={modified}
          onChange={(e) => {
            (window as CustomWindow).mockModifiedContent = e.target.value;
            if ((window as CustomWindow).monacoChangeCallback) {
              (window as CustomWindow).monacoChangeCallback();
            }
          }}
        />
      </div>
    );
  }),
}));

vi.mock('../utils/language');
vi.mock('../contexts/ThemeContext');

interface CustomWindow extends Window {
  monacoChangeCallback: (() => void) | null;
  mockModifiedContent: string;
}

const mockTheme = {
  background: '#282c34',
  foreground: '#abb2bf',
  selectionBackground: '#3e4451',
  blue: '#61afef',
};

const mockLightTheme = {
  background: '#ffffff',
  foreground: '#000000',
  selectionBackground: '#e0e0e0',
  blue: '#0000ff',
};

describe('GeminiEditor', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    (ThemeContext.useTheme as vi.Mock).mockReturnValue(mockTheme);
    (languageUtils.getLanguageForFilePath as vi.Mock).mockReturnValue(
      'javascript',
    );
    (window as CustomWindow).monacoChangeCallback = null;
    (window as CustomWindow).mockModifiedContent = '';
  });

  const defaultProps = {
    open: true,
    filePath: '/path/to/test.js',
    oldContent: 'const a = 1;',
    newContent: 'const a = 2;',
    onClose: mockOnClose,
  };

  it('should not render if open is false', () => {
    render(<GeminiEditor {...defaultProps} open={false} />);
    expect(
      screen.queryByText('Gemini Editor: test.js'),
    ).not.toBeInTheDocument();
  });

  it('should render correctly when open is true', () => {
    render(<GeminiEditor {...defaultProps} />);
    expect(screen.getByText('Gemini Editor: test.js')).toBeInTheDocument();
    expect(screen.getByTestId('mock-diff-editor')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('should call onClose with "reject" when "Close" is clicked without changes', () => {
    render(<GeminiEditor {...defaultProps} />);
    const closeButton = screen.getByText('Close');
    fireEvent.click(closeButton);
    expect(mockOnClose).toHaveBeenCalledWith({ status: 'reject' });
  });

  it('should update button to "Save" and call onClose with "approve" on change', () => {
    render(<GeminiEditor {...defaultProps} />);

    // Initial state
    expect(screen.getByText('Close')).toBeInTheDocument();

    // Simulate editor content change
    const modifiedContentTextarea = screen.getByTestId('mock-modified-content');
    fireEvent.change(modifiedContentTextarea, {
      target: { value: 'const a = 3;' },
    });

    // Button text should change to "Save"
    const saveButton = screen.getByText('Save');
    expect(saveButton).toBeInTheDocument();

    // Click "Save"
    fireEvent.click(saveButton);
    expect(mockOnClose).toHaveBeenCalledWith({
      status: 'approve',
      content: 'const a = 3;',
    });
  });

  it('should use vs-dark theme for dark backgrounds', async () => {
    (ThemeContext.useTheme as vi.Mock).mockReturnValue(mockTheme);
    const { rerender } = render(<GeminiEditor {...defaultProps} />);
    const editor = vi.mocked((await import('@monaco-editor/react')).DiffEditor);
    expect(editor).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: 'vs-dark',
      }),
      undefined,
    );

    // Test with a non-hex color, should default to dark
    (ThemeContext.useTheme as vi.Mock).mockReturnValue({
      ...mockTheme,
      background: 'rgb(40, 44, 52)',
    });
    rerender(<GeminiEditor {...defaultProps} />);
    expect(editor).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: 'vs-dark',
      }),
      undefined,
    );
  });

  it('should use vs-light theme for light backgrounds', async () => {
    (ThemeContext.useTheme as vi.Mock).mockReturnValue(mockLightTheme);
    render(<GeminiEditor {...defaultProps} />);
    const editor = vi.mocked((await import('@monaco-editor/react')).DiffEditor);
    expect(editor).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: 'vs-light',
      }),
      undefined,
    );
  });

  it('should get the correct language for the file path', async () => {
    (languageUtils.getLanguageForFilePath as vi.Mock).mockReturnValue('python');
    render(<GeminiEditor {...defaultProps} filePath="/path/to/script.py" />);
    const editor = vi.mocked((await import('@monaco-editor/react')).DiffEditor);
    expect(languageUtils.getLanguageForFilePath).toHaveBeenCalledWith(
      '/path/to/script.py',
    );
    expect(editor).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'python',
      }),
      undefined,
    );
  });

  it('should update modified content when newContent prop changes', () => {
    const { rerender } = render(<GeminiEditor {...defaultProps} />);
    const modifiedContentTextarea = screen.getByTestId(
      'mock-modified-content',
    ) as HTMLTextAreaElement;
    expect(modifiedContentTextarea.value).toBe('const a = 2;');

    rerender(<GeminiEditor {...defaultProps} newContent="const a = 100;" />);
    expect(modifiedContentTextarea.value).toBe('const a = 100;');
  });
});
