import { app, BrowserWindow, Menu, ipcMain, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { is } from '@electron-toolkit/utils';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Keep a global reference of the window object
let mainWindow = null;
// MultiModelSystem instance
let multiModelSystem = null;
function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        show: false,
        autoHideMenuBar: false,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        icon: join(__dirname, '../assets/icon.png'),
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
            sandbox: false,
            contextIsolation: false,
            nodeIntegration: true,
            webSecurity: true
        }
    });
    mainWindow.on('ready-to-show', () => {
        mainWindow?.show();
    });
    mainWindow.webContents.setWindowOpenHandler((details) => {
        // Open external links in the default browser
        require('electron').shell.openExternal(details.url);
        return { action: 'deny' };
    });
    // Load the app
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    }
    else {
        mainWindow.loadFile(join(__dirname, '../dist/index.html'));
    }
    // Open the DevTools in development
    if (is.dev) {
        mainWindow.webContents.openDevTools();
    }
}
// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
    // Set app user model id for windows
    if (process.platform === 'win32') {
        app.setAppUserModelId('com.google.gemini-cli-gui');
    }
    createWindow();
    app.on('activate', () => {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
    // Create application menu
    createMenu();
});
// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
function createMenu() {
    const template = [
        {
            label: '&File',
            submenu: [
                {
                    label: '&New Session',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        mainWindow?.webContents.send('new-session');
                    }
                },
                { type: 'separator' },
                {
                    label: '&Open Workspace',
                    accelerator: 'CmdOrCtrl+O',
                    click: async () => {
                        const result = await dialog.showOpenDialog(mainWindow, {
                            properties: ['openDirectory'],
                            title: 'Select Workspace Directory'
                        });
                        if (!result.canceled && result.filePaths.length > 0) {
                            mainWindow?.webContents.send('open-workspace', result.filePaths[0]);
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: '&Settings',
                    accelerator: 'CmdOrCtrl+,',
                    click: () => {
                        mainWindow?.webContents.send('open-settings');
                    }
                },
                { type: 'separator' },
                {
                    role: 'quit'
                }
            ]
        },
        {
            label: '&Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        },
        {
            label: '&View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
                { type: 'separator' },
                {
                    label: 'Toggle Sidebar',
                    accelerator: 'CmdOrCtrl+B',
                    click: () => {
                        mainWindow?.webContents.send('toggle-sidebar');
                    }
                }
            ]
        },
        {
            label: '&Window',
            submenu: [
                { role: 'minimize' },
                { role: 'close' }
            ]
        }
    ];
    if (process.platform === 'darwin') {
        // macOS menu adjustments
        template.unshift({
            label: app.getName(),
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        });
        // Window menu for macOS
        template[4].submenu = [
            { role: 'close' },
            { role: 'minimize' },
            { role: 'zoom' },
            { type: 'separator' },
            { role: 'front' }
        ];
    }
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}
// IPC handlers
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});
ipcMain.handle('show-save-dialog', async (_, options) => {
    const result = await dialog.showSaveDialog(mainWindow, options);
    return result;
});
ipcMain.handle('show-open-dialog', async (_, options) => {
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result;
});
// Handle app protocol for deep links (optional)
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('gemini-cli', process.execPath, [
            process.argv[1]
        ]);
    }
}
else {
    app.setAsDefaultProtocolClient('gemini-cli');
}
