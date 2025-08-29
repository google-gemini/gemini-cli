/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join, extname } from 'node:path';
import * as pty from 'node-pty';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import process from 'node:process';
import Store from 'electron-store';
import type { Settings } from '@google/gemini-cli/dist/src/config/settings.js';

const store = new Store();

// It's good practice to handle uncaught exceptions, especially in production.
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  dialog.showErrorBox(
    'An Uncaught Exception Occurred',
    error.message || 'Unknown error',
  );
  app.quit();
});

const iconPath = join(__dirname, '..', '..', 'src', 'resources', 'icon.png');
let ptyProcess: pty.IPty | null = null;
let ptyOnDataDisposable: pty.IDisposable | null = null;
let fileWatcher: fs.FSWatcher | null = null;

// Define a more specific type for custom themes.
interface CustomTheme {
  type: 'custom';
  name: string;
  [key: string]: string;
}

interface CliSettings {
  terminalCwd?: string;
  env?: string | Record<string, string>;
  theme?: string;
  customThemes?: Record<string, CustomTheme>;
  mcpServers?: unknown;
  [key: string]: unknown;
}

async function setupFileWatcher(mainWindow: BrowserWindow) {
  const diffDir = join(os.homedir(), '.gemini', 'tmp', 'diff');
  try {
    await fs.promises.mkdir(diffDir, { recursive: true });
  } catch (e) {
    console.error('Error creating diff directory:', e);
    return;
  }

  if (fileWatcher) {
    fileWatcher.close();
  }

  fileWatcher = fs.watch(diffDir, async (eventType, filename) => {
    if (eventType !== 'rename' || !filename) {
      return;
    }

    const fullPath = join(diffDir, filename);
    const responsePath = join(fullPath, 'response.json');

    try {
      const stats = await fs.promises.stat(fullPath);
      const responseExists = await fs.promises
        .access(responsePath)
        .then(() => true)
        .catch(() => false);

      if (stats.isDirectory() && !responseExists) {
        // Add a small delay to ensure all files are written by the CLI.
        await new Promise((resolve) => setTimeout(resolve, 100));

        const metaPath = join(fullPath, 'meta.json');
        const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8'));
        const fileType = extname(meta.filePath);

        const oldPath = join(fullPath, `old${fileType}`);
        const newPath = join(fullPath, `new${fileType}`);

        const oldContent = await fs.promises.readFile(oldPath, 'utf-8');
        const newContent = await fs.promises.readFile(newPath, 'utf-8');

        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('gemini-editor:show', {
            diffPath: fullPath,
            oldContent,
            newContent,
            meta,
          });
        }
      }
    } catch (_e) {
      // Ignore errors (e.g., file not found if deleted quickly).
    }
  });
}

async function getTerminalCwd() {
  const { loadSettings } = await import(
    '@google/gemini-cli/dist/src/config/settings.js'
  );
  const { merged } = await loadSettings(os.homedir());
  const settings = merged as CliSettings;
  if (settings.terminalCwd && typeof settings.terminalCwd === 'string') {
    return settings.terminalCwd;
  }
  return join(os.homedir(), 'Documents');
}

async function startPtyProcess(mainWindow: BrowserWindow) {
  if (ptyOnDataDisposable) {
    ptyOnDataDisposable.dispose();
    ptyOnDataDisposable = null;
  }

  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }

  mainWindow.webContents.send('terminal.reset');
  const sessionId = crypto.randomUUID();
  setupFileWatcher(mainWindow);

  const cliPath = join(__dirname, '..', '..', '..', 'cli', 'dist', 'index.js');

  console.log(`[PTY] Starting PTY process with CLI path: ${cliPath}`);

  if (!fs.existsSync(cliPath)) {
    const errorMsg = `[PTY] CLI path not found: ${cliPath}`;
    console.error(errorMsg);
    dialog.showErrorBox('Fatal Error', errorMsg);
    return;
  }

  const terminalCwd = await getTerminalCwd();

  const { loadSettings } = await import(
    '@google/gemini-cli/dist/src/config/settings.js'
  );
  const { merged } = await loadSettings(os.homedir());
  const settings = merged as CliSettings;

  const env: Record<string, string> = {};
  if (typeof settings.env === 'string') {
    for (const line of settings.env.split('\n')) {
      const parts = line.split('=');
      const key = parts.shift();
      const value = parts.join('=');
      if (key) {
        env[key] = value;
      }
    }
  }

  try {
    ptyProcess = pty.spawn(process.execPath, [cliPath], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: terminalCwd,
      env: {
        ...process.env,
        ...env,
        ELECTRON_RUN_AS_NODE: '1',
        GEMINI_CLI_CONTEXT: 'electron',
        GEMINI_SESSION_ID: sessionId,
      },
    });

    const outputBuffer: string[] = [];

    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(
        `[PTY] Process exited with code ${exitCode} and signal ${signal}`,
      );

      const output = outputBuffer.join('').trim();
      const baseMessage = `Exit Code: ${exitCode}, Signal: ${signal}`;
      const fullMessage = output
        ? `${baseMessage}\n\nOutput:\n${output}`
        : baseMessage;

      if (exitCode !== 0) {
        dialog.showErrorBox('PTY Process Exited Unexpectedly', fullMessage);
      } else if (signal === null) {
        dialog.showErrorBox(
          'PTY Process Exited Too Quickly',
          `The CLI process completed without errors, which is unexpected for an interactive session. This could be due to incorrect arguments or an environment issue.\n\n${fullMessage}`,
        );
      }
    });

    ptyOnDataDisposable = ptyProcess.onData((data) => {
      outputBuffer.push(data);
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal.incomingData', data);
      }
    });
  } catch (e) {
    const error = e as Error;
    console.error('[PTY] Failed to start PTY process:', error);
    dialog.showErrorBox(
      'Failed to Start PTY Process',
      `Message: ${error.message}\nStack: ${error.stack}`,
    );
  }
}

