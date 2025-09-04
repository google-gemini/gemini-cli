"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const electron = require("electron");
const node_path = require("node:path");
const pty = require("node-pty");
const os = require("node:os");
const fs = require("node:fs");
const crypto = require("node:crypto");
const process = require("node:process");
const Store = require("electron-store");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const pty__namespace = /* @__PURE__ */ _interopNamespaceDefault(pty);
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
const store = new Store();
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  electron.dialog.showErrorBox(
    "An Uncaught Exception Occurred",
    error.message || "Unknown error"
  );
  electron.app.quit();
});
const iconPath = node_path.join(__dirname, "..", "..", "src", "resources", "icon.png");
let ptyProcess = null;
let ptyOnDataDisposable = null;
let fileWatcher = null;
async function setupFileWatcher(mainWindow) {
  const diffDir = node_path.join(os.homedir(), ".gemini", "tmp", "diff");
  try {
    await fs.promises.mkdir(diffDir, { recursive: true });
  } catch (e) {
    console.error("Error creating diff directory:", e);
    return;
  }
  if (fileWatcher) {
    fileWatcher.close();
  }
  fileWatcher = fs.watch(diffDir, async (eventType, filename) => {
    if (eventType !== "rename" || !filename) {
      return;
    }
    const fullPath = node_path.join(diffDir, filename);
    const responsePath = node_path.join(fullPath, "response.json");
    try {
      const stats = await fs.promises.stat(fullPath);
      const responseExists = await fs.promises.access(responsePath).then(() => true).catch(() => false);
      if (stats.isDirectory() && !responseExists) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const metaPath = node_path.join(fullPath, "meta.json");
        const meta = JSON.parse(await fs.promises.readFile(metaPath, "utf-8"));
        const fileType = node_path.extname(meta.filePath);
        const oldPath = node_path.join(fullPath, `old${fileType}`);
        const newPath = node_path.join(fullPath, `new${fileType}`);
        const oldContent = await fs.promises.readFile(oldPath, "utf-8");
        const newContent = await fs.promises.readFile(newPath, "utf-8");
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send("gemini-editor:show", {
            diffPath: fullPath,
            oldContent,
            newContent,
            meta
          });
        }
      }
    } catch (_e) {
    }
  });
}
async function getTerminalCwd() {
  const { loadSettings } = await import("@google/gemini-cli/dist/src/config/settings.js");
  const { merged } = await loadSettings(os.homedir());
  const settings = merged;
  if (settings.terminalCwd && typeof settings.terminalCwd === "string") {
    return settings.terminalCwd;
  }
  return node_path.join(os.homedir(), "Documents");
}
async function startPtyProcess(mainWindow) {
  if (ptyOnDataDisposable) {
    ptyOnDataDisposable.dispose();
    ptyOnDataDisposable = null;
  }
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }
  mainWindow.webContents.send("terminal.reset");
  const sessionId = crypto.randomUUID();
  setupFileWatcher(mainWindow);
  const cliPath = node_path.join(__dirname, "..", "..", "..", "cli", "dist", "index.js");
  console.log(`[PTY] Starting PTY process with CLI path: ${cliPath}`);
  if (!fs.existsSync(cliPath)) {
    const errorMsg = `[PTY] CLI path not found: ${cliPath}`;
    console.error(errorMsg);
    electron.dialog.showErrorBox("Fatal Error", errorMsg);
    return;
  }
  const terminalCwd = await getTerminalCwd();
  const { loadSettings } = await import("@google/gemini-cli/dist/src/config/settings.js");
  const { merged } = await loadSettings(os.homedir());
  const settings = merged;
  const env = {};
  if (typeof settings.env === "string") {
    for (const line of settings.env.split("\n")) {
      const parts = line.split("=");
      const key = parts.shift();
      const value = parts.join("=");
      if (key) {
        env[key] = value;
      }
    }
  }
  try {
    ptyProcess = pty__namespace.spawn(process.execPath, [cliPath], {
      name: "xterm-color",
      cols: 80,
      rows: 30,
      cwd: terminalCwd,
      env: {
        ...process.env,
        ...env,
        ELECTRON_RUN_AS_NODE: "1",
        GEMINI_CLI_CONTEXT: "electron",
        GEMINI_SESSION_ID: sessionId
      }
    });
    const outputBuffer = [];
    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(
        `[PTY] Process exited with code ${exitCode} and signal ${signal}`
      );
      const output = outputBuffer.join("").trim();
      const baseMessage = `Exit Code: ${exitCode}, Signal: ${signal}`;
      const fullMessage = output ? `${baseMessage}

Output:
${output}` : baseMessage;
      if (exitCode !== 0) {
        electron.dialog.showErrorBox("PTY Process Exited Unexpectedly", fullMessage);
      } else if (signal === null) {
        electron.dialog.showErrorBox(
          "PTY Process Exited Too Quickly",
          `The CLI process completed without errors, which is unexpected for an interactive session. This could be due to incorrect arguments or an environment issue.

${fullMessage}`
        );
      }
    });
    ptyOnDataDisposable = ptyProcess.onData((data) => {
      outputBuffer.push(data);
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send("terminal.incomingData", data);
      }
    });
  } catch (e) {
    const error = e;
    console.error("[PTY] Failed to start PTY process:", error);
    electron.dialog.showErrorBox(
      "Failed to Start PTY Process",
      `Message: ${error.message}
Stack: ${error.stack}`
    );
  }
}
electron.ipcMain.handle(
  "gemini-editor:resolve",
  async (_event, { diffPath, status, content }) => {
    if (!diffPath) {
      return { success: false, error: "diffPath is missing" };
    }
    try {
      const metaPath = node_path.join(diffPath, "meta.json");
      const meta = JSON.parse(await fs.promises.readFile(metaPath, "utf-8"));
      const fileType = node_path.extname(meta.filePath);
      const newFilePath = node_path.join(diffPath, `new${fileType}`);
      const responsePath = node_path.join(diffPath, "response.json");
      if (status === "approve") {
        await fs.promises.writeFile(newFilePath, content);
      }
      await fs.promises.writeFile(responsePath, JSON.stringify({ status }));
      return { success: true };
    } catch (e) {
      console.error("Error resolving gemini-editor request:", e);
      return { success: false, error: e.message };
    }
  }
);
async function getThemeFromSettings() {
  const { loadSettings } = await import("@google/gemini-cli/dist/src/config/settings.js");
  const { themeManager } = await import("@google/gemini-cli/dist/src/ui/themes/theme-manager.js");
  const { merged } = await loadSettings(os.homedir());
  const settings = merged;
  const themeName = settings.theme;
  if (!themeName) {
    return void 0;
  }
  themeManager.loadCustomThemes(settings.customThemes);
  return themeManager.getTheme(themeName);
}
function isObject(item) {
  return !!(item && typeof item === "object" && !Array.isArray(item));
}
function deepMerge(target, source) {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        const targetValue = target[key];
        if (isObject(sourceValue) && isObject(targetValue)) {
          output[key] = deepMerge(
            targetValue,
            sourceValue
          );
        } else {
          output[key] = sourceValue;
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
    const mainWindow = new electron.BrowserWindow({
      width: 900,
      height: 600,
      title: "Gemini CLI",
      icon: iconPath,
      titleBarStyle: "hidden",
      trafficLightPosition: { x: 15, y: 10 },
      backgroundColor: cliTheme ? cliTheme.colors.Background : "#282a36",
      webPreferences: {
        preload: node_path.join(__dirname, "../preload/index.cjs"),
        sandbox: false
      }
    });
    if (process.env.VITE_DEV_SERVER_URL) {
      mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      mainWindow.loadFile(node_path.join(__dirname, "../renderer/index.html"));
    }
    startPtyProcess(mainWindow);
    mainWindow.on("closed", () => {
      if (ptyProcess) {
        ptyProcess.kill();
        ptyProcess = null;
      }
    });
    mainWindow.on("resize", () => {
      const [width, height] = mainWindow.getContentSize();
      mainWindow.webContents.send("main-window-resize", { width, height });
    });
    electron.ipcMain.on("terminal.keystroke", (_event, key) => {
      ptyProcess?.write(key);
    });
    electron.ipcMain.on(
      "terminal.resize",
      (_event, size) => {
        if (size.cols !== prevResize[0] || size.rows !== prevResize[1]) {
          console.log(`Resizing terminal to ${size.cols}x${size.rows}`);
          ptyProcess?.resize(size.cols, size.rows);
          prevResize = [size.cols, size.rows];
        }
      }
    );
    electron.ipcMain.on("settings:restart-terminal", () => {
      startPtyProcess(mainWindow);
    });
    electron.ipcMain.on("theme:set", (_event, theme) => {
      const backgroundColor = theme === "dark" ? "#282a36" : "#ffffff";
      mainWindow.setBackgroundColor(backgroundColor);
    });
    electron.ipcMain.handle("settings:get", async () => {
      const { loadSettings } = await import("@google/gemini-cli/dist/src/config/settings.js");
      const settings = await loadSettings(os.homedir());
      const merged = settings.merged;
      if (typeof merged.env === "object" && merged.env !== null) {
        merged.env = Object.entries(merged.env).map(([key, value]) => `${key}=${value}`).join("\n");
      }
      return {
        system: settings.system,
        user: settings.user,
        workspace: settings.workspace,
        merged
      };
    });
    electron.ipcMain.handle("themes:get", async () => {
      const { loadSettings } = await import("@google/gemini-cli/dist/src/config/settings.js");
      const { themeManager } = await import("@google/gemini-cli/dist/src/ui/themes/theme-manager.js");
      const { merged } = await loadSettings(os.homedir());
      const settings = merged;
      themeManager.loadCustomThemes(settings.customThemes);
      return themeManager.getAvailableThemes();
    });
    electron.ipcMain.handle(
      "settings:set",
      async (_event, { changes, scope = "User" }) => {
        const { loadSettings, saveSettings, SettingScope } = await import("@google/gemini-cli/dist/src/config/settings.js");
        try {
          const loadedSettings = await loadSettings(os.homedir());
          let scopeEnum;
          if (scope === "Workspace") {
            scopeEnum = SettingScope.Workspace;
          } else if (scope === "System") {
            scopeEnum = SettingScope.System;
          } else {
            scopeEnum = SettingScope.User;
          }
          const settingsFile = loadedSettings.forScope(scopeEnum);
          const newSettings = { ...settingsFile.settings };
          const typedChanges = changes;
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
            settings: mergedSettings
          });
          const newTheme = await getThemeFromSettings();
          if (newTheme) {
            mainWindow.webContents.send("theme:init", newTheme);
            mainWindow.setBackgroundColor(newTheme.colors.Background);
          }
          return { success: true };
        } catch (error) {
          console.error("Error writing settings.json:", error);
          return { success: false, error: error.message };
        }
      }
    );
    electron.ipcMain.handle(
      "language-map:get",
      async () => store.get("languageMap", {})
    );
    electron.ipcMain.handle("language-map:set", async (_event, map) => {
      store.set("languageMap", map);
    });
    mainWindow.webContents.on("did-finish-load", () => {
      if (cliTheme) {
        mainWindow.webContents.send("theme:init", cliTheme);
      }
    });
  } catch (e) {
    const error = e;
    electron.dialog.showErrorBox(
      "Error in createWindow",
      `Message: ${error.message}
Stack: ${error.stack}`
    );
    electron.app.quit();
  }
}
electron.app.whenReady().then(() => {
  if (os.platform() === "darwin") {
    electron.app.dock?.setIcon(iconPath);
  }
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((e) => {
  const error = e;
  electron.dialog.showErrorBox(
    "Error during app startup",
    `Message: ${error.message}
Stack: ${error.stack}`
  );
  electron.app.quit();
});
electron.app.on("before-quit", () => {
  if (ptyOnDataDisposable) {
    ptyOnDataDisposable.dispose();
    ptyOnDataDisposable = null;
  }
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }
});
electron.app.on("window-all-closed", () => {
  electron.app.quit();
});
