/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { DevTools } from '@google/gemini-cli-devtools';
import { ModelLatencyCollector } from '../performance/collectors/model-latency-collector.js';
import { ToolExecutionCollector } from '../performance/collectors/tool-execution-collector.js';
import { SessionCollector } from '../performance/collectors/session-collector.js';

interface NetworkLog {
  url?: string;
  timestamp: number;
  request?: {
    headers?: Record<string, string>;
    body?: string;
  };
  response?: {
    status?: number;
    timestamp?: number;
    body?: string;
    headers?: Record<string, string>;
  };
}

interface ConsoleLog {
  payload?: {
    message?: string;
  };
}

// Type guard for expected response body shape
interface GeminiApiResponse {
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

function isGeminiApiResponse(obj: unknown): obj is GeminiApiResponse {
  if (typeof obj !== 'object' || obj === null) return false;
  if (!('usageMetadata' in obj)) return true;

  // Safely check usageMetadata without type assertions
  const withUsage = obj as { usageMetadata: unknown };
  return (
    typeof withUsage.usageMetadata === 'object' &&
    withUsage.usageMetadata !== null
  );
}

// Type guard for request body shape (if needed)
interface GeminiApiRequest {
  contents?: unknown;
}

function isGeminiApiRequest(obj: unknown): obj is GeminiApiRequest {
  return typeof obj === 'object' && obj !== null;
}

export class DevToolsPerformanceBridge {
  private static instance: DevToolsPerformanceBridge;
  private devTools = DevTools.getInstance();
  private modelCollector = ModelLatencyCollector.getInstance();
  private toolCollector = ToolExecutionCollector.getInstance();
  private sessionCollector = SessionCollector.getInstance();

  private constructor() {
    this.setupListeners();
  }

  static getInstance(): DevToolsPerformanceBridge {
    if (!DevToolsPerformanceBridge.instance) {
      DevToolsPerformanceBridge.instance = new DevToolsPerformanceBridge();
    }
    return DevToolsPerformanceBridge.instance;
  }

  private setupListeners() {
    // Listen to network logs from DevTools
    this.devTools.on('update', (log: NetworkLog) => {
      this.processNetworkLog(log);
    });

    // Listen to console logs for tool execution info
    this.devTools.on('console-update', (consoleLog: ConsoleLog) => {
      this.processConsoleLog(consoleLog);
    });
  }

  private processNetworkLog(log: NetworkLog) {
    // Check if this is a Gemini API call
    if (this.isGeminiAPICall(log)) {
      this.recordModelCallFromNetworkLog(log);
    }
  }

  private isGeminiAPICall(log: NetworkLog): boolean {
    const url = log.url || '';
    return (
      url.includes('generativelanguage.googleapis.com') ||
      url.includes('gemini') ||
      (log.request?.headers?.['x-goog-api-client']?.includes('gemini') ?? false)
    );
  }

  private recordModelCallFromNetworkLog(log: NetworkLog) {
    // Extract model info from URL or request body
    const model = this.extractModelFromUrl(log.url || '') || 'unknown';
    const operation = this.extractOperation(log.url || '');

    // Calculate duration
    const startTime = log.timestamp;
    const endTime = log.response?.timestamp || startTime;
    const duration = endTime - startTime;

    // Extract token usage from response if available
    let promptTokens = 0;
    let completionTokens = 0;

    // Safely parse response body
    if (log.response?.body) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const parsed = JSON.parse(log.response.body);
        if (isGeminiApiResponse(parsed) && parsed.usageMetadata) {
          promptTokens = parsed.usageMetadata.promptTokenCount || 0;
          completionTokens = parsed.usageMetadata.candidatesTokenCount || 0;
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
          `[PERF] Failed to parse response body for model call: ${error}`,
        );
      }
    }

    // Try to extract from request as fallback
    if (!promptTokens && log.request?.body) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const parsed = JSON.parse(log.request.body);
        if (isGeminiApiRequest(parsed) && parsed.contents) {
          promptTokens = this.estimateTokens(JSON.stringify(parsed.contents));
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
          `[PERF] Failed to parse response body for model call:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    const status = log.response?.status ?? 0;
    const success = status >= 200 && status < 300;

    this.modelCollector.recordCall({
      model,
      operation,
      duration,
      tokens: {
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens,
      },
      success,
      cached: log.response?.headers?.['x-cache'] === 'HIT' || false,
      error: !success ? `HTTP ${status}` : undefined,
    });

    // Track tokens in session
    if (promptTokens > 0 || completionTokens > 0) {
      this.sessionCollector.trackTokens(promptTokens, completionTokens);
    }
  }

  private processConsoleLog(consoleLog: ConsoleLog) {
    // Look for tool execution logs in console output
    const message = consoleLog.payload?.message || '';

    if (
      message.includes('🔧 Executing tool:') ||
      message.includes('Tool execution:')
    ) {
      this.parseToolExecutionFromLog(message);
    }

    if (message.includes('📝 Command:')) {
      this.parseCommandFromLog(message);
    }

    if (message.includes('📁 File modified:')) {
      this.parseFileModificationFromLog(message);
    }
  }

  private parseToolExecutionFromLog(message: string) {
    // Example log: "🔧 Executing tool: git (duration: 450ms, success: true)"
    const toolMatch = message.match(
      /tool:?\s*(\w+).*?(\d+)ms.*?success:?\s*(\w+)/i,
    );
    if (toolMatch) {
      const toolName = toolMatch[1];
      const duration = parseInt(toolMatch[2], 10);
      const success = toolMatch[3].toLowerCase() === 'true';

      this.toolCollector.recordExecution(toolName, duration, success);
      this.sessionCollector.trackToolCall(toolName, success);
    }
  }

  private parseCommandFromLog(message: string) {
    const commandMatch = message.match(/command:?\s*([^\s]+)/i);
    if (commandMatch) {
      this.sessionCollector.trackCommand(commandMatch[1]);
    }
  }

  private parseFileModificationFromLog(message: string) {
    const fileMatch = message.match(/file:?\s*([^\s]+)/i);
    if (fileMatch) {
      this.sessionCollector.trackFileModification(fileMatch[1]);
    }
  }

  private extractModelFromUrl(url: string): string | null {
    const models = [
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-2.0-pro',
      'gemini-2.0-flash',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
    ];

    for (const model of models) {
      if (url.includes(model)) {
        return model;
      }
    }

    // Try to extract from path like /v1/models/gemini-pro:generateContent
    const modelMatch = url.match(/models\/([^:/]+)/);
    return modelMatch ? modelMatch[1] : null;
  }

  private extractOperation(url: string): string {
    if (url.includes('generateContent')) return 'generate';
    if (url.includes('streamGenerateContent')) return 'stream';
    if (url.includes('embedContent')) return 'embed';
    if (url.includes('batchEmbedContents')) return 'batch-embed';
    return 'unknown';
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  startMonitoring() {
    // Ensure DevTools is started
    this.devTools.start().catch(() => {
      // DevTools might already be running
    });
  }

  stopMonitoring() {
    // Cleanup if needed
  }
}
