const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { MultiModelSystem, Config, RoleManager, WorkspaceManager, SessionManager, ModelProviderFactory, GeminiClient, AuthType, clearCachedCredentialFile, getOauthClient } = require('@google/gemini-cli-core')

// MultiModelSystem instance - we'll initialize this when needed
let multiModelSystem = null
let isInitialized = false
let initializationPromise = null

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // Load the React app
  const isDev = process.env.NODE_ENV === 'development'
  
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000')
    // Open the DevTools in development
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  createWindow()

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

ipcMain.handle('get-working-directory', () => {
  // Return user's home directory or Documents folder instead of process.cwd()
  const os = require('os')
  const path = require('path')
  
  // Try to get Documents folder, fallback to home directory
  try {
    const documentsPath = path.join(os.homedir(), 'Documents')
    const fs = require('fs')
    if (fs.existsSync(documentsPath)) {
      return documentsPath
    }
  } catch (error) {
    console.warn('Failed to access Documents folder:', error)
  }
  
  // Fallback to home directory
  return os.homedir()
})

// Dialog API handlers
ipcMain.handle('dialog-show-open-dialog', async (_, options) => {
  try {
    const result = await dialog.showOpenDialog(options)
    return result
  } catch (error) {
    console.error('Failed to show open dialog:', error)
    throw error
  }
})

// Helper function to ensure MultiModelSystem is initialized
const ensureInitialized = async (configParams = {}) => {
  // If already initialized, return immediately
  if (multiModelSystem && isInitialized) {
    return multiModelSystem
  }
  
  // If initialization is in progress, wait for it
  if (initializationPromise) {
    await initializationPromise
    return multiModelSystem
  }
  
  // Start initialization
  initializationPromise = (async () => {
    try {
      // Create a proper ConfigParameters object
      // Get user's preferred working directory instead of process.cwd()
      const os = require('os')
      const path = require('path')
      let workingDirectory = os.homedir()
      
      try {
        const documentsPath = path.join(os.homedir(), 'Documents')
        const fs = require('fs')
        if (fs.existsSync(documentsPath)) {
          workingDirectory = documentsPath
        }
      } catch (error) {
        console.warn('Failed to access Documents folder, using home directory:', error)
      }
      
      const configParameters = {
        sessionId: `gui-session-${Date.now()}`,
        targetDir: workingDirectory,
        debugMode: false,
        cwd: workingDirectory,
        interactive: true,
        ideMode: false, // 禁用 IDE 模式以避免 wmic 命令问题
        ...configParams
      }
      
      // Create the Config instance
      const config = new Config(configParameters)
      await config.initialize()
      
      // Initialize MultiModelSystem with the proper Config instance and optional GeminiClient
      multiModelSystem = new MultiModelSystem(config)
      
      // Initialize SessionManager with config and ModelProviderFactory
      await SessionManager.getInstance().initializeWithConfig({
        config: config,
        createModelProvider: ModelProviderFactory.create
      })
      
      // Initialize WorkspaceManager with config to ensure proper setup
      const workspaceManager = WorkspaceManager.getInstance(config)
      await workspaceManager.ensureInitialized()
      console.log('WorkspaceManager initialized with config and persisted directories loaded')
      
      isInitialized = true
      console.log('MultiModelSystem, SessionManager and WorkspaceManager initialized with LM Studio default model')
    } catch (error) {
      console.error('Failed to initialize MultiModelSystem:', error)
      initializationPromise = null // Reset on error
      throw error
    }
  })()
  
  await initializationPromise
  return multiModelSystem
}

// MultiModel IPC handlers - Now using actual MultiModelSystem  
ipcMain.handle('multimodel-initialize', async (_, configParams) => {
  try {
    console.log('MultiModel initialize called with:', configParams)
    await ensureInitialized(configParams)
    return { success: true }
  } catch (error) {
    console.error('Failed to initialize MultiModelSystem:', error)
    throw error
  }
})

