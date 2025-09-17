/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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

export abstract class BasePythonTool<
  TParams extends object,
  TResult extends ToolResult,
> extends BaseDeclarativeTool<TParams, TResult> {
  private readonly allowlist = new Set<string>();

  constructor(
    name: string,
    displayName: string,
    description: string,
    protected readonly defaultRequirements: string[],
    parameterSchema: unknown,
    protected readonly config: Config,
    isOutputMarkdown: boolean = true,
    canUpdateOutput: boolean = false,
  ) {
    super(
      name,
      displayName,
      description,
      Kind.Execute,
      parameterSchema,
      isOutputMarkdown,
      canUpdateOutput,
    );
  }

  protected createInvocation(params: TParams): ToolInvocation<TParams, TResult> {
    return new BasePythonToolInvocation(
      this,
      params,
      this.config,
      this.allowlist,
      this.getRequirements(params),
    );
  }

  /**
   * Generate Python code for the specific tool operation
   */
  protected abstract generatePythonCode(params: TParams): string;

  /**
   * Parse the Python execution result into the expected tool result
   */
  protected abstract parseResult(pythonOutput: string, params: TParams): TResult;

  /**
   * Get the requirements for this specific tool execution
   */
  protected getRequirements(params: TParams): string[] {
    return this.defaultRequirements;
  }

  /**
   * Get the embedded Python path (same logic as PythonEmbeddedTool)
   */
  protected getEmbeddedPythonPath(): string {
    const currentFileUrl = import.meta.url;
    const currentFilePath = new URL(currentFileUrl).pathname;
    
    const normalizedPath = process.platform === 'win32' 
      ? currentFilePath.slice(1)
      : currentFilePath;
    
    const toolsPath = path.dirname(normalizedPath);
    const srcPath = path.dirname(toolsPath);
    const distPath = path.dirname(srcPath);
    const corePath = path.dirname(distPath);
    const packagesPath = path.dirname(corePath);
    const embeddedPythonPath = path.join(packagesPath, 'python-3.13.7', 'python.exe');
    return embeddedPythonPath;
  }
}

class BasePythonToolInvocation<
  TParams extends object,
  TResult extends ToolResult,
