/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { app, BrowserWindow, dialog } from 'electron';
import os from 'node:os';
import process from 'node:process';
import { WindowManager } from './managers/window-manager';
import { registerIpcHandlers } from './ipc/ipc-handlers';
import log from './utils/logger';

// It's good practice to handle uncaught exceptions, especially in production.
process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error);
  if (!app.isPackaged) {
    dialog.showErrorBox(
      'An Uncaught Exception Occurred',
      error.message || 'Unknown error',
    );
  }
  app.quit();
});

const windowManager = new WindowManager();

app
  .whenReady()
  .then(() => {
    if (os.platform() === 'darwin') {
      app.dock?.setIcon(windowManager.getIconPath());
    }

    registerIpcHandlers(windowManager);
    windowManager.createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        windowManager.createWindow();
      }
    });
  })
  .catch((e) => {
    const error = e as Error;
    log.error('Error during app startup:', error);
    dialog.showErrorBox(
      'Error during app startup',
      `Message: ${error.message}\nStack: ${error.stack}`,
    );
    app.quit();
  });

app.on('before-quit', () => {
  windowManager.getPtyManager()?.dispose();
});

app.on('window-all-closed', () => {
  app.quit();
});
