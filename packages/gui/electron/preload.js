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
    sendMessage: (messages, roleId) => ipcRenderer.invoke('multimodel-send-message', messages, roleId),
    sendMessageStream: (messages, roleId) => {
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
              cleanup();
              onError({ type: 'error', error: data.error });
            }
          });
          
          // Set up timeout
          const timeout = setTimeout(() => {
            cleanup();
            onError({ type: 'error', error: 'Stream timeout' });
          }, 15000); // 15 second timeout
          
          // NOW start the streaming request after event handlers are set
          ipcRenderer.invoke('multimodel-send-message-stream', messages, roleId, streamId)
            .catch((error) => {
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
    optimizeToolsetForCurrentRole: () => ipcRenderer.invoke('multimodel-optimize-toolset-for-current-role'),
    addCustomRole: (role) => ipcRenderer.invoke('multimodel-add-custom-role', role),
    addCustomTemplate: (template) => ipcRenderer.invoke('multimodel-add-custom-template', template),
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