/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { app, BrowserWindow, dialog } from 'electron';
import os from 'node:os';
import process from 'node:process';
import Store from 'electron-store';
import { PtyManager } from './pty-manager';
import type { CliSettings } from '../config/types';
import { ICON_PATH, PRELOAD_PATH, RENDERER_INDEX_PATH } from '../config/paths';

interface WindowBounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private ptyManager: PtyManager | null = null;
  private store = new Store();
  private saveBoundsTimeout: NodeJS.Timeout | null = null;

  constructor() {}

  async createWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.focus();
      return;
    }

    try {
      const cliTheme = await this.getThemeFromSettings();
      const bounds = this.store.get('windowBounds', {
        width: 900,
        height: 600,
      }) as WindowBounds;

      this.mainWindow = new BrowserWindow({
        ...bounds,
        title: 'Gemini CLI',
        icon: ICON_PATH,
        titleBarStyle: 'hidden',
        backgroundColor: cliTheme ? cliTheme.colors.Background : '#282a36',
        webPreferences: {
          preload: PRELOAD_PATH,
          sandbox: true,
        },
      });

      if (process.env.VITE_DEV_SERVER_URL) {
        this.mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
      } else {
        this.mainWindow.loadFile(RENDERER_INDEX_PATH);
      }

      this.ptyManager = new PtyManager(this.mainWindow);
      this.ptyManager.start();

      this.mainWindow.on('closed', () => {
        this.ptyManager?.dispose();
        this.ptyManager = null;
        this.mainWindow = null;
      });

      this.mainWindow.on('resize', () => {
        this.handleResize();
        this.saveBounds();
      });

      this.mainWindow.on('move', () => {
        this.saveBounds();
      });

      this.mainWindow.webContents.on('did-finish-load', () => {
        if (cliTheme && this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('theme:init', cliTheme);
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

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  getPtyManager(): PtyManager | null {
    return this.ptyManager;
  }

  getIconPath(): string {
    return ICON_PATH;
  }

  async getThemeFromSettings() {
    const { loadSettings, themeManager } = await import('@google/gemini-cli');
    const { merged } = await loadSettings(os.homedir());
    const settings = merged as CliSettings;
    const themeName = settings.theme;
    if (!themeName) {
      return undefined;
    }

    themeManager.loadCustomThemes(settings.customThemes);
    return themeManager.getTheme(themeName);
  }

  private handleResize() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const [width, height] = this.mainWindow.getContentSize();
      this.mainWindow.webContents.send('main-window-resize', {
        width,
        height,
      });
    }
  }

  private saveBounds() {
    if (this.saveBoundsTimeout) {
      clearTimeout(this.saveBoundsTimeout);
    }
    this.saveBoundsTimeout = setTimeout(() => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.store.set('windowBounds', this.mainWindow.getBounds());
      }
    }, 500);
  }
}
