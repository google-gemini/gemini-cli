/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
} from './tools.js';
import type { ToolResult } from './tools.js';

interface DotNetRequest {
  module: string;
  operation: string;
  parameters: Record<string, unknown>;
  requestId: string;
  responseFile: string;
}

interface DotNetResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  [key: string]: unknown;
}

/**
 * Base class for tools that delegate processing to .NET modules
 */
export abstract class BaseDotNetTool<TParams extends object, TResult extends ToolResult>
  extends BaseDeclarativeTool<TParams, TResult> {

  constructor(
    name: string,
    displayName: string,
    description: string,
    private dotnetModule: string,
    parameterSchema: unknown,
    isOutputMarkdown: boolean = true,
    canUpdateOutput: boolean = false,
  ) {
    super(name, displayName, description, Kind.Other, parameterSchema, isOutputMarkdown, canUpdateOutput);
  }

  protected createInvocation(params: TParams): DotNetInvocation<TParams, TResult> {
    return new DotNetInvocation(params, this.dotnetModule);
  }
}

/**
 * Handles the invocation of .NET processors for tool execution
 */
class DotNetInvocation<TParams extends object, TResult extends ToolResult>
  extends BaseToolInvocation<TParams, TResult> {

  private static readonly __dirname = path.dirname(fileURLToPath(import.meta.url));
  private static readonly PROCESSOR_PATH = path.join(DotNetInvocation.__dirname, '..', '..', 'dotnet-processor', 'bin', 'Debug', 'net8.0', 'win-x64', 'GeminiProcessor.exe');
  private static readonly TEMP_DIR = path.join(DotNetInvocation.__dirname, '..', '..', 'temp');

  constructor(
    params: TParams,
    private moduleName: string
  ) {
    super(params);
  }

  getDescription(): string {
    return `Processing ${this.moduleName} operation via .NET module`;
  }

  async execute(): Promise<TResult> {
    try {
      // Ensure temp directory exists
      await this.ensureTempDirectory();

      const requestId = randomUUID();
      const requestFile = path.join(DotNetInvocation.TEMP_DIR, `request-${requestId}.json`);
      const responseFile = path.join(DotNetInvocation.TEMP_DIR, `response-${requestId}.json`);

      // Create request
      const request: DotNetRequest = {
        module: this.moduleName,
        operation: (this.params as any).op || 'process',
        parameters: this.params as Record<string, unknown>,
        requestId,
        responseFile,
      };

      // Write request file
      await fs.writeFile(requestFile, JSON.stringify(request, null, 2), 'utf8');

      try {
        // Call .NET processor
        await this.callDotNetProcessor(requestFile);

        // Read response
        const response = await this.readResponse(responseFile);

        return this.formatResponse(response);
      } finally {
        // Cleanup temp files
        await this.cleanup(requestFile, responseFile);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        llmContent: `.NET processing failed: ${message}`,
        returnDisplay: `.NET processing failed: ${message}`,
      } as unknown as TResult;
    }
  }

  private async ensureTempDirectory(): Promise<void> {
    if (!existsSync(DotNetInvocation.TEMP_DIR)) {
      await fs.mkdir(DotNetInvocation.TEMP_DIR, { recursive: true });
    }
  }

  private async callDotNetProcessor(requestFile: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Check if processor exists
      if (!existsSync(DotNetInvocation.PROCESSOR_PATH)) {
        reject(new Error(`GeminiProcessor.exe not found at ${DotNetInvocation.PROCESSOR_PATH}. Please build the .NET processor first.`));
        return;
      }

      const process = spawn(DotNetInvocation.PROCESSOR_PATH, [requestFile], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Processor exited with code ${code}. stderr: ${stderr}. stdout: ${stdout}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to start processor: ${error.message}`));
      });

      // Set timeout (30 seconds)
      setTimeout(() => {
        if (!process.killed) {
          process.kill();
          reject(new Error('Processor timeout after 30 seconds'));
        }
      }, 30000);
    });
  }

  private async readResponse(responseFile: string): Promise<DotNetResponse> {
    try {
      const responseContent = await fs.readFile(responseFile, 'utf8');
      return JSON.parse(responseContent) as DotNetResponse;
    } catch (error) {
      throw new Error(`Failed to read response file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private formatResponse(dotNetResponse: DotNetResponse): TResult {
    if (!dotNetResponse.success) {
      return {
        success: false,
        llmContent: `Operation failed: ${dotNetResponse.error || 'Unknown error'}`,
        returnDisplay: `Operation failed: ${dotNetResponse.error || 'Unknown error'}`,
      } as unknown as TResult;
    }

    // Convert .NET response to tool result format
    // This can be customized by subclasses if needed
    const result = {
      ...dotNetResponse,
      llmContent: dotNetResponse['llmContent'] || 'Operation completed successfully',
      returnDisplay: dotNetResponse['returnDisplay'] || 'Operation completed successfully',
      error: undefined, // Ensure error is undefined for successful responses
    } as unknown as TResult;
    return result;
  }

  private async cleanup(requestFile: string, responseFile: string): Promise<void> {
    try {
      await Promise.allSettled([
        fs.unlink(requestFile).catch(() => {}),
        fs.unlink(responseFile).catch(() => {}),
      ]);
    } catch {
      // Ignore cleanup errors
    }
  }
}