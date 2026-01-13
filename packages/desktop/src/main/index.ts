import { app, shell, BrowserWindow, Menu, nativeTheme } from 'electron';
import { join } from 'path';
import { setupGeminiHandlers } from './ipc/gemini.js';
import { setupNotificationHandlers } from './ipc/notifications.js';
import { setupDialogHandlers } from './ipc/dialog.js';
import { createMenu } from './menu.js';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f6f6f6',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    // Open DevTools in development
    if (isDev) {
      mainWindow?.webContents.openDevTools();
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Load the renderer
  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  console.log('Loading renderer from:', rendererUrl || 'file');

  if (isDev && rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Set up IPC handlers
  setupGeminiHandlers(mainWindow);
  setupNotificationHandlers();
  setupDialogHandlers();
}

// App lifecycle
app.whenReady().then(() => {
  // Create the application menu
  const menu = createMenu();
  Menu.setApplicationMenu(menu);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle dark mode changes
nativeTheme.on('updated', () => {
  mainWindow?.webContents.send('theme:changed', nativeTheme.shouldUseDarkColors);
});
