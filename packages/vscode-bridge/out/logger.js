"use strict";
// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const vscode = require("vscode");
class Logger {
    constructor() {
        this.logLevel = 'info';
        this.outputChannel = vscode.window.createOutputChannel('Gemini Copilot Bridge');
    }
    setLevel(level) {
        this.logLevel = level;
    }
    debug(message) {
        if (this.shouldLog('debug')) {
            this.log('DEBUG', message);
        }
    }
    info(message) {
        if (this.shouldLog('info')) {
            this.log('INFO', message);
        }
    }
    warn(message) {
        if (this.shouldLog('warn')) {
            this.log('WARN', message);
        }
    }
    error(message) {
        if (this.shouldLog('error')) {
            this.log('ERROR', message);
        }
    }
    shouldLog(level) {
        const levels = ['debug', 'info', 'warn', 'error'];
        return levels.indexOf(level) >= levels.indexOf(this.logLevel);
    }
    log(level, message) {
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
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map