ipcMain.handle('multimodel-get-available-models', async (_, providerType) => {
  try {
    console.log('MultiModel getAvailableModels called with:', providerType)
    const system = await ensureInitialized()
    const models = await system.getAvailableModels(providerType)
    
    // 确保 LM Studio 包含我们的默认模型
    if (!models.lm_studio || !models.lm_studio.includes('openai/gpt-oss-20b')) {
      models.lm_studio = models.lm_studio || []
      if (!models.lm_studio.includes('openai/gpt-oss-20b')) {
        models.lm_studio.unshift('openai/gpt-oss-20b') // 添加到开头作为默认
      }
    }
    
    // Filter out empty provider arrays to avoid UI confusion
    const filteredModels = Object.fromEntries(
      Object.entries(models).filter(([provider, modelList]) => modelList && modelList.length > 0)
    )
    
    console.log('Retrieved models:', filteredModels)
    return filteredModels
  } catch (error) {
    console.error('Failed to get available models:', error)
    // 返回带有默认 LM Studio 模型的备用列表
    return {
      lm_studio: ['openai/gpt-oss-20b'],
      gemini: ['gemini-2.5-pro-latest', 'gemini-2.5-flash-latest'],
      openai: ['gpt-4', 'gpt-3.5-turbo'],
    }
  }
})

ipcMain.handle('multimodel-get-all-roles', async () => {
  console.log('MultiModel getAllRoles called')
  try {
    const system = await ensureInitialized()
    const roles = RoleManager.getInstance().getAllRoles()
    console.log('Retrieved roles:', roles.length, 'roles')
    return roles
  } catch (error) {
    console.error('Failed to get all roles:', error)
    // Fallback to basic built-in roles if system is not available
    return [
      { 
        id: 'software_engineer', 
        name: 'Software Engineer', 
        description: 'Professional software development and code analysis assistant',
        category: 'development',
        icon: '💻',
        isBuiltin: true
      }
    ]
  }
})

ipcMain.handle('multimodel-get-current-role', async () => {
  console.log('MultiModel getCurrentRole called')
  try {
    const system = await ensureInitialized()
    const currentRole = RoleManager.getInstance().getCurrentRole()
    console.log('Retrieved current role:', currentRole.id)
    return currentRole
  } catch (error) {
    console.error('Failed to get current role:', error)
    // Fallback to default role if system is not available
    return { 
      id: 'software_engineer', 
      name: 'Software Engineer', 
      description: 'Professional software development and code analysis assistant',
      category: 'development',
      icon: '💻',
      isBuiltin: true
    }
  }
})

// Add more handlers as needed...
ipcMain.handle('multimodel-switch-provider', async (_, providerType, model) => {
  try {
    console.log('MultiModel switchProvider called:', providerType, model)
    const system = await ensureInitialized()
    
    // 创建提供商配置
    const providerConfig = {
      type: providerType,
      model: model,
      isDefault: true
    }
        
    // 切换到新的提供商和模型
    await system.switchProvider(providerConfig)
    
    console.log('Successfully switched to provider:', providerType, 'model:', model)
    return { success: true }
  } catch (error) {
    console.error('Failed to switch provider:', error)
    throw error
  }
})

ipcMain.handle('multimodel-switch-role', async (_, roleId) => {
  console.log('MultiModel switchRole called:', roleId)
  try {
    const system = await ensureInitialized()
    const success = await system.switchRole(roleId)
    console.log('Role switched successfully:', success)
    return success
  } catch (error) {
    console.error('Failed to switch role:', error)
    return false
  }
})

// Workspace directory management handlers
ipcMain.handle('multimodel-get-workspace-directories', async () => {
  try {
    console.log('MultiModel getWorkspaceDirectories called')
    const system = await ensureInitialized()
    const directories = WorkspaceManager.getInstance().getDirectories()
    console.log('Current workspace directories:', directories)
    return directories
  } catch (error) {
    console.error('Failed to get workspace directories:', error)
    return []
  }
})

