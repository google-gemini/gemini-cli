import { spawn } from 'child_process';
import { BaseTool, ToolResult } from './tools'; // Import BaseTool and ToolResult
import { FunctionDeclaration } from '@google/genai';

// Path to the ListOpenWindows.exe utility, assuming it's in native_tools/windows/ at the project root
const LIST_OPEN_WINDOWS_EXE_PATH = '../../../../native_tools/windows/ListOpenWindows.exe';

export interface ListOpenWindowsParams {
  // No parameters needed for this tool
}

export interface WindowInfo {
  Title: string;
  ProcessId: number;
}

// This specific result structure is internal to the tool's processing
interface ListOpenWindowsExecutionResult {
  windows: WindowInfo[];
}

export class ListOpenWindowsTool extends BaseTool<
  ListOpenWindowsParams,
  ToolResult // BaseTool expects ToolResult
> {
  constructor() {
    super(
      'listOpenWindows', // name
      'List Open Windows', // displayName
      'Lists all open and visible windows on a Windows system, returning their titles and process IDs. (Windows OS only)', // description
      { type: 'object', properties: {} }, // parameterSchema (no params for this tool)
      false, // isOutputMarkdown (output is JSON, not markdown text)
      false // canUpdateOutput
    );
  }

  // The 'name' getter is inherited from BaseTool via constructor.
  // These getters are not part of BaseTool, but were part of a custom McpTool structure.
  // We need to ensure schema, description etc. are correctly provided via BaseTool's constructor.

  // get uniqueName(): string { // This is 'name' in BaseTool
  //   return 'listOpenWindows';
  // }

  // get shortDescription(): string { // This is part of 'description' in BaseTool
  //   return 'Lists all open and visible windows on a Windows system.';
  // }

  // get longDescription(): string { // This is 'description' in BaseTool
  //   return 'This tool enumerates all top-level windows that are currently visible on the user\'s desktop (Windows OS only) and returns their titles and process IDs.';
  // }

  // Example usages can be part of the main description or a separate property if needed by UI
  get exampleUsages(): string[] {
    return ['listOpenWindows'];
  }

  // Display properties might need a different handling if BaseTool doesn't support it directly.
  // For now, isExperimental can be part of the description.
  // get display(): McpToolDisplay {
  //   return {
  //     isExperimental: true,
  //   };
  // }

  // The schema for FunctionDeclaration is built by BaseTool from parameterSchema
  // get resultSchema(): object { // This is for validating the *output* of the tool, not part of FunctionDeclaration
  //   return {
  //     type: 'object',
  //     properties: {
  //       windows: {
  //         type: 'array',
  //         items: {
  //           type: 'object',
  //           properties: {
  //             Title: { type: 'string' },
  //             ProcessId: { type: 'number' },
  //           },
  //           required: ['Title', 'ProcessId'],
  //         },
  //       },
  //     },
  //     required: ['windows'],
  //   };
  // }

  async execute(
    params: ListOpenWindowsParams, // Unused, but part of the signature
    signal: AbortSignal // Added to match BaseTool
  ): Promise<ToolResult> { // Return type changed to ToolResult
    return new Promise<ToolResult>((resolve, reject) => {
      const process = spawn(LIST_OPEN_WINDOWS_EXE_PATH, []);

      // Handle AbortSignal
      if (signal) {
        signal.addEventListener('abort', () => {
          process.kill();
          reject(new Error('ListOpenWindows execution aborted.'));
        });
      }

      let stdoutData = '';
      let stderrData = '';

      process.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      process.on('close', (code) => {
        if (code !== 0) {
          const errorMessage = `ListOpenWindows.exe exited with code ${code}: ${stderrData}`;
          // Rejecting the promise will be caught by the caller, which should format it for ToolResult
          reject(new Error(errorMessage));
          return;
        }

        try {
          // The native tool outputs a JSON array directly (List<WindowInfo>)
          // For ToolResult, llmContent should be a string or Part array.
          // returnDisplay should be a user-friendly string.
          const parsedOutput: WindowInfo[] = JSON.parse(stdoutData);
          resolve({
            llmContent: stdoutData, // Send the raw JSON string to LLM
            returnDisplay: `Found ${parsedOutput.length} open window(s).`, // User-friendly summary
          });
        } catch (error) {
          const errorMessage = `Failed to parse JSON output from ListOpenWindows.exe: ${error.message}. Output was: ${stdoutData}`;
          reject(new Error(errorMessage));
        }
      });

      process.on('error', (err) => {
        // Error starting the process itself
        const errorMessage = `Failed to start ListOpenWindows.exe: ${err.message}`;
        reject(new Error(errorMessage));
      });
    });
  }
}
