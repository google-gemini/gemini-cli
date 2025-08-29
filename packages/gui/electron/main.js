const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { MultiModelSystem, Config } = require('@google/gemini-cli-core')

// MultiModelSystem instance - we'll initialize this when needed
let multiModelSystem = null
let isInitialized = false

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
  return process.cwd()
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
  if (!multiModelSystem || !isInitialized) {
    try {
      // Create a proper ConfigParameters object
      const configParameters = {
        sessionId: `gui-session-${Date.now()}`,
        targetDir: process.cwd(),
        debugMode: false,
        model: configParams.model || 'openai/gpt-oss-20b',
        cwd: process.cwd(),
        interactive: true,
        ideMode: false, // 禁用 IDE 模式以避免 wmic 命令问题
        ...configParams
      }
      
      // Create the Config instance
      const config = new Config(configParameters)
      await config.initialize()
      
      // Initialize MultiModelSystem with the proper Config instance
      multiModelSystem = new MultiModelSystem(config)
      isInitialized = true
      console.log('MultiModelSystem initialized with LM Studio default model')
    } catch (error) {
      console.error('Failed to initialize MultiModelSystem:', error)
      throw error
    }
  }
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
    
    console.log('Retrieved models:', models)
    return models
  } catch (error) {
    console.error('Failed to get available models:', error)
    // 返回带有默认 LM Studio 模型的备用列表
    return {
      lm_studio: ['openai/gpt-oss-20b'],
      gemini: ['gemini-1.5-pro-latest', 'gemini-1.5-flash-latest'],
      openai: ['gpt-4', 'gpt-3.5-turbo'],
    }
  }
})

ipcMain.handle('multimodel-get-all-roles', async () => {
  console.log('MultiModel getAllRoles called')
  // TODO: Return actual roles
  // For now, return mock data
  return [
    { id: 'software_engineer', name: 'Software Engineer', description: 'Helps with coding tasks' },
    { id: 'data_analyst', name: 'Data Analyst', description: 'Helps with data analysis' },
  ]
})

ipcMain.handle('multimodel-get-current-role', async () => {
  console.log('MultiModel getCurrentRole called')
  // TODO: Return actual current role
  return { id: 'software_engineer', name: 'Software Engineer', description: 'Helps with coding tasks' }
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
    
    // 为 LM Studio 添加默认 baseUrl
    if (providerType === 'lm_studio') {
      providerConfig.baseUrl = process.env.LM_STUDIO_URL || 'http://127.0.0.1:1234/v1'
      providerConfig.displayName = 'LM Studio'
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
  return true
})

// Workspace directory management handlers
ipcMain.handle('multimodel-get-workspace-directories', async () => {
  try {
    console.log('MultiModel getWorkspaceDirectories called')
    const system = await ensureInitialized()
    const directories = system.getWorkspaceDirectories()
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
    await system.addWorkspaceDirectory(directory, basePath)
    
    // Notify all renderer processes about the workspace change
    const updatedDirectories = system.getWorkspaceDirectories()
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
    await system.setWorkspaceDirectories(directories)
    
    // Notify all renderer processes about the workspace change
    const updatedDirectories = system.getWorkspaceDirectories()
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

ipcMain.handle('multimodel-get-current-toolset', async () => {
  console.log('MultiModel getCurrentToolset called')
  return []
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
ipcMain.handle('multimodel-send-message-stream', async (event, messages, roleId, streamId) => {
  try {
    console.log('MultiModel sendMessageStream called with:', messages?.length, 'messages', 'roleId:', roleId, 'streamId:', streamId)
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
      const streamGenerator = system.sendMessageStream(universalMessages, abortController.signal, roleId)
      
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
        console.log('Sent chunk:', chunkData.type, chunkData.content?.length, 'chars')
        
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
      console.log('Sent completion:', completionData.content?.length, 'chars')
      
      console.log('MultiModel sendMessageStream completed')
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