/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiffEditor, type DiffOnMount } from '@monaco-editor/react';
import * as React from 'react';
import { getLanguageForFilePath } from '../../utils/language.js';
import { useTheme } from '../../contexts/ThemeContext.js';
import './GeminiEditor.css';

interface GeminiEditorProps {
  open: boolean;
  filePath: string;
  oldContent: string;
  newContent: string;
  onClose: (
    result: { status: 'approve'; content: string } | { status: 'reject' },
  ) => void;
}

function isColorLight(hexColor: string) {
  if (!hexColor.startsWith('#')) {
    return false; // Default to dark theme for non-hex colors
  }
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155;
}

export function GeminiEditor({
  open,
  filePath,
  oldContent,
  newContent,
  onClose,
}: GeminiEditorProps) {
  const [modifiedContent, setModifiedContent] = React.useState(newContent);
  const [language, setLanguage] = React.useState('plaintext');
  const theme = useTheme();
  const isModified = modifiedContent !== newContent;

  React.useEffect(() => {
    setModifiedContent(newContent);
  }, [newContent]);

  React.useEffect(() => {
    if (open) {
      getLanguageForFilePath(filePath).then(setLanguage);
    }
  }, [open, filePath]);

  const handleClose = () => {
    if (isModified) {
      onClose({ status: 'approve', content: modifiedContent });
    } else {
      onClose({ status: 'reject' });
    }
  };

  const handleEditorMount: DiffOnMount = (editor) => {
    const modifiedEditor = editor.getModifiedEditor();
    const disposable = modifiedEditor.onDidChangeModelContent(() => {
      const value = modifiedEditor.getValue();
      setModifiedContent(value);
    });

    return () => {
      disposable.dispose();
    };
  };

  if (!open) {
    return null;
  }

  const fileName = filePath.split('/').pop();
  const editorTheme = isColorLight(theme.background) ? 'vs-light' : 'vs-dark';

  const modalStyles = {
    '--modal-bg': theme.background,
    '--modal-fg': theme.foreground,
    '--border-color': theme.selectionBackground,
  } as React.CSSProperties;

  const buttonStyles = {
    '--button-bg': isModified ? theme.blue : theme.background,
  } as React.CSSProperties;

  return (
    <div className="gemini-editor-overlay">
      <div className="gemini-editor-modal" style={modalStyles}>
        <h3 className="gemini-editor-header">Gemini Editor: {fileName}</h3>
        <div className="gemini-editor-container">
          <div className="gemini-editor-wrapper">
            <DiffEditor
              original={oldContent}
              modified={modifiedContent}
              language={language}
              onMount={handleEditorMount}
              theme={editorTheme}
              options={{
                readOnly: false,
                originalEditable: false,
              }}
            />
          </div>
        </div>
        <div className="gemini-editor-footer">
          <button
            className="gemini-editor-button"
            style={buttonStyles}
            onClick={handleClose}
          >
            {isModified ? 'Save' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