ipcMain.handle('multimodel-add-workspace-directory', async (event, directory, basePath) => {
  try {
    console.log('MultiModel addWorkspaceDirectory called:', directory, 'basePath:', basePath)
    const system = await ensureInitialized()
    await WorkspaceManager.getInstance().addWorkspaceDirectory(directory, basePath)
    
    // Notify all renderer processes about the workspace change
    const updatedDirectories = WorkspaceManager.getInstance().getDirectories()
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('workspace-directories-changed', {
        type: 'added',
        directories: updatedDirectories,
        changedDirectory: directory
      })
    })
    
    console.log('Successfully added workspace directory:', directory)
    return { success: true }
  } catch (error) {
    console.error('Failed to add workspace directory:', error)
    throw error
  }
})

ipcMain.handle('multimodel-set-workspace-directories', async (event, directories) => {
  try {
    console.log('MultiModel setWorkspaceDirectories called:', directories)
    const system = await ensureInitialized()
    await WorkspaceManager.getInstance().setDirectories(directories)
    
    // Notify all renderer processes about the workspace change
    const updatedDirectories = WorkspaceManager.getInstance().getDirectories()
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('workspace-directories-changed', {
        type: 'set',
        directories: updatedDirectories
      })
    })
    
    console.log('Successfully set workspace directories')
    return { success: true }
  } catch (error) {
    console.error('Failed to set workspace directories:', error)
    throw error
  }
})

ipcMain.handle('multimodel-get-all-templates', async () => {
  console.log('MultiModel getAllTemplates called')
  return []
})

// History management handlers
ipcMain.handle('multimodel-get-history', async () => {
  try {
    const system = await ensureInitialized()
    const history = SessionManager.getInstance().getHistory()
    console.log('MultiModel getHistory called, returning', history.length, 'messages')
    return history
  } catch (error) {
    console.error('Failed to get conversation history:', error)
    return []
  }
})

ipcMain.handle('multimodel-set-history', async (_, history) => {
  try {
    const system = await ensureInitialized()
    SessionManager.getInstance().setHistory(history)
    console.log('MultiModel setHistory called with', history.length, 'messages')
    return { success: true }
  } catch (error) {
    console.error('Failed to set conversation history:', error)
    throw error
  }
})

ipcMain.handle('multimodel-clear-history', async () => {
  try {
    const system = await ensureInitialized()
    SessionManager.getInstance().clearHistory()
    console.log('MultiModel clearHistory called')
    return { success: true }
  } catch (error) {
    console.error('Failed to clear conversation history:', error)
    throw error
  }
})

// Session management handlers
ipcMain.handle('multimodel-create-session', async (_, sessionId, title = 'New Chat') => {
  try {
    const system = await ensureInitialized()
    SessionManager.getInstance().createSession(sessionId, title)
    console.log('MultiModel createSession called:', sessionId, title)
    return { success: true }
  } catch (error) {
    console.error('Failed to create session:', error)
    throw error
  }
})

ipcMain.handle('multimodel-switch-session', async (_, sessionId) => {
  try {
    const system = await ensureInitialized()
    SessionManager.getInstance().switchSession(sessionId)
    console.log('MultiModel switchSession called:', sessionId)
    return { success: true }
  } catch (error) {
    console.error('Failed to switch session:', error)
    throw error
  }
})

ipcMain.handle('multimodel-delete-session', async (_, sessionId) => {
  try {
    const system = await ensureInitialized()
    SessionManager.getInstance().deleteSession(sessionId)
    console.log('MultiModel deleteSession called:', sessionId)
    return { success: true }
  } catch (error) {
    console.error('Failed to delete session:', error)
    throw error
  }
})