> extends BaseToolInvocation<TParams, TResult> {
  constructor(
    private readonly tool: BasePythonTool<TParams, TResult>,
    params: TParams,
    private readonly config: Config,
    private readonly allowlist: Set<string>,
    private readonly requirements: string[],
  ) {
    super(params);
  }

  override getDescription(): string {
    const pythonCode = this.tool['generatePythonCode'](this.params);
    let description = `Execute Python code for ${this.tool.displayName}`;
    
    const codePreview = pythonCode.length > 200 
      ? pythonCode.slice(0, 200) + '...'
      : pythonCode;
    
    if (codePreview.includes('import')) {
      const imports = codePreview.match(/^import .+|^from .+ import .+/gm);
      if (imports) {
        description += ` (imports: ${imports.map(i => i.split(' ')[1]).join(', ')})`;
      }
    }
    
    return description;
  }

  override async shouldConfirmExecute(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    // Check if Python execution is already allowed
    const rootCommand = `${this.tool.name}_python`;
    if (this.allowlist.has(rootCommand)) {
      return false;
    }

    const pythonCode = this.tool['generatePythonCode'](this.params);
    const codePreview = pythonCode.length > 200 
      ? pythonCode.slice(0, 200) + '...'
      : pythonCode;

    const requirements = this.requirements;
    const requirementsStr = requirements.length > 0 
      ? ` (requires: ${requirements.join(', ')})`
      : '';

    const confirmationDetails: ToolExecuteConfirmationDetails = {
      type: 'exec',
      title: `Confirm ${this.tool.displayName} Execution`,
      command: `python ${this.tool.name}${requirementsStr}\n\n${codePreview}`,
      rootCommand,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.allowlist.add(rootCommand);
        }
      },
    };
    
    return confirmationDetails;
  }

  override async execute(
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
    terminalColumns?: number,
  ): Promise<TResult> {
    try {
      // Get embedded Python path
      const embeddedPythonPath = this.tool['getEmbeddedPythonPath']();
      
      // Verify embedded Python exists
      if (!fs.existsSync(embeddedPythonPath)) {
        return {
          llmContent: `Embedded Python not found at: ${embeddedPythonPath}`,
          returnDisplay: `❌ Embedded Python not found at: ${embeddedPythonPath}`,
        } as TResult;
      }

      // Get requirements for this execution
      const requirements = this.requirements;

      // Check and install requirements if specified
      if (requirements.length > 0) {
        // First check which packages are missing
        const missingPackages: string[] = [];

        for (const requirement of requirements) {
          try {
            const checkCommand = `"${embeddedPythonPath}" -c "import ${requirement.split('[')[0].replace('-', '_')}; print('installed')"`;
            const { result: checkPromise } = await ShellExecutionService.execute(
              checkCommand,
              this.config.getTargetDir(),
              () => {},
              signal,
              false,
            );
            const checkResult = await checkPromise;

            if (checkResult.exitCode !== 0 || !checkResult.output.includes('installed')) {
              missingPackages.push(requirement);
            }
          } catch {
            // If check fails, assume package is missing
            missingPackages.push(requirement);
          }
        }

        // Only install missing packages
        if (missingPackages.length > 0) {
          if (updateOutput) {
            updateOutput(`Installing missing Python packages: ${missingPackages.join(', ')}...\\n`);
          }

          try {
            const installCommand = `"${embeddedPythonPath}" -m pip install ${missingPackages.join(' ')} --quiet`;
            const workingDir = this.config.getTargetDir();

            const { result: installPromise } = await ShellExecutionService.execute(
              installCommand,
              workingDir,
              () => {},
              signal,
              false,
            );

            const installResult = await installPromise;

            if (installResult.exitCode !== 0) {
              return {
                llmContent: `Failed to install Python requirements: ${installResult.output}`,
                returnDisplay: `❌ Failed to install Python requirements`,
              } as TResult;
            }

            if (updateOutput) {
              updateOutput(`✅ Packages installed successfully\\n\\n`);
            }
          } catch (installError) {
            return {
              llmContent: `Failed to install Python requirements: ${getErrorMessage(installError)}`,
              returnDisplay: `❌ Failed to install Python requirements`,
            } as TResult;
          }
        } else if (updateOutput) {
          updateOutput(`✅ All required packages already installed\\n\\n`);
        }
      }

      // Generate and execute Python code
      const pythonCode = this.tool['generatePythonCode'](this.params);
      
      // Create temporary Python script file
      const tempDir = os.tmpdir();
      const timestamp = Date.now();
      const operation = (this.params as any)?.op || 'unknown';
      const scriptPath = path.join(tempDir, `${this.tool.name}_${operation}_${timestamp}.py`);
      
      // Write Python code to temporary file with UTF-8 encoding and Base64 output wrapper
      const codeWithEncoding = `# -*- coding: utf-8 -*-
import sys
import io
import base64
import json
# Force UTF-8 for internal processing
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Capture the original print function
_original_print = print
_output_lines = []

# Override print to capture output
def print(*args, **kwargs):
    # Convert args to string and capture
    line = ' '.join(str(arg) for arg in args)
    if kwargs.get('end', '\\n') == '\\n':
        line += '\\n'
    _output_lines.append(line)

# Execute the main tool code
try:
${pythonCode.split('\n').map(line => '    ' + line).join('\n')}
except Exception as e:
    import traceback
    error_output = f"Error: {str(e)}\\n{traceback.format_exc()}"
    _output_lines.append(error_output)

# Restore original print
print = _original_print

# Combine all captured output
final_output = ''.join(_output_lines)

# Output result with Base64 encoding to handle Chinese characters
if final_output.strip():
    # Encode as Base64 to avoid any encoding issues with Chinese characters
    encoded = base64.b64encode(final_output.encode('utf-8')).decode('ascii')
    print(f"__TOOL_RESULT_BASE64__{encoded}__END__")
else:
    print("__TOOL_RESULT_BASE64____END__")
`;
      await fs.promises.writeFile(scriptPath, codeWithEncoding, 'utf-8');

      // Prepare execution command with UTF-8 environment settings
      const isWindows = process.platform === 'win32';
      const command = isWindows
        ? `chcp 65001 > nul && set PYTHONIOENCODING=utf-8 && set PYTHONLEGACYWINDOWSSTDIO=1 && "${embeddedPythonPath}" "${scriptPath}"`
        : `PYTHONIOENCODING=utf-8 "${embeddedPythonPath}" "${scriptPath}"`;

      // Set working directory
      const workingDir = this.config.getTargetDir();
      
      // Execute Python script
      const { result: pythonPromise } = await ShellExecutionService.execute(
        command,
        workingDir,
        updateOutput ? (event) => {
          if (event.type === 'data') {
            updateOutput(event.chunk);
          }
        } : () => {},
        signal,
        false,
      );
      
      const result = await pythonPromise;

      // Clean up temporary file
      // COMMENTED OUT FOR DEBUGGING - DO NOT COMMIT
      // try {
      //   await fs.promises.unlink(scriptPath);
      // } catch (cleanupError) {
      //   console.warn('Failed to delete temporary Python script:', cleanupError);
      // }
      console.log('DEBUG: Temporary Python script saved at:', scriptPath);

      // Parse output - check for Base64 encoded result to handle Chinese characters
      let finalOutput = result.output.trim();

      // Check for Base64 encoded result marker
      const base64Match = finalOutput.match(/__TOOL_RESULT_BASE64__([A-Za-z0-9+/=]*)__END__/);
      if (base64Match) {
        try {
          // Decode Base64 result if present
          const base64Data = base64Match[1];
          if (base64Data) {
            finalOutput = Buffer.from(base64Data, 'base64').toString('utf-8');
          } else {
            finalOutput = '';
          }
        } catch (decodeError) {
          console.warn('Failed to decode Base64 result:', decodeError);
          // Fall back to raw output
          finalOutput = result.output.trim();
        }
      }

      // Parse the Python output into the expected tool result format
      return this.tool['parseResult'](finalOutput, this.params);
      
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Failed to execute ${this.tool.name}: ${errorMessage}`,
        returnDisplay: `❌ ${this.tool.displayName} failed: ${errorMessage}`,
      } as TResult;
    }
  }
}