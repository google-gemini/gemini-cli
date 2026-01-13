import { Menu, shell, app, BrowserWindow } from 'electron';

export function createMenu(): Menu {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: 'Preferences...',
                accelerator: 'Cmd+,',
                click: (): void => {
                  const win = BrowserWindow.getFocusedWindow();
                  win?.webContents.send('menu:preferences');
                },
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),

    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Conversation',
          accelerator: 'CmdOrCtrl+N',
          click: (): void => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('menu:new-conversation');
          },
        },
        {
          label: 'Open Project...',
          accelerator: 'CmdOrCtrl+O',
          click: (): void => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('menu:open-project');
          },
        },
        { type: 'separator' },
        {
          label: 'Export Conversation...',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: (): void => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('menu:export-conversation');
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },

    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Clear Conversation',
          accelerator: 'CmdOrCtrl+K',
          click: (): void => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('menu:clear-conversation');
          },
        },
      ],
    },

    // View menu
    {
      label: 'View',
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
          label: 'Toggle File Viewer',
          accelerator: 'CmdOrCtrl+\\',
          click: (): void => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('menu:toggle-file-viewer');
          },
        },
      ],
    },

    // Conversation menu
    {
      label: 'Conversation',
      submenu: [
        {
          label: 'Stop Generation',
          accelerator: 'Escape',
          click: (): void => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('menu:stop-generation');
          },
        },
        { type: 'separator' },
        {
          label: 'Approve All Pending',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: (): void => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('menu:approve-all');
          },
        },
        {
          label: 'Reject All Pending',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: (): void => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send('menu:reject-all');
          },
        },
      ],
    },

    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : [{ role: 'close' as const }]),
      ],
    },

    // Help menu
    {
      role: 'help',
      submenu: [
        {
          label: 'Documentation',
          click: async (): Promise<void> => {
            await shell.openExternal('https://github.com/google-gemini/gemini-cli');
          },
        },
        {
          label: 'Report Issue',
          click: async (): Promise<void> => {
            await shell.openExternal('https://github.com/google-gemini/gemini-cli/issues');
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
