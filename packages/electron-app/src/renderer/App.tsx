/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, Suspense, useRef } from 'react';
import { Settings } from 'lucide-react';
import { SettingsModal } from './components/Settings/SettingsModal';
import { GeminiEditor } from './components/Editor/GeminiEditor';
import { Terminal, type TerminalRef } from './components/Terminal/Terminal';
import { ThemeContext } from './contexts/ThemeContext';
import { isCliTheme } from './utils/theme';
import './App.css';

interface GeminiEditorState {
  open: boolean;
  filePath: string;
  oldContent: string;
  newContent: string;
  diffPath: string;
}

const darkTheme = {
  background: '#282a36',
  foreground: '#f8f8f2',
  cursor: '#f8f8f2',
  selectionBackground: '#44475a',
  black: '#000000',
  red: '#ff5555',
  green: '#50fa7b',
  yellow: '#f1fa8c',
  blue: '#bd93f9',
  magenta: '#ff79c6',
  cyan: '#8be9fd',
  white: '#bfbfbf',
  brightBlack: '#4d4d4d',
  brightRed: '#ff6e67',
  brightGreen: '#5af78e',
  brightYellow: '#f4f99d',
  brightBlue: '#caa9fa',
  brightMagenta: '#ff92d0',
  brightCyan: '#9aedfe',
  brightWhite: '#e6e6e6',
};

function App() {
  const [cliTheme, setCliTheme] = useState(darkTheme);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const terminalRef = useRef<TerminalRef>(null);
  const [editorState, setEditorState] = useState<GeminiEditorState>({
    open: false,
    filePath: '',
    oldContent: '',
    newContent: '',
    diffPath: '',
  });

  useEffect(() => {
    const removeListener = window.electron.onShowGeminiEditor(
      (_event, data) => {
        setEditorState({
          open: true,
          filePath: data.meta.filePath,
          oldContent: data.oldContent,
          newContent: data.newContent,
          diffPath: data.diffPath,
        });
      },
    );
    return () => {
      removeListener();
    };
  }, []);

  useEffect(() => {
    const removeListener = window.electron.theme.onInit(
      (_event, receivedTheme) => {
        console.log('Received theme from main process:', receivedTheme);
        if (isCliTheme(receivedTheme)) {
          // It's a CLI theme object, convert it to an xterm.js theme object
          const colors = receivedTheme.colors;
          const xtermTheme = {
            background: colors.Background,
            foreground: colors.Foreground,
            cursor: colors.Foreground,
            selectionBackground: '#44475a',
            black: '#000000',
            red: colors.AccentRed,
            green: colors.AccentGreen,
            yellow: colors.AccentYellow,
            blue: colors.AccentBlue,
            magenta: colors.AccentPurple,
            cyan: colors.AccentCyan,
            white: '#bfbfbf',
            brightBlack: '#4d4d4d',
            brightRed: colors.AccentRed,
            brightGreen: colors.AccentGreen,
            brightYellow: colors.AccentYellow,
            brightBlue: colors.AccentBlue,
            brightMagenta: colors.AccentPurple,
            brightCyan: colors.AccentCyan,
            brightWhite: '#e6e6e6',
          };
          setCliTheme(xtermTheme);
        } else if (receivedTheme.background) {
          setCliTheme({ ...darkTheme, ...receivedTheme });
        }
      },
    );

    return () => {
      removeListener();
    };
  }, []);

  const themeStyles = {
    '--bg-color': cliTheme.background,
    '--fg-color': cliTheme.foreground,
    '--border-color': cliTheme.selectionBackground || '#44475a',
  } as React.CSSProperties;

  return (
    <ThemeContext.Provider value={cliTheme}>
      <div className="app-container" style={themeStyles}>
        <div className="title-bar">
          <span className="title-bar-text">Gemini CLI</span>
          <div className="title-bar-controls">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="icon-button"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
        <Terminal ref={terminalRef} />
        {isSettingsOpen && (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => {
              setIsSettingsOpen(false);
              setTimeout(() => terminalRef.current?.focus(), 50);
            }}
          />
        )}
        {editorState.open && (
          <Suspense fallback={<div>Loading...</div>}>
            <GeminiEditor
              open={editorState.open}
              filePath={editorState.filePath}
              oldContent={editorState.oldContent}
              newContent={editorState.newContent}
              onClose={async (result) => {
                try {
                  const response = await window.electron.resolveDiff({
                    ...result,
                    diffPath: editorState.diffPath,
                  });
                  console.log('resolveDiff response:', response);
                } catch (error) {
                  console.error('Failed to resolve diff:', error);
                }
                setEditorState({ ...editorState, open: false });
              }}
            />
          </Suspense>
        )}
      </div>
    </ThemeContext.Provider>
  );
}

export default App;
