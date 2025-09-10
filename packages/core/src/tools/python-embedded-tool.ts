/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type { Config } from '../config/config.js';
import type {
  ToolInvocation,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolExecuteConfirmationDetails,
} from './tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  ToolConfirmationOutcome,
  Kind,
} from './tools.js';
import { getErrorMessage } from '../utils/errors.js';
import { ShellExecutionService } from '../services/shellExecutionService.js';

export const OUTPUT_UPDATE_INTERVAL_MS = 1000;

export interface PythonEmbeddedToolParams {
  code: string;
  description?: string;
  timeout?: number;
  workingDirectory?: string;
  requirements?: string[];
}

class PythonEmbeddedToolInvocation extends BaseToolInvocation<
  PythonEmbeddedToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: PythonEmbeddedToolParams,
    private readonly allowlist: Set<string>,
  ) {
    super(params);
  }

  getDescription(): string {
    let description = `Execute Python code`;
    if (this.params.description) {
      description += `: ${this.params.description.replace(/\n/g, ' ')}`;
    }
    if (this.params.requirements?.length) {
      description += ` (requires: ${this.params.requirements.join(', ')})`;
    }
    return description;
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    // Check if Python execution is already allowed
    if (this.allowlist.has('python_embedded')) {
      return false;
    }

    const codePreview = this.params.code.length > 200 
      ? this.params.code.slice(0, 200) + '...'
      : this.params.code;

    const confirmationDetails: ToolExecuteConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Python Code Execution',
      command: `python (embedded) -c "${codePreview}"`,
      rootCommand: 'python_embedded',
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.allowlist.add('python_embedded');
        }
      },
    };
    return confirmationDetails;
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
    _terminalColumns?: number,
  ): Promise<ToolResult> {
    try {
      // Get embedded Python path
      const embeddedPythonPath = this.getEmbeddedPythonPath();
      
      // Verify embedded Python exists
      if (!fs.existsSync(embeddedPythonPath)) {
        return {
          llmContent: `Embedded Python not found at: ${embeddedPythonPath}`,
          returnDisplay: `❌ Embedded Python not found at: ${embeddedPythonPath}`,
        };
      }

      // Install requirements if specified
      if (this.params.requirements?.length) {
        if (updateOutput) {
          updateOutput(`Installing Python packages: ${this.params.requirements.join(', ')}...\n`);
        }
        
        try {
          const installCommand = `"${embeddedPythonPath}" -m pip install ${this.params.requirements.join(' ')} --quiet`;
          const workingDir = this.params.workingDirectory || this.config.getTargetDir();
          
          const { result: installPromise } = await ShellExecutionService.execute(
            installCommand,
            workingDir,
            () => {}, // No output callback for install
            signal,
            false, // Don't use NodePty for install
          );
          
          const installResult = await installPromise;
          
          if (installResult.exitCode !== 0) {
            return {
              llmContent: `Failed to install Python requirements: ${installResult.output}`,
              returnDisplay: `❌ Failed to install Python requirements`,
            };
          }
          
          if (updateOutput) {
            updateOutput(`✅ Packages installed successfully\n\n`);
          }
        } catch (installError) {
          return {
            llmContent: `Failed to install Python requirements: ${getErrorMessage(installError)}`,
            returnDisplay: `❌ Failed to install Python requirements`,
          };
        }
      }

      // Create temporary Python script file
      const tempDir = os.tmpdir();
      const scriptId = crypto.randomUUID();
      const scriptPath = path.join(tempDir, `gemini_python_${scriptId}.py`);
      
      // Write Python code to temporary file with UTF-8 BOM to ensure proper encoding
      const codeWithEncoding = `# -*- coding: utf-8 -*-\n${this.params.code}`;
      await fs.promises.writeFile(scriptPath, codeWithEncoding, 'utf-8');
      
      // Prepare execution command with UTF-8 environment settings
      const isWindows = process.platform === 'win32';
      const command = isWindows 
        ? `chcp 65001 > nul && set PYTHONIOENCODING=utf-8 && "${embeddedPythonPath}" "${scriptPath}"`
        : `PYTHONIOENCODING=utf-8 "${embeddedPythonPath}" "${scriptPath}"`;
      
      // Set working directory
      const workingDir = this.params.workingDirectory || this.config.getTargetDir();
      
      // Execute Python script using ShellExecutionService
      const { result: pythonPromise } = await ShellExecutionService.execute(
        command,
        workingDir,
        updateOutput ? (event) => {
          if (event.type === 'data') {
            // For now, just call updateOutput with the chunk
            updateOutput(event.chunk);
          }
        } : () => {},
        signal,
        false, // Don't use NodePty for Python execution
      );
      
      const result = await pythonPromise;

      // Clean up temporary file
      try {
        await fs.promises.unlink(scriptPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
        console.warn('Failed to delete temporary Python script:', cleanupError);
      }
      
      // Format output  
      const output = result.output.trim();
      const hasError = result.exitCode !== 0;
      
      const formattedOutput = output || (hasError 
        ? 'Python script executed with errors (no output)' 
        : 'Python script executed successfully (no output)');
      
      // Add execution summary
      const summary = hasError 
        ? `❌ Python execution completed with errors (exit code: ${result.exitCode})`
        : '✅ Python execution completed successfully';
      
      const finalOutput = `${summary}\n\n${formattedOutput}`;
      
      return {
        llmContent: finalOutput,
        returnDisplay: finalOutput,
      };
      
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Failed to execute Python code: ${errorMessage}`,
        returnDisplay: `❌ Python execution failed: ${errorMessage}`,
      };
    }
  }

  private getEmbeddedPythonPath(): string {
    // Use import.meta.url to get the current file location
    const currentFileUrl = import.meta.url;
    const currentFilePath = new URL(currentFileUrl).pathname;
    
    // Convert Windows path format if needed
    const normalizedPath = process.platform === 'win32' 
      ? currentFilePath.slice(1) // Remove leading slash on Windows
      : currentFilePath;
    
    // Path structure: packages/core/src/tools/python-embedded-tool.ts
    // Go up: src/tools -> src -> core -> packages -> python-3.13.7
    const toolsPath = path.dirname(normalizedPath); // packages/core/dist/src/tools/python-embedded-tool.js
    const srcPath = path.dirname(toolsPath); // packages/core/dist/src
    const distPath = path.dirname(srcPath); // packages/core/dist
    const corePath = path.dirname(distPath); // packages/core
    const packagesPath = path.dirname(corePath); // packages
    const embeddedPythonPath = path.join(packagesPath, 'python-3.13.7', 'python.exe');
    return embeddedPythonPath;
  }
}

export class PythonEmbeddedTool extends BaseDeclarativeTool<PythonEmbeddedToolParams, ToolResult> {
  private readonly allowlist = new Set<string>();

  constructor(private readonly config: Config) {
    super(
      'python',
      'Python Code Execution (Embedded)',
      'Execute Python code using embedded Python 3.13.7 environment for stable and consistent execution. IMPORTANT: Always use UTF-8 encoding for text operations to avoid Unicode errors.',
      Kind.Execute,
      {
        type: 'object',
        required: ['code'],
        properties: {
          code: {
            type: 'string',
            description: 'Python code to execute. Can be multi-line and include imports. IMPORTANT: When working with text/files, always specify UTF-8 encoding (e.g., open(file, "r", encoding="utf-8")) to prevent UnicodeEncodeError on Windows systems.',
          },
          description: {
            type: 'string',
            description: 'Optional description of what the code does',
          },
          timeout: {
            type: 'number',
            description: 'Execution timeout in seconds (default: 30)',
            minimum: 1,
            maximum: 300,
          },
          workingDirectory: {
            type: 'string',
            description: 'Working directory for script execution (default: current target directory)',
          },
          requirements: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of Python packages to install before execution (e.g., ["requests", "pandas", "matplotlib"])',
          },
        },
        additionalProperties: false,
      },
      true, // isOutputMarkdown
      true, // canUpdateOutput
    );
  }

  protected createInvocation(
    params: PythonEmbeddedToolParams,
  ): ToolInvocation<PythonEmbeddedToolParams, ToolResult> {
    return new PythonEmbeddedToolInvocation(this.config, params, this.allowlist);
  }

  private getPythonPathStatic(): string {
    // Use import.meta.url to get the current file location
    const currentFileUrl = import.meta.url;
    const currentFilePath = new URL(currentFileUrl).pathname;
    
    // Convert Windows path format if needed
    const normalizedPath = process.platform === 'win32' 
      ? currentFilePath.slice(1) // Remove leading slash on Windows
      : currentFilePath;
    
    // Path structure: packages/core/src/tools/python-embedded-tool.ts
    // Go up: src/tools -> src -> core -> packages -> python-3.13.7
    const toolsPath = path.dirname(normalizedPath); // packages/core/dist/src/tools/python-embedded-tool.js
    const srcPath = path.dirname(toolsPath); // packages/core/dist/src
    const distPath = path.dirname(srcPath); // packages/core/dist
    const corePath = path.dirname(distPath); // packages/core
    const packagesPath = path.dirname(corePath); // packages
    const embeddedPythonPath = path.join(packagesPath, 'python-3.13.7', 'python.exe');
    return embeddedPythonPath;
  }

  /**
   * Get information about the embedded Python environment
   */
  async getEnvironmentInfo(): Promise<{
    pythonPath: string;
    version: string;
    available: boolean;
  }> {
    try {
      // Use the same path resolution as the private method
      const embeddedPythonPath = this.getPythonPathStatic();
      
      const available = fs.existsSync(embeddedPythonPath);
      
      if (available) {
        // Get version info
        try {
          const { result: versionPromise } = await ShellExecutionService.execute(
            `"${embeddedPythonPath}" --version`,
            process.cwd(),
            () => {},
            new AbortController().signal,
            false,
          );
          const result = await versionPromise;
        
          return {
            pythonPath: embeddedPythonPath,
            version: result.output?.trim() || 'Unknown',
            available: true,
          };
        } catch (error) {
          return {
            pythonPath: embeddedPythonPath,
            version: 'Error getting version ' + getErrorMessage(error),
            available: true, // File exists but version check failed
          };
        }
      }
      
      return {
        pythonPath: embeddedPythonPath,
        version: 'Not available',
        available: false,
      };
    } catch (error) {
      return {
        pythonPath: 'Unknown',
        version: 'Error getting version ' + getErrorMessage(error),
        available: false,
      };
    }
  }
}