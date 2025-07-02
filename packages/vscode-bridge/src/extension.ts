// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0

import * as vscode from 'vscode';
import { BridgeServer } from './bridgeServer';
import { Logger } from './logger';

let bridgeServer: BridgeServer | undefined;
let logger: Logger;

export function activate(context: vscode.ExtensionContext) {
    logger = new Logger();
    logger.info('Gemini Copilot Bridge extension activated');

    // Register commands
    const startCommand = vscode.commands.registerCommand('geminiCopilotBridge.start', async () => {
        await startBridge();
    });

    const stopCommand = vscode.commands.registerCommand('geminiCopilotBridge.stop', async () => {
        await stopBridge();
    });

    const restartCommand = vscode.commands.registerCommand('geminiCopilotBridge.restart', async () => {
        await stopBridge();
        await startBridge();
    });

    const statusCommand = vscode.commands.registerCommand('geminiCopilotBridge.status', () => {
        showStatus();
    });

    context.subscriptions.push(startCommand, stopCommand, restartCommand, statusCommand);

    // Auto-start if enabled
    const config = vscode.workspace.getConfiguration('geminiCopilotBridge');
    if (config.get('autoStart', true)) {
        startBridge();
    }

    // Watch for configuration changes
    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('geminiCopilotBridge')) {
            logger.info('Configuration changed, restarting bridge if running');
            if (bridgeServer?.isRunning()) {
                restartBridge();
            }
        }
    });
}

export function deactivate() {
    logger?.info('Gemini Copilot Bridge extension deactivated');
    return stopBridge();
}

async function startBridge() {
    if (bridgeServer?.isRunning()) {
        vscode.window.showWarningMessage('Gemini Copilot Bridge is already running');
        return;
    }

    try {
        const config = vscode.workspace.getConfiguration('geminiCopilotBridge');
        const port = config.get('port', 7337);
        const logLevel = config.get('logLevel', 'info');
        
        logger.setLevel(logLevel as 'debug' | 'info' | 'warn' | 'error');
        
        bridgeServer = new BridgeServer(port, logger);
        await bridgeServer.start();
        
        vscode.window.showInformationMessage(`Gemini Copilot Bridge started on port ${port}`);
        logger.info(`Bridge server started on port ${port}`);
    } catch (error) {
        const message = `Failed to start Gemini Copilot Bridge: ${error}`;
        vscode.window.showErrorMessage(message);
        logger.error(message);
    }
}

async function stopBridge() {
    if (!bridgeServer?.isRunning()) {
        return;
    }

    try {
        await bridgeServer.stop();
        bridgeServer = undefined;
        
        vscode.window.showInformationMessage('Gemini Copilot Bridge stopped');
        logger.info('Bridge server stopped');
    } catch (error) {
        const message = `Failed to stop Gemini Copilot Bridge: ${error}`;
        vscode.window.showErrorMessage(message);
        logger.error(message);
    }
}

async function restartBridge() {
    await stopBridge();
    // Small delay to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
    await startBridge();
}

function showStatus() {
    const isRunning = bridgeServer?.isRunning() ?? false;
    const config = vscode.workspace.getConfiguration('geminiCopilotBridge');
    const port = config.get('port', 7337);
    
    const status = isRunning 
        ? `✅ Bridge server is running on port ${port}`
        : `❌ Bridge server is not running`;
    
    vscode.window.showInformationMessage(`Gemini Copilot Bridge Status: ${status}`);
}