ipcMain.handle('multimodel-delete-all-sessions', async () => {
  try {
    const system = await ensureInitialized()
    const sessionManager = SessionManager.getInstance()
    const sessionsInfo = sessionManager.getSessionsInfo()
    
    // Delete all sessions
    for (const sessionInfo of sessionsInfo) {
      sessionManager.deleteSession(sessionInfo.id)
    }
    
    console.log('MultiModel deleteAllSessions called, deleted', sessionsInfo.length, 'sessions')
    return { success: true }
  } catch (error) {
    console.error('Failed to delete all sessions:', error)
    throw error
  }
})

ipcMain.handle('multimodel-get-current-session-id', async () => {
  try {
    const system = await ensureInitialized()
    const sessionId = SessionManager.getInstance().getCurrentSessionId()
    console.log('MultiModel getCurrentSessionId called, returning:', sessionId)
    return sessionId
  } catch (error) {
    console.error('Failed to get current session ID:', error)
    return null
  }
})

ipcMain.handle('multimodel-get-display-messages', async (_, sessionId) => {
  try {
    const system = await ensureInitialized()
    const messages = SessionManager.getInstance().getDisplayMessages(sessionId)
    console.log('MultiModel getDisplayMessages called for session:', sessionId, 'returning', messages.length, 'messages')
    return messages
  } catch (error) {
    console.error('Failed to get display messages:', error)
    return []
  }
})

ipcMain.handle('multimodel-get-sessions-info', async () => {
  try {
    const system = await ensureInitialized()
    const sessionsInfo = SessionManager.getInstance().getSessionsInfo()
    console.log('MultiModel getSessionsInfo called, returning', sessionsInfo.length, 'sessions')
    return sessionsInfo
  } catch (error) {
    console.error('Failed to get sessions info:', error)
    return []
  }
})

ipcMain.handle('multimodel-update-session-title', async (_, sessionId, newTitle) => {
  try {
    const system = await ensureInitialized()
    SessionManager.getInstance().updateSessionTitle(sessionId, newTitle)
    console.log('MultiModel updateSessionTitle called:', sessionId, newTitle)
    return { success: true }
  } catch (error) {
    console.error('Failed to update session title:', error)
    throw error
  }
})


// Add message sending handler
ipcMain.handle('multimodel-send-message', async (_, messages, signal) => {
  try {
    console.log('MultiModel sendMessage called with:', messages?.length, 'messages')
    const system = await ensureInitialized()
    
    // Debug: check current provider
    const currentProvider = system.getCurrentProvider()
    console.log('Current provider config:', currentProvider)
    
    // Convert messages to the format expected by MultiModelSystem
    const universalMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }))
    
    // Create an AbortController for the signal
    const abortController = new AbortController()
    
    const response = await system.sendMessage(universalMessages, abortController.signal)
    console.log('MultiModel sendMessage response received')
    return response
  } catch (error) {
    console.error('Failed to send message:', error)
    throw error
  }
})

// Add streaming message handler using electron-ipc-stream
ipcMain.handle('multimodel-send-message-stream', async (event, messages, streamId) => {
  try {
    console.log('MultiModel sendMessageStream called with:', messages?.length, 'messages', 'streamId:', streamId)
    const system = await ensureInitialized()
    
    // Convert messages to the format expected by MultiModelSystem
    const universalMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }))
    
    // Create an AbortController for the signal
    const abortController = new AbortController()
    
    try {
      // Use streaming approach
      const streamGenerator = system.sendMessageStream(universalMessages, abortController.signal)
      
      let fullContent = ''
      
      for await (const chunk of streamGenerator) {
        // Send each chunk through IPC events
        const chunkData = {
          streamId,
          type: 'chunk',
          content: chunk.content || '',
          role: chunk.role || 'assistant',
          timestamp: Date.now()
        }
        
        event.sender.send('multimodel-stream-chunk', chunkData)
        
        // Accumulate content for final response
        if (chunk.content) {
          fullContent += chunk.content
        }
      }
      
      // Send completion signal
      const completionData = {
        streamId,
        type: 'complete',
        content: fullContent,
        role: 'assistant',
        timestamp: Date.now()
      }
      
      event.sender.send('multimodel-stream-complete', completionData)
      
      return { success: true, totalContent: fullContent }
      
    } catch (streamError) {
      // Send error through IPC events
      const errorData = {
        streamId,
        type: 'error',
        error: streamError.message,
        timestamp: Date.now()
      }
      
      event.sender.send('multimodel-stream-error', errorData)
      throw streamError
    }
    
  } catch (error) {
    console.error('Failed to send streaming message:', error)
    throw error
  }
})

