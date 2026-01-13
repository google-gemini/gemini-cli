import { ipcMain, BrowserWindow } from 'electron';
import type { Config, GeminiClient, MessageBus } from '@google/gemini-cli-core';

// These will be dynamically imported to avoid issues with ESM/CJS
let config: Config | null = null;
let client: GeminiClient | null = null;
let messageBus: MessageBus | null = null;
let currentAbortController: AbortController | null = null;

export interface InitializeParams {
  targetDir: string;
  model?: string;
  approvalMode?: 'default' | 'autoEdit' | 'yolo';
}

export function setupGeminiHandlers(mainWindow: BrowserWindow): void {
  // Initialize the Gemini client and config
  ipcMain.handle('gemini:initialize', async (_event, params: InitializeParams) => {
    try {
      // Dynamic import of @google/gemini-cli-core to handle ESM
      const core = await import('@google/gemini-cli-core');

      const sessionId = crypto.randomUUID();

      config = new core.Config({
        sessionId,
        targetDir: params.targetDir,
        model: params.model || 'gemini-2.0-flash',
        interactive: true,
        debugMode: false,
        approvalMode: core.ApprovalMode[
          params.approvalMode?.toUpperCase() as keyof typeof core.ApprovalMode
        ] || core.ApprovalMode.DEFAULT,
      });

      await config.initialize();
      client = config.getGeminiClient();
      messageBus = config.getMessageBus();

      // Subscribe to tool confirmation requests
      messageBus.subscribe(core.MessageBusType.TOOL_CONFIRMATION_REQUEST, (request) => {
        mainWindow.webContents.send('tool:confirmation-request', request);
      });

      // Subscribe to tool execution results
      messageBus.subscribe(core.MessageBusType.TOOL_EXECUTION_SUCCESS, (result) => {
        mainWindow.webContents.send('tool:execution-success', result);
      });

      messageBus.subscribe(core.MessageBusType.TOOL_EXECUTION_FAILURE, (result) => {
        mainWindow.webContents.send('tool:execution-failure', result);
      });

      return { success: true, sessionId };
    } catch (error) {
      console.error('Failed to initialize Gemini:', error);
      throw error;
    }
  });

  // Send a message to Gemini
  ipcMain.handle('gemini:send', async (_event, message: string, promptId: string) => {
    if (!client) {
      throw new Error('Gemini client not initialized. Call gemini:initialize first.');
    }

    currentAbortController = new AbortController();

    try {
      const stream = client.sendMessageStream(
        [{ text: message }],
        currentAbortController.signal,
        promptId
      );

      for await (const event of stream) {
        // Send each streaming event to the renderer
        mainWindow.webContents.send('gemini:stream-event', event);
      }

      return { success: true };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        mainWindow.webContents.send('gemini:stream-event', {
          type: 'user_cancelled',
          value: {},
        });
        return { success: true, aborted: true };
      }
      throw error;
    } finally {
      currentAbortController = null;
    }
  });

  // Abort the current request
  ipcMain.on('gemini:abort', () => {
    if (currentAbortController) {
      currentAbortController.abort();
    }
  });

  // Approve a tool call
  ipcMain.handle('tools:approve', async (_event, callId: string) => {
    if (!messageBus) {
      throw new Error('Message bus not initialized');
    }

    const core = await import('@google/gemini-cli-core');
    messageBus.publish({
      type: core.MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      correlationId: callId,
      confirmed: true,
    });

    return { success: true };
  });

  // Reject a tool call
  ipcMain.handle('tools:reject', async (_event, callId: string, reason?: string) => {
    if (!messageBus) {
      throw new Error('Message bus not initialized');
    }

    const core = await import('@google/gemini-cli-core');
    messageBus.publish({
      type: core.MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      correlationId: callId,
      confirmed: false,
      reason,
    });

    return { success: true };
  });

  // Get conversation history
  ipcMain.handle('gemini:get-history', async () => {
    if (!client) {
      return [];
    }
    return client.getHistory();
  });

  // Reset/clear the conversation
  ipcMain.handle('gemini:reset', async () => {
    if (!client) {
      throw new Error('Gemini client not initialized');
    }
    await client.resetChat();
    return { success: true };
  });

  // Get current settings
  ipcMain.handle('gemini:get-settings', async () => {
    if (!config) {
      return null;
    }
    return {
      model: config.getActiveModel(),
      approvalMode: config.getApprovalMode(),
      targetDir: config.getTargetDir(),
    };
  });
}
