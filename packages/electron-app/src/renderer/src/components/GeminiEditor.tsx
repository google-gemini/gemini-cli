/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiffEditor, type DiffOnMount } from '@monaco-editor/react';
import * as React from 'react';
import { getLanguageForFilePath } from '../utils/language.js';
import { useTheme } from '../contexts/ThemeContext.js';

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

  const buttonStyle: React.CSSProperties = {
    padding: '0.5rem 1rem',
    border: '1px solid',
    borderColor: theme.selectionBackground,
    borderRadius: '4px',
    cursor: 'pointer',
    color: theme.foreground,
    backgroundColor: theme.background,
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '90%',
          width: '90%',
          backgroundColor: theme.background,
          color: theme.foreground,
          borderRadius: '8px',
          padding: '1rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <h3 style={{ flexShrink: 0, margin: '0 0 1rem 0' }}>
          Gemini Editor: {fileName}
        </h3>
        <div
          style={{
            flexGrow: 1,
            position: 'relative',
            border: `1px solid ${theme.selectionBackground}`,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          >
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
        <div
          style={{
            flexShrink: 0,
            paddingTop: '1rem',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '1rem',
          }}
        >
          <button
            style={{
              ...buttonStyle,
              backgroundColor: isModified ? theme.blue : theme.background,
            }}
            onClick={handleClose}
          >
            {isModified ? 'Save' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
