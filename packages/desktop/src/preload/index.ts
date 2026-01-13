import { contextBridge, ipcRenderer } from 'electron';

// Type definitions for the exposed API
export interface GeminiAPI {
  initialize: (params: {
    targetDir: string;
    model?: string;
    approvalMode?: 'default' | 'autoEdit' | 'yolo';
  }) => Promise<{ success: boolean; sessionId: string }>;

  send: (message: string, promptId: string) => Promise<{ success: boolean; aborted?: boolean }>;
  abort: () => void;

  getHistory: () => Promise<unknown[]>;
  reset: () => Promise<{ success: boolean }>;
  getSettings: () => Promise<{
    model: string;
    approvalMode: string;
    targetDir: string;
  } | null>;

  // Event subscriptions
  onStreamEvent: (callback: (event: unknown) => void) => () => void;
  onToolConfirmationRequest: (callback: (request: unknown) => void) => () => void;
  onToolExecutionSuccess: (callback: (result: unknown) => void) => () => void;
  onToolExecutionFailure: (callback: (result: unknown) => void) => () => void;
}

export interface ToolsAPI {
  approve: (callId: string) => Promise<{ success: boolean }>;
  reject: (callId: string, reason?: string) => Promise<{ success: boolean }>;
}

export interface NotificationsAPI {
  show: (title: string, body: string) => void;
  showWithActions: (options: {
    title: string;
    body: string;
    actions?: string[];
  }) => Promise<{ clicked: boolean; action: string | null }>;
}

export interface MenuAPI {
  onPreferences: (callback: () => void) => () => void;
  onNewConversation: (callback: () => void) => () => void;
  onOpenProject: (callback: () => void) => () => void;
  onExportConversation: (callback: () => void) => () => void;
  onClearConversation: (callback: () => void) => () => void;
  onToggleFileViewer: (callback: () => void) => () => void;
  onStopGeneration: (callback: () => void) => () => void;
  onApproveAll: (callback: () => void) => () => void;
  onRejectAll: (callback: () => void) => () => void;
}

export interface ThemeAPI {
  onThemeChanged: (callback: (isDark: boolean) => void) => () => void;
  isDark: () => boolean;
}

export interface DialogAPI {
  openFolder: () => Promise<string | null>;
}

export interface DesktopAPI {
  gemini: GeminiAPI;
  tools: ToolsAPI;
  notifications: NotificationsAPI;
  menu: MenuAPI;
  theme: ThemeAPI;
  dialog: DialogAPI;
}

// Helper to create event listener with cleanup
function createEventHandler<T>(
  channel: string,
  callback: (data: T) => void
): () => void {
  const handler = (_event: Electron.IpcRendererEvent, data: T): void => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('api', {
  gemini: {
    initialize: (params) => ipcRenderer.invoke('gemini:initialize', params),
    send: (message, promptId) => ipcRenderer.invoke('gemini:send', message, promptId),
    abort: () => ipcRenderer.send('gemini:abort'),
    getHistory: () => ipcRenderer.invoke('gemini:get-history'),
    reset: () => ipcRenderer.invoke('gemini:reset'),
    getSettings: () => ipcRenderer.invoke('gemini:get-settings'),

    onStreamEvent: (callback) => createEventHandler('gemini:stream-event', callback),
    onToolConfirmationRequest: (callback) =>
      createEventHandler('tool:confirmation-request', callback),
    onToolExecutionSuccess: (callback) =>
      createEventHandler('tool:execution-success', callback),
    onToolExecutionFailure: (callback) =>
      createEventHandler('tool:execution-failure', callback),
  },

  tools: {
    approve: (callId) => ipcRenderer.invoke('tools:approve', callId),
    reject: (callId, reason) => ipcRenderer.invoke('tools:reject', callId, reason),
  },

  notifications: {
    show: (title, body) => ipcRenderer.send('notifications:show', title, body),
    showWithActions: (options) => ipcRenderer.invoke('notifications:show-with-actions', options),
  },

  menu: {
    onPreferences: (callback) => createEventHandler('menu:preferences', callback),
    onNewConversation: (callback) => createEventHandler('menu:new-conversation', callback),
    onOpenProject: (callback) => createEventHandler('menu:open-project', callback),
    onExportConversation: (callback) => createEventHandler('menu:export-conversation', callback),
    onClearConversation: (callback) => createEventHandler('menu:clear-conversation', callback),
    onToggleFileViewer: (callback) => createEventHandler('menu:toggle-file-viewer', callback),
    onStopGeneration: (callback) => createEventHandler('menu:stop-generation', callback),
    onApproveAll: (callback) => createEventHandler('menu:approve-all', callback),
    onRejectAll: (callback) => createEventHandler('menu:reject-all', callback),
  },

  theme: {
    onThemeChanged: (callback) => createEventHandler('theme:changed', callback),
    isDark: () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  },

  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  },
} satisfies DesktopAPI);

// Type augmentation for window.api
declare global {
  interface Window {
    api: DesktopAPI;
  }
}