ipcMain.handle(
  'gemini-editor:resolve',
  async (_event, { diffPath, status, content }) => {
    if (!diffPath) {
      return { success: false, error: 'diffPath is missing' };
    }
    try {
      const metaPath = join(diffPath, 'meta.json');
      const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8'));
      const fileType = extname(meta.filePath);
      const newFilePath = join(diffPath, `new${fileType}`);
      const responsePath = join(diffPath, 'response.json');

      if (status === 'approve') {
        await fs.promises.writeFile(newFilePath, content);
      }
      await fs.promises.writeFile(responsePath, JSON.stringify({ status }));
      return { success: true };
    } catch (e) {
      console.error('Error resolving gemini-editor request:', e);
      return { success: false, error: (e as Error).message };
    }
  },
);
async function getThemeFromSettings() {
  const { loadSettings } = await import(
    '@google/gemini-cli/dist/src/config/settings.js'
  );
  const { themeManager } = await import(
    '@google/gemini-cli/dist/src/ui/themes/theme-manager.js'
  );
  const { merged } = await loadSettings(os.homedir());
  const settings = merged as CliSettings;
  const themeName = settings.theme;
  if (!themeName) {
    return undefined;
  }

  themeManager.loadCustomThemes(settings.customThemes);
  return themeManager.getTheme(themeName);
}

function isObject(item: unknown): item is Record<string, unknown> {
  return !!(item && typeof item === 'object' && !Array.isArray(item));
}

function deepMerge<T extends object, U extends object>(target: T, source: U): T & U {
  const output = { ...target } as T & U;

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key as keyof U];
        const targetValue = (target as Record<string, unknown>)[key];

        if (isObject(sourceValue) && isObject(targetValue)) {
          (output as Record<string, unknown>)[key] = deepMerge(
            targetValue,
            sourceValue,
          );
        } else {
          (output as Record<string, unknown>)[key] = sourceValue;
        }
      }
    }
  }

  return output;
}

