/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, Suspense } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from 'xterm-addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Settings } from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';
import { GeminiEditor } from './components/GeminiEditor';

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

function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  timeout = 100,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, timeout);
  };
}

import { ThemeContext } from './contexts/ThemeContext';

function App() {
  const termRef = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal>();
  const [cliTheme, setCliTheme] = useState(darkTheme);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editorState, setEditorState] = useState<GeminiEditorState>({
    open: false,
    filePath: '',
    oldContent: '',
    newContent: '',
    diffPath: '',
  });
  const isResetting = useRef(false);

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
      (_event, receivedTheme: Record<string, Record<string, string>>) => {
        console.log('Received theme from main process:', receivedTheme);
        if (receivedTheme.colors) {
          // It's a CLI theme object, convert it to an xterm.js theme object
          const xtermTheme = {
            background: receivedTheme.colors.Background,
            foreground: receivedTheme.colors.Foreground,
            cursor: receivedTheme.colors.Foreground,
            selectionBackground: '#44475a', // A default, might need improvement
            black: '#000000',
            red: receivedTheme.colors.AccentRed,
            green: receivedTheme.colors.AccentGreen,
            yellow: receivedTheme.colors.AccentYellow,
            blue: receivedTheme.colors.AccentBlue,
            magenta: receivedTheme.colors.AccentPurple,
            cyan: receivedTheme.colors.AccentCyan,
            white: '#bfbfbf', // A default
            brightBlack: '#4d4d4d', // A default
            brightRed: receivedTheme.colors.AccentRed,
            brightGreen: receivedTheme.colors.AccentGreen,
            brightYellow: receivedTheme.colors.AccentYellow,
            brightBlue: receivedTheme.colors.AccentBlue,
            brightMagenta: receivedTheme.colors.AccentPurple,
            brightCyan: receivedTheme.colors.AccentCyan,
            brightWhite: '#e6e6e6', // A default
          };
          setCliTheme(xtermTheme);
        } else if (receivedTheme.background) {
          // It's already an xterm.js-like theme
          setCliTheme(receivedTheme);
        }
      },
    );

    return () => {
      removeListener();
    };
  }, []);

  useEffect(() => {
    if (termRef.current && !term.current) {
      const fitAddon = new FitAddon();
      term.current = new Terminal({
        fontFamily:
          'Menlo, "DejaVu Sans Mono", Consolas, "Lucida Console", monospace',
        fontSize: 14,
        cursorBlink: true,
        allowTransparency: true,
      });
      term.current.loadAddon(fitAddon);
      term.current.open(termRef.current);

      const onResize = () => {
        try {
          const geometry = fitAddon.proposeDimensions();
          if (geometry && geometry.cols > 0 && geometry.rows > 0) {
            window.electron.terminal.resize({
              cols: geometry.cols,
              rows: geometry.rows,
            });
          }
          fitAddon.fit();
        } catch {
          // Ignore resize errors
        }
      };

      const debouncedResize = debounce(onResize, 50);

      // Initial resize with a small delay to allow layout to settle
      setTimeout(() => onResize(), 100);

      const dataListener = window.electron.terminal.onData((_event, data) => {
        if (isResetting.current) {
          term.current?.clear();
          isResetting.current = false;
        }
        term.current?.write(data);
      });

      term.current.onKey(({ key, domEvent: event }) => {
        if (event.key === 'Enter' && event.shiftKey) {
          // For shift-enter, we want to insert a newline. We send a line feed `\n`.
          // The CLI should interpret this as a newline character within the input,
          // not as a command submission. The pty will echo the character back
          // to us, which will then render it in the terminal.
          window.electron.terminal.sendKey('\n');
        } else {
          // For all other keys, including Enter without Shift, send the key as is.
          // When Enter is pressed, `key` will be `\r`, which signals submission.
          window.electron.terminal.sendKey(key);
        }
      });

      const removeResetListener = window.electron.terminal.onReset(() => {
        term.current?.clear();
        term.current?.write('Settings updated. Restarting CLI...\r\n');
        isResetting.current = true;
      });

      const resizeObserver = new ResizeObserver(debouncedResize);
      resizeObserver.observe(termRef.current);
      window.addEventListener('focus', onResize);

      const removeMainWindowResizeListener =
        window.electron.onMainWindowResize(onResize);

      return () => {
        resizeObserver.disconnect();
        window.removeEventListener('focus', onResize);
        removeResetListener();
        removeMainWindowResizeListener();
        dataListener();
      };
    }
  }, []);

  useEffect(() => {
    if (term.current) {
      term.current.options.theme = cliTheme;
    }
  }, [cliTheme]);

  return (
    <ThemeContext.Provider value={cliTheme}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          position: 'fixed',
          backgroundColor: cliTheme.background,
        }}
      >
        <div
          style={{
            height: '30px',
            backgroundColor: cliTheme.background,
            color: cliTheme.foreground,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '12px',
            // @ts-expect-error -webkit-app-region is a valid property in Electron
            '-webkit-app-region': 'drag',
            flexShrink: 0,
            position: 'relative',
            userSelect: 'none',
            borderBottom: `1px solid ${cliTheme.selectionBackground || '#44475a'}`,
          }}
        >
          <span style={{ flex: 1, textAlign: 'center' }}>Gemini CLI</span>
          <div
            style={{
              position: 'absolute',
              right: '10px',
              top: '5px',
              display: 'flex',
              gap: '10px',
              WebkitAppRegion: 'no-drag',
            }}
          >
            <button
              onClick={() => setIsSettingsOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'inherit',
              }}
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
        <div
          ref={termRef}
          style={{
            width: '100%',
            flex: 1,
            padding: '0 10px 10px 10px',
            boxSizing: 'border-box',
          }}
        />
        {isSettingsOpen && (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
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
                const response = await window.electron.resolveDiff({
                  ...result,
                  diffPath: editorState.diffPath,
                });
                console.log('resolveDiff response:', response);
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
