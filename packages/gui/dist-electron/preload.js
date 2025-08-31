import { contextBridge, ipcRenderer } from 'electron';
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const electronAPI = {
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
    onNewSession: (callback) => {
        ipcRenderer.on('new-session', callback);
    },
    onOpenWorkspace: (callback) => {
        ipcRenderer.on('open-workspace', (_, path) => callback(path));
    },
    onOpenSettings: (callback) => {
        ipcRenderer.on('open-settings', callback);
    },
    onToggleSidebar: (callback) => {
        ipcRenderer.on('toggle-sidebar', callback);
    },
    // MultiModel System API implementation
    multiModel: {
        initialize: (config) => ipcRenderer.invoke('multimodel-initialize', config),
        switchProvider: (providerType, model) => ipcRenderer.invoke('multimodel-switch-provider', providerType, model),
        switchRole: (roleId) => ipcRenderer.invoke('multimodel-switch-role', roleId),
        sendMessage: (messages, roleId) => ipcRenderer.invoke('multimodel-send-message', messages, roleId),
        getAvailableModels: (providerType) => ipcRenderer.invoke('multimodel-get-available-models', providerType),
        getAllRoles: () => ipcRenderer.invoke('multimodel-get-all-roles'),
        getCurrentRole: () => ipcRenderer.invoke('multimodel-get-current-role'),
        getAllTemplates: () => ipcRenderer.invoke('multimodel-get-all-templates'),
        renderTemplate: (templateId, variables) => ipcRenderer.invoke('multimodel-render-template', templateId, variables),
        addWorkspaceDirectory: (directory) => ipcRenderer.invoke('multimodel-add-workspace-directory', directory),
        getWorkspaceDirectories: () => ipcRenderer.invoke('multimodel-get-workspace-directories'),
        getCurrentToolset: () => ipcRenderer.invoke('multimodel-get-current-toolset'),
        addCustomRole: (role) => ipcRenderer.invoke('multimodel-add-custom-role', role),
        addCustomTemplate: (template) => ipcRenderer.invoke('multimodel-add-custom-template', template),
    },
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    }
};
// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld('electronAPI', electronAPI);
    }
    catch (error) {
        console.error(error);
    }
}
else {
    // @ts-ignore (define in dts)
    window.electronAPI = electronAPI;
}