async function createWindow() {
  try {
    const cliTheme = await getThemeFromSettings();
    let prevResize = [0, 0];

    const mainWindow = new BrowserWindow({
      width: 900,
      height: 600,
      title: 'Gemini CLI',
      icon: iconPath,
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 15, y: 10 },
      backgroundColor: cliTheme ? cliTheme.colors.Background : '#282a36',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    });

    if (process.env.VITE_DEV_SERVER_URL) {
      mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
    }

    startPtyProcess(mainWindow);

    mainWindow.on('closed', () => {
      if (ptyProcess) {
        ptyProcess.kill();
        ptyProcess = null;
      }
    });

    mainWindow.on('resize', () => {
      const [width, height] = mainWindow.getContentSize();
      mainWindow.webContents.send('main-window-resize', { width, height });
    });

    ipcMain.on('terminal.keystroke', (_event, key) => {
      ptyProcess?.write(key);
    });

    ipcMain.on(
      'terminal.resize',
      (_event, size: { cols: number; rows: number }) => {
        if (size.cols !== prevResize[0] || size.rows !== prevResize[1]) {
          console.log(`Resizing terminal to ${size.cols}x${size.rows}`);
          ptyProcess?.resize(size.cols, size.rows);
          prevResize = [size.cols, size.rows];
        }
      },
    );

    ipcMain.on('settings:restart-terminal', () => {
      startPtyProcess(mainWindow);
    });

    ipcMain.on('theme:set', (_event, theme: 'light' | 'dark') => {
      const backgroundColor = theme === 'dark' ? '#282a36' : '#ffffff';
      mainWindow.setBackgroundColor(backgroundColor);
    });

    ipcMain.handle('settings:get', async () => {
      const { loadSettings } = await import(
        '@google/gemini-cli/dist/src/config/settings.js'
      );
      const settings = await loadSettings(os.homedir());
      const merged = settings.merged as CliSettings;

      if (typeof merged.env === 'object' && merged.env !== null) {
        merged.env = Object.entries(merged.env)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n');
      }

      // We need to convert the class instance to a plain object to send over IPC
      // so that the `merged` getter is resolved.
      return {
        system: settings.system,
        user: settings.user,
        workspace: settings.workspace,
        errors: settings.errors,
        merged,
      };
    });

    ipcMain.handle('themes:get', async () => {
      const { loadSettings } = await import(
        '@google/gemini-cli/dist/src/config/settings.js'
      );
      const { themeManager } = await import(
        '@google/gemini-cli/dist/src/ui/themes/theme-manager.js'
      );
      const { merged } = await loadSettings(os.homedir());
      const settings = merged as CliSettings;
      themeManager.loadCustomThemes(settings.customThemes);
      return themeManager.getAvailableThemes();
    });

    ipcMain.handle(
      'settings:set',
      async (_event, { changes, scope = 'User' }) => {
        const { loadSettings, saveSettings, SettingScope } = await import(
          '@google/gemini-cli/dist/src/config/settings.js'
        );
        try {
          const loadedSettings = await loadSettings(os.homedir());

          let scopeEnum: (typeof SettingScope)[keyof typeof SettingScope];
          if (scope === 'Workspace') {
            scopeEnum = SettingScope.Workspace;
          } else if (scope === 'System') {
            scopeEnum = SettingScope.System;
          } else {
            scopeEnum = SettingScope.User;
          }

          const settingsFile = loadedSettings.forScope(scopeEnum);

          // Create a mutable copy of the settings
          const newSettings = { ...settingsFile.settings } as CliSettings;
          const typedChanges = changes as CliSettings;

          // When updating mcpServers, we want to replace the whole object, not merge it,
          // to ensure deletions are persisted.
          if (typedChanges.mcpServers) {
            newSettings.mcpServers = typedChanges.mcpServers;
            delete typedChanges.mcpServers;
          }

          if (typedChanges.env) {
            newSettings.env = typedChanges.env;
            delete typedChanges.env;
          }

          const mergedSettings = deepMerge(newSettings, typedChanges);

          saveSettings({
            path: settingsFile.path,
            settings: mergedSettings as unknown as Settings,
          });

          // Re-read theme and update main window
          const newTheme = await getThemeFromSettings();
          if (newTheme) {
            mainWindow.webContents.send('theme:init', newTheme);
            mainWindow.setBackgroundColor(newTheme.colors.Background);
          }
          return { success: true };
        } catch (error) {
          console.error('Error writing settings.json:', error);
          return { success: false, error: (error as Error).message };
        }
      },
    );

    ipcMain.handle('language-map:get', async () => store.get('languageMap', {}));

    ipcMain.handle('language-map:set', async (_event, map) => {
      store.set('languageMap', map);
    });

    // Send theme to renderer process
    mainWindow.webContents.on('did-finish-load', () => {
      if (cliTheme) {
        mainWindow.webContents.send('theme:init', cliTheme);
      }
    });
  } catch (e) {
    const error = e as Error;
    dialog.showErrorBox(
      'Error in createWindow',
      `Message: ${error.message}\nStack: ${error.stack}`,
    );
    app.quit();
  }
}

app
  .whenReady()
  .then(() => {
    if (os.platform() === 'darwin') {
      app.dock?.setIcon(iconPath);
    }
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  })
  .catch((e) => {
    const error = e as Error;
    dialog.showErrorBox(
      'Error during app startup',
      `Message: ${error.message}\nStack: ${error.stack}`,
    );
    app.quit();
  });

app.on('before-quit', () => {
  if (ptyOnDataDisposable) {
    ptyOnDataDisposable.dispose();
    ptyOnDataDisposable = null;
  }
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }
});

app.on('window-all-closed', () => {
  app.quit();
});