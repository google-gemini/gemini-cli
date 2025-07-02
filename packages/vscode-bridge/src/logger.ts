// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0

import * as vscode from 'vscode';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
    private outputChannel: vscode.OutputChannel;
    private logLevel: LogLevel = 'info';

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Gemini Copilot Bridge');
    }

    setLevel(level: LogLevel) {
        this.logLevel = level;
    }

    debug(message: string) {
        if (this.shouldLog('debug')) {
            this.log('DEBUG', message);
        }
    }

    info(message: string) {
        if (this.shouldLog('info')) {
            this.log('INFO', message);
        }
    }

    warn(message: string) {
        if (this.shouldLog('warn')) {
            this.log('WARN', message);
        }
    }

    error(message: string) {
        if (this.shouldLog('error')) {
            this.log('ERROR', message);
        }
    }

    private shouldLog(level: LogLevel): boolean {
        const levels = ['debug', 'info', 'warn', 'error'];
        return levels.indexOf(level) >= levels.indexOf(this.logLevel);
    }

    private log(level: string, message: string) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${level}: ${message}`;
        this.outputChannel.appendLine(logMessage);
        
        // Also log to console for debugging
        console.log(`[Gemini Copilot Bridge] ${logMessage}`);
    }

    show() {
        this.outputChannel.show();
    }

    dispose() {
        this.outputChannel.dispose();
    }
}