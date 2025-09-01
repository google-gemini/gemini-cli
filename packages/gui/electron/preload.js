const { contextBridge, ipcRenderer } = require('electron')

// Define the API interface that will be exposed to the renderer process
const electronAPI = {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getWorkingDirectory: () => ipcRenderer.invoke('get-working-directory'),
  
  // Dialog API
  dialog: {
    showOpenDialog: (options) => ipcRenderer.invoke('dialog-show-open-dialog', options)
  },
  
  // Event listeners
  onWorkspaceDirectoriesChanged: (callback) => {
    ipcRenderer.on('workspace-directories-changed', callback)
    // Return cleanup function
    return () => ipcRenderer.removeListener('workspace-directories-changed', callback)
  },
  
  // MultiModel System API
  multiModel: {
    initialize: (config) => ipcRenderer.invoke('multimodel-initialize', config),
    switchProvider: (providerType, model) => ipcRenderer.invoke('multimodel-switch-provider', providerType, model),
    switchRole: (roleId) => ipcRenderer.invoke('multimodel-switch-role', roleId),
    sendMessage: (messages) => ipcRenderer.invoke('multimodel-send-message', messages),
    sendMessageStream: (messages) => {
      const streamId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      
      return {
        streamId,
        // Real-time streaming with callback
        startStream: (onChunk, onComplete, onError) => {
          const cleanup = () => {
            ipcRenderer.removeAllListeners('multimodel-stream-chunk');
            ipcRenderer.removeAllListeners('multimodel-stream-complete');
            ipcRenderer.removeAllListeners('multimodel-stream-error');
          };
          
          // Set up event handlers BEFORE starting the request
          ipcRenderer.on('multimodel-stream-chunk', (event, data) => {
            if (data.streamId === streamId) {
              onChunk(data);
            }
          });
          
          ipcRenderer.on('multimodel-stream-complete', (event, data) => {
            if (data.streamId === streamId) {
              cleanup();
              onComplete(data);
            }
          });
          
          ipcRenderer.on('multimodel-stream-error', (event, data) => {
            if (data.streamId === streamId) {
              console.error('IPC stream error received:', data.error);
              cleanup();
              onError({ type: 'error', error: data.error });
            }
          });
          
          // Set up timeout
          const timeout = setTimeout(() => {
            console.error('Stream timeout after 15 minutes');
            cleanup();
            onError({ type: 'error', error: 'Stream timeout' });
          }, 15 * 60 * 1000); // 15 minute timeout
          
          // NOW start the streaming request after event handlers are set
          ipcRenderer.invoke('multimodel-send-message-stream', messages, streamId)
            .catch((error) => {
              console.error('IPC invoke failed:', error.message, error);
              clearTimeout(timeout);
              cleanup();
              onError({ type: 'error', error: error.message });
            });
          
          // Return cleanup function
          return () => {
            clearTimeout(timeout);
            cleanup();
          };
        }
      }
    },
    getAvailableModels: (providerType) => ipcRenderer.invoke('multimodel-get-available-models', providerType),
    getAllRoles: () => ipcRenderer.invoke('multimodel-get-all-roles'),
    getCurrentRole: () => ipcRenderer.invoke('multimodel-get-current-role'),
    getAllTemplates: () => ipcRenderer.invoke('multimodel-get-all-templates'),
    renderTemplate: (templateId, variables) => ipcRenderer.invoke('multimodel-render-template', templateId, variables),
    addWorkspaceDirectory: (directory, basePath) => ipcRenderer.invoke('multimodel-add-workspace-directory', directory, basePath),
    getWorkspaceDirectories: () => ipcRenderer.invoke('multimodel-get-workspace-directories'),
    setWorkspaceDirectories: (directories) => ipcRenderer.invoke('multimodel-set-workspace-directories', directories),
    getCurrentToolset: () => ipcRenderer.invoke('multimodel-get-current-toolset'),
    addCustomRole: (role) => ipcRenderer.invoke('multimodel-add-custom-role', role),
    addCustomTemplate: (template) => ipcRenderer.invoke('multimodel-add-custom-template', template),
    // Session management
    createSession: (sessionId, title) => ipcRenderer.invoke('multimodel-create-session', sessionId, title),
    switchSession: (sessionId) => ipcRenderer.invoke('multimodel-switch-session', sessionId),
    deleteSession: (sessionId) => ipcRenderer.invoke('multimodel-delete-session', sessionId),
    getCurrentSessionId: () => ipcRenderer.invoke('multimodel-get-current-session-id'),
    getDisplayMessages: (sessionId) => ipcRenderer.invoke('multimodel-get-display-messages', sessionId),
    getSessionsInfo: () => ipcRenderer.invoke('multimodel-get-sessions-info'),
    updateSessionTitle: (sessionId, newTitle) => ipcRenderer.invoke('multimodel-update-session-title', sessionId, newTitle),
  }
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI)
  } catch (error) {
    console.error('Failed to expose electron API:', error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electronAPI = electronAPI
}