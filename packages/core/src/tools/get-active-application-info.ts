/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process';
import * as path from 'path';
import {
  BaseTool,
  GetActiveApplicationInfoParams,
  GetActiveApplicationInfoResult,
  ToolResult,
} from './tools'; // Adjust path as necessary

// TODO: Determine the final path for the compiled utility
const ACTIVE_WINDOW_INFO_EXE_PATH = path.join(
  __dirname,
  '..', // Adjust based on final location relative to this file
  '..',
  '..',
  '..',
  'ActiveWindowInfo', // Assuming it's in a sibling directory at the root for now
  'bin', // Standard output for .NET builds
  'Debug', // Or Release
  'net6.0', // Or other target framework
  'ActiveWindowInfo.exe',
);

export class GetActiveApplicationInfoTool extends BaseTool<
  GetActiveApplicationInfoParams,
  GetActiveApplicationInfoResult
> {
  constructor() {
    super(
      'getActiveApplicationInfo',
      'Get Active Application Info',
      'Retrieves information (PID, title, executable path) about the currently active application window. This tool is Windows-specific.',
      {}, // No parameters
      false, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  validateToolParams(
    params: GetActiveApplicationInfoParams,
  ): string | null {
    // No parameters to validate
    return null;
  }

  getDescription(params: GetActiveApplicationInfoParams): string {
    return 'Gets information about the currently active application window on Windows.';
  }

  async execute(
    params: GetActiveApplicationInfoParams,
    signal: AbortSignal,
  ): Promise<GetActiveApplicationInfoResult> {
    if (process.platform !== 'win32') {
      throw new Error(
        'GetActiveApplicationInfoTool is only supported on Windows.',
      );
    }

    return new Promise<GetActiveApplicationInfoResult>((resolve, reject) => {
      const process = child_process.spawn(ACTIVE_WINDOW_INFO_EXE_PATH, [], {
        signal,
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (signal.aborted) {
          return reject(new Error('Tool execution was aborted.'));
        }
        if (code !== 0) {
          return reject(
            new Error(
              `ActiveWindowInfo.exe exited with code ${code}: ${stderr}`,
            ),
          );
        }

        try {
          const resultData = JSON.parse(stdout);
          // Ensure the result conforms to the interface, though the C# app should guarantee this
          const result: GetActiveApplicationInfoResult = {
            pid: resultData.pid,
            title: resultData.title,
            executablePath: resultData.executablePath,
            llmContent: `Active application: ${resultData.title} (PID: ${resultData.pid}, Path: ${resultData.executablePath})`,
            returnDisplay: `Active Window:\nTitle: ${resultData.title}\nPID: ${resultData.pid}\nExecutable Path: ${resultData.executablePath}`,
          };
          resolve(result);
        } catch (e: any) {
          reject(new Error(`Error parsing JSON output: ${e.message}\nOutput: ${stdout}`));
        }
      });

      process.on('error', (err) => {
        // e.g., EACCES or ENOENT
        reject(
          new Error(
            `Failed to start ActiveWindowInfo.exe: ${err.message}. Ensure the utility is compiled and at the correct path: ${ACTIVE_WINDOW_INFO_EXE_PATH}`,
          ),
        );
      });
    });
  }
}
