"use strict";
const electron = require("electron");
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
electron.contextBridge.exposeInMainWorld("electron", {
  onMainWindowResize: (callback) => {
    const channel = "main-window-resize";
    electron.ipcRenderer.on(channel, callback);
    return () => {
      electron.ipcRenderer.removeListener(channel, callback);
    };
  },
  terminal: {
    onData: (callback) => {
      const channel = "terminal.incomingData";
      electron.ipcRenderer.on(channel, callback);
      return () => {
        electron.ipcRenderer.removeListener(channel, callback);
      };
    },
    sendKey: (key) => electron.ipcRenderer.send("terminal.keystroke", key),
    resize: (size) => electron.ipcRenderer.send("terminal.resize", size),
    onReset: (callback) => {
      const channel = "terminal.reset";
      electron.ipcRenderer.on(channel, callback);
      return () => {
        electron.ipcRenderer.removeListener(channel, callback);
      };
    }
  },
  theme: {
    set: (theme) => electron.ipcRenderer.send("theme:set", theme),
    onInit: (callback) => {
      const channel = "theme:init";
      electron.ipcRenderer.on(channel, callback);
      return () => {
        electron.ipcRenderer.removeListener(channel, callback);
      };
    }
  },
  themes: {
    get: () => electron.ipcRenderer.invoke("themes:get")
  },
  settings: {
    get: () => electron.ipcRenderer.invoke("settings:get"),
    set: (settings) => electron.ipcRenderer.invoke("settings:set", settings),
    restartTerminal: () => electron.ipcRenderer.send("settings:restart-terminal")
  },
  languageMap: {
    get: () => electron.ipcRenderer.invoke("language-map:get"),
    set: (map) => electron.ipcRenderer.invoke("language-map:set", map)
  },
  onShowGeminiEditor: (callback) => {
    const channel = "gemini-editor:show";
    electron.ipcRenderer.on(channel, callback);
    return () => {
      electron.ipcRenderer.removeListener(channel, callback);
    };
  },
  resolveDiff: (result) => electron.ipcRenderer.invoke("gemini-editor:resolve", result)
});