// OAuth Authentication IPC handlers using AuthManager
ipcMain.handle('oauth-start-flow', async (_, providerType) => {
  try {
    console.log('OAuth start flow called for:', providerType)
    
    // Ensure system is initialized to get config
    const system = await ensureInitialized()
    
    // Use AuthManager instead of hardcoded OAuth logic
    const { AuthManager } = require('@google/gemini-cli-core')
    const authManager = AuthManager.getInstance()
    authManager.setConfig(system.getConfig())
    
    const result = await authManager.startOAuthFlow(providerType)
    console.log('OAuth flow result:', result)
    
    return result
  } catch (error) {
    console.error('OAuth flow failed:', error)
    return { 
      success: false, 
      error: error.message || 'OAuth authentication failed' 
    }
  }
})

ipcMain.handle('oauth-get-status', async (_, providerType) => {
  try {
    console.log('OAuth get status called for:', providerType)
    
    // Use AuthManager for unified OAuth status checking
    const { AuthManager } = require('@google/gemini-cli-core')
    const authManager = AuthManager.getInstance()
    
    // Ensure system is initialized and pass config to AuthManager
    const system = await ensureInitialized()
    authManager.setConfig(system.getConfig())
    
    const status = await authManager.getAuthStatus(providerType)
    console.log('OAuth status result:', status)
    
    return {
      authenticated: status.authenticated,
      userEmail: status.userEmail,
      type: status.authType
    }
  } catch (error) {
    console.error('Failed to check OAuth status:', error)
    return { authenticated: false }
  }
})

ipcMain.handle('oauth-clear-credentials', async (_, providerType) => {
  try {
    console.log('OAuth clear credentials called for:', providerType)
    
    // Use AuthManager for unified credential clearing
    const { AuthManager } = require('@google/gemini-cli-core')
    const authManager = AuthManager.getInstance()
    
    const result = await authManager.clearCredentials(providerType)
    console.log('OAuth credentials cleared:', result)
    
    return result
  } catch (error) {
    console.error('Failed to clear OAuth credentials:', error)
    return { 
      success: false, 
      error: error.message 
    }
  }
})

ipcMain.handle('check-env-api-key', async (_, providerType) => {
  try {
    console.log('Check environment API key called for:', providerType)
    
    // Use AuthManager for unified API key checking
    const { AuthManager } = require('@google/gemini-cli-core')
    const authManager = AuthManager.getInstance()
    
    const result = await authManager.checkEnvApiKey(providerType)
    console.log('Environment API key check result:', result)
    
    return result
  } catch (error) {
    console.error('Failed to check environment API key:', error)
    return { detected: false, source: 'Error' }
  }
})

// Add IPC handler for setting API key preference
ipcMain.handle('set-api-key-preference', async (_, providerType) => {
  try {
    console.log('Set API key preference called for:', providerType)
    
    // Ensure system is initialized
    const system = await ensureInitialized()
    
    // Use AuthManager to set API key preference
    const { AuthManager } = require('@google/gemini-cli-core')
    const authManager = AuthManager.getInstance()
    authManager.setConfig(system.getConfig())
    authManager.useApiKeyAuth(providerType)
    
    console.log('API key preference set successfully')
    return { success: true }
  } catch (error) {
    console.error('Failed to set API key preference:', error)
    return { 
      success: false, 
      error: error.message 
    }
  }
})