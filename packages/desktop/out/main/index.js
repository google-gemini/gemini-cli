import { ipcMain, Notification, dialog, app, BrowserWindow, shell, Menu, nativeTheme } from "electron";
import { join } from "path";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
let config = null;
let client = null;
let messageBus = null;
let currentAbortController = null;
function setupGeminiHandlers(mainWindow2) {
  ipcMain.handle("gemini:initialize", async (_event, params) => {
    try {
      const core = await import("@google/gemini-cli-core");
      const sessionId = crypto.randomUUID();
      config = new core.Config({
        sessionId,
        targetDir: params.targetDir,
        model: params.model || "gemini-2.0-flash",
        interactive: true,
        debugMode: false,
        approvalMode: core.ApprovalMode[params.approvalMode?.toUpperCase()] || core.ApprovalMode.DEFAULT
      });
      await config.initialize();
      client = config.getGeminiClient();
      messageBus = config.getMessageBus();
      messageBus.subscribe(core.MessageBusType.TOOL_CONFIRMATION_REQUEST, (request) => {
        mainWindow2.webContents.send("tool:confirmation-request", request);
      });
      messageBus.subscribe(core.MessageBusType.TOOL_EXECUTION_SUCCESS, (result) => {
        mainWindow2.webContents.send("tool:execution-success", result);
      });
      messageBus.subscribe(core.MessageBusType.TOOL_EXECUTION_FAILURE, (result) => {
        mainWindow2.webContents.send("tool:execution-failure", result);
      });
      return { success: true, sessionId };
    } catch (error) {
      console.error("Failed to initialize Gemini:", error);
      throw error;
    }
  });
  ipcMain.handle("gemini:send", async (_event, message, promptId) => {
    if (!client) {
      throw new Error("Gemini client not initialized. Call gemini:initialize first.");
    }
    currentAbortController = new AbortController();
    try {
      const stream = client.sendMessageStream(
        [{ text: message }],
        currentAbortController.signal,
        promptId
      );
      for await (const event of stream) {
        mainWindow2.webContents.send("gemini:stream-event", event);
      }
      return { success: true };
    } catch (error) {
      if (error.name === "AbortError") {
        mainWindow2.webContents.send("gemini:stream-event", {
          type: "user_cancelled",
          value: {}
        });
        return { success: true, aborted: true };
      }
      throw error;
    } finally {
      currentAbortController = null;
    }
  });
  ipcMain.on("gemini:abort", () => {
    if (currentAbortController) {
      currentAbortController.abort();
    }
  });
  ipcMain.handle("tools:approve", async (_event, callId) => {
    if (!messageBus) {
      throw new Error("Message bus not initialized");
    }
    const core = await import("@google/gemini-cli-core");
    messageBus.publish({
      type: core.MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      correlationId: callId,
      confirmed: true
    });
    return { success: true };
  });
  ipcMain.handle("tools:reject", async (_event, callId, reason) => {
    if (!messageBus) {
      throw new Error("Message bus not initialized");
    }
    const core = await import("@google/gemini-cli-core");
    messageBus.publish({
      type: core.MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      correlationId: callId,
      confirmed: false,
      reason
    });
    return { success: true };
  });
  ipcMain.handle("gemini:get-history", async () => {
    if (!client) {
      return [];
    }
    return client.getHistory();
  });
  ipcMain.handle("gemini:reset", async () => {
    if (!client) {
      throw new Error("Gemini client not initialized");
    }
    await client.resetChat();
    return { success: true };
  });
  ipcMain.handle("gemini:get-settings", async () => {
    if (!config) {
      return null;
    }
    return {
      model: config.getActiveModel(),
      approvalMode: config.getApprovalMode(),
      targetDir: config.getTargetDir()
    };
  });
}
function setupNotificationHandlers() {
  ipcMain.on("notifications:show", (_event, title, body) => {
    if (!Notification.isSupported()) {
      console.warn("Notifications are not supported on this system");
      return;
    }
    const notification = new Notification({
      title,
      body,
      silent: false
    });
    notification.show();
  });
  ipcMain.handle(
    "notifications:show-with-actions",
    async (_event, options) => {
      if (!Notification.isSupported()) {
        return { clicked: false };
      }
      return new Promise((resolve) => {
        const notification = new Notification({
          title: options.title,
          body: options.body,
          actions: options.actions?.map((label) => ({ type: "button", text: label }))
        });
        notification.on("click", () => {
          resolve({ clicked: true, action: null });
        });
        notification.on("action", (_event2, index) => {
          resolve({ clicked: true, action: options.actions?.[index] });
        });
        notification.on("close", () => {
          resolve({ clicked: false, action: null });
        });
        notification.show();
      });
    }
  );
}
function setupDialogHandlers() {
  ipcMain.handle("dialog:openFolder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Select Project Folder"
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
}
function createMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    // App menu (macOS only)
    ...isMac ? [
      {
        label: app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          {
            label: "Preferences...",
            accelerator: "Cmd+,",
            click: () => {
              const win = BrowserWindow.getFocusedWindow();
              win?.webContents.send("menu:preferences");
            }
          },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" }
        ]
      }
    ] : [],
    // File menu
    {
      label: "File",
      submenu: [
        {
          label: "New Conversation",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send("menu:new-conversation");
          }
        },
        {
          label: "Open Project...",
          accelerator: "CmdOrCtrl+O",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send("menu:open-project");
          }
        },
        { type: "separator" },
        {
          label: "Export Conversation...",
          accelerator: "CmdOrCtrl+Shift+E",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send("menu:export-conversation");
          }
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" }
      ]
    },
    // Edit menu
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        {
          label: "Clear Conversation",
          accelerator: "CmdOrCtrl+K",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send("menu:clear-conversation");
          }
        }
      ]
    },
    // View menu
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { type: "separator" },
        {
          label: "Toggle File Viewer",
          accelerator: "CmdOrCtrl+\\",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send("menu:toggle-file-viewer");
          }
        }
      ]
    },
    // Conversation menu
    {
      label: "Conversation",
      submenu: [
        {
          label: "Stop Generation",
          accelerator: "Escape",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send("menu:stop-generation");
          }
        },
        { type: "separator" },
        {
          label: "Approve All Pending",
          accelerator: "CmdOrCtrl+Shift+A",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send("menu:approve-all");
          }
        },
        {
          label: "Reject All Pending",
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send("menu:reject-all");
          }
        }
      ]
    },
    // Window menu
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...isMac ? [{ type: "separator" }, { role: "front" }] : [{ role: "close" }]
      ]
    },
    // Help menu
    {
      role: "help",
      submenu: [
        {
          label: "Documentation",
          click: async () => {
            await shell.openExternal("https://github.com/google-gemini/gemini-cli");
          }
        },
        {
          label: "Report Issue",
          click: async () => {
            await shell.openExternal("https://github.com/google-gemini/gemini-cli/issues");
          }
        }
      ]
    }
  ];
  return Menu.buildFromTemplate(template);
}
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
let mainWindow = null;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: "sidebar",
    visualEffectState: "active",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1e1e1e" : "#f6f6f6",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
    if (isDev) {
      mainWindow?.webContents.openDevTools();
    }
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });
  const rendererUrl = process.env["ELECTRON_RENDERER_URL"];
  console.log("Loading renderer from:", rendererUrl || "file");
  if (isDev && rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
  setupGeminiHandlers(mainWindow);
  setupNotificationHandlers();
  setupDialogHandlers();
}
app.whenReady().then(() => {
  const menu = createMenu();
  Menu.setApplicationMenu(menu);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
nativeTheme.on("updated", () => {
  mainWindow?.webContents.send("theme:changed", nativeTheme.shouldUseDarkColors);
});
