import { contextBridge, ipcRenderer } from "electron";
function createEventHandler(channel, callback) {
  const handler = (_event, data) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
contextBridge.exposeInMainWorld("api", {
  gemini: {
    initialize: (params) => ipcRenderer.invoke("gemini:initialize", params),
    send: (message, promptId) => ipcRenderer.invoke("gemini:send", message, promptId),
    abort: () => ipcRenderer.send("gemini:abort"),
    getHistory: () => ipcRenderer.invoke("gemini:get-history"),
    reset: () => ipcRenderer.invoke("gemini:reset"),
    getSettings: () => ipcRenderer.invoke("gemini:get-settings"),
    onStreamEvent: (callback) => createEventHandler("gemini:stream-event", callback),
    onToolConfirmationRequest: (callback) => createEventHandler("tool:confirmation-request", callback),
    onToolExecutionSuccess: (callback) => createEventHandler("tool:execution-success", callback),
    onToolExecutionFailure: (callback) => createEventHandler("tool:execution-failure", callback)
  },
  tools: {
    approve: (callId) => ipcRenderer.invoke("tools:approve", callId),
    reject: (callId, reason) => ipcRenderer.invoke("tools:reject", callId, reason)
  },
  notifications: {
    show: (title, body) => ipcRenderer.send("notifications:show", title, body),
    showWithActions: (options) => ipcRenderer.invoke("notifications:show-with-actions", options)
  },
  menu: {
    onPreferences: (callback) => createEventHandler("menu:preferences", callback),
    onNewConversation: (callback) => createEventHandler("menu:new-conversation", callback),
    onOpenProject: (callback) => createEventHandler("menu:open-project", callback),
    onExportConversation: (callback) => createEventHandler("menu:export-conversation", callback),
    onClearConversation: (callback) => createEventHandler("menu:clear-conversation", callback),
    onToggleFileViewer: (callback) => createEventHandler("menu:toggle-file-viewer", callback),
    onStopGeneration: (callback) => createEventHandler("menu:stop-generation", callback),
    onApproveAll: (callback) => createEventHandler("menu:approve-all", callback),
    onRejectAll: (callback) => createEventHandler("menu:reject-all", callback)
  },
  theme: {
    onThemeChanged: (callback) => createEventHandler("theme:changed", callback),
    isDark: () => window.matchMedia("(prefers-color-scheme: dark)").matches
  },
  dialog: {
    openFolder: () => ipcRenderer.invoke("dialog:openFolder")
  }
});
