import { promises as fs } from 'fs';
import { SchemaUnion, Type } from '@google/genai'; // Assuming these types exist
import { GeminiClient } from '../core/gemini-client.js'; // Assuming this path
import { exec } from 'child_process'; // Needed for Windows process check
import { promisify } from 'util'; // To promisify exec
import { globalConfig } from '../config/config.js';

// Promisify child_process.exec for easier async/await usage
const execAsync = promisify(exec);

// Define the expected interface for the AI client dependency
export interface AiClient {
  generateJson(
    prompt: any[], // Keep flexible or define a stricter prompt structure type
    schema: SchemaUnion,
  ): Promise<any>; // Ideally, specify the expected JSON structure TAnalysisResult | TAnalysisFailure
}

// Identifier for the background process (e.g., PID)
// Using `unknown` allows more flexibility than `object` while still being type-safe
export type ProcessHandle = number | string | unknown;

// Represents the structure expected from a successful LLM analysis call
export interface AnalysisResult {
  summary: string;
  inferredStatus: 'Running' | 'SuccessReported' | 'ErrorReported' | 'Unknown';
}

// Represents the structure returned when the LLM analysis itself fails
export interface AnalysisFailure {
  error: string;
  inferredStatus: 'AnalysisFailed';
}

// Type guard to check if the result is a failure object
function isAnalysisFailure(
  result: AnalysisResult | AnalysisFailure,
): result is AnalysisFailure {
  return (result as AnalysisFailure).inferredStatus === 'AnalysisFailed';
}

// Represents the final outcome after polling is complete (or failed/timed out)
export interface FinalAnalysisOutcome {
  status: string; // e.g., 'SuccessReported', 'ErrorReported', 'ProcessEnded_SuccessReported', 'TimedOut_Running', 'AnalysisFailed'
  summary: string; // Final summary or error message
}

export class BackgroundTerminalAnalyzer {
  private ai: AiClient;
  // Make polling parameters configurable via constructor
  private pollIntervalMs: number;
  private maxAttempts: number;
  private initialDelayMs: number;

  // --- Dependency Injection & Configuration ---
  constructor(
    aiClient?: AiClient, // Allow injecting AiClient, default to GeminiClient
    options: {
      pollIntervalMs?: number;
      maxAttempts?: number;
      initialDelayMs?: number;
    } = {}, // Provide default options
  ) {
    this.ai = aiClient || new GeminiClient(globalConfig); // Call constructor without model
    this.pollIntervalMs = options.pollIntervalMs ?? 5000; // Default 5 seconds
    this.maxAttempts = options.maxAttempts ?? 6; // Default 6 attempts (approx 30s total)
    this.initialDelayMs = options.initialDelayMs ?? 500; // Default 0.5s initial delay
  }

  /**
   * Polls the output of a background process using an LLM
   * until a conclusive status is determined or timeout occurs.
   * @param pid The handle/identifier of the background process (typically PID number).
   * @param tempStdoutFilePath Path to the temporary file capturing stdout.
   * @param tempStderrFilePath Path to the temporary file capturing stderr.
   * @param command The command string that was executed (for context in prompts).
   * @returns A promise resolving to the final analysis outcome.
   */
  async analyze(
    pid: ProcessHandle,
    tempStdoutFilePath: string,
    tempStderrFilePath: string,
    command: string,
  ): Promise<FinalAnalysisOutcome> {
    // --- Initial Delay ---
    // Wait briefly before the first check to allow the process to initialize
    // and potentially write initial output.
    await new Promise((resolve) => setTimeout(resolve, this.initialDelayMs));

    let attempts = 0;
    let lastAnalysisResult: AnalysisResult | AnalysisFailure | null = null;

    while (attempts < this.maxAttempts) {
      attempts++;
      let currentStdout = '';
      let currentStderr = '';

      // --- Robust File Reading ---
      try {
        currentStdout = await fs.readFile(tempStdoutFilePath, 'utf-8');
      } catch (error: any) {
        // If file doesn't exist yet or isn't readable, treat as empty, but log warning
        if (error.code !== 'ENOENT') {
          console.warn(
            `Attempt ${attempts}: Failed to read stdout file ${tempStdoutFilePath}: ${error.message}`,
          );
        }
      }
      try {
        currentStderr = await fs.readFile(tempStderrFilePath, 'utf-8');
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.warn(
            `Attempt ${attempts}: Failed to read stderr file ${tempStderrFilePath}: ${error.message}`,
          );
        }
      }

      // --- Process Status Check ---
      let isRunning = false;
      try {
        // Check if process is running *before* the final analysis if it seems to have ended
        isRunning = await this.isProcessRunning(pid);
        if (!isRunning) {
          // Reread files one last time in case output was written just before exit
          try {
            currentStdout = await fs.readFile(tempStdoutFilePath, 'utf-8');
          } catch {}
          try {
            currentStderr = await fs.readFile(tempStderrFilePath, 'utf-8');
          } catch {}

          lastAnalysisResult = await this.analyzeOutputWithLLM(
            currentStdout,
            currentStderr,
            command,
          );

          if (isAnalysisFailure(lastAnalysisResult)) {
            return {
              status: 'ProcessEnded_AnalysisFailed',
              summary: `Process ended. Final analysis failed: ${lastAnalysisResult.error}`,
            };
          }
          // Append ProcessEnded to the status determined by the final analysis
          return {
            status: 'ProcessEnded_' + lastAnalysisResult.inferredStatus,
            summary: `Process ended. Final analysis summary: ${lastAnalysisResult.summary}`,
          };
        }
      } catch (procCheckError: any) {
        // Log the error but allow polling to continue, as log analysis might still be useful
        console.warn(
          `Could not check process status for PID ${pid} on attempt ${attempts}: ${procCheckError.message}`,
        );
        // Decide if you want to bail out here or continue analysis based on logs only
        // For now, we continue.
      }

      // --- LLM Analysis ---
      lastAnalysisResult = await this.analyzeOutputWithLLM(
        currentStdout,
        currentStderr,
        command,
      );

      if (isAnalysisFailure(lastAnalysisResult)) {
        console.error(
          `LLM Analysis failed for PID ${pid} on attempt ${attempts}:`,
          lastAnalysisResult.error,
        );
        // Stop polling on analysis failure, returning the specific failure status
        return {
          status: lastAnalysisResult.inferredStatus,
          summary: lastAnalysisResult.error,
        };
      }

      // --- Exit Conditions ---
      if (
        lastAnalysisResult.inferredStatus === 'SuccessReported' ||
        lastAnalysisResult.inferredStatus === 'ErrorReported'
      ) {
        return {
          status: lastAnalysisResult.inferredStatus,
          summary: lastAnalysisResult.summary,
        };
      }

      // Heuristic: If the process seems stable and 'Running' after several checks,
      // return that status without waiting for the full timeout. Adjust threshold as needed.
      const runningExitThreshold = Math.floor(this.maxAttempts / 3) + 1; // e.g., exit after attempt 4 if maxAttempts is 6
      if (
        attempts >= runningExitThreshold &&
        lastAnalysisResult.inferredStatus === 'Running'
      ) {
        return {
          status: lastAnalysisResult.inferredStatus,
          summary: lastAnalysisResult.summary,
        };
      }

      // --- Wait before next poll ---
      if (attempts < this.maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.pollIntervalMs),
        );
      }
    } // End while loop

    // --- Timeout Condition ---
    console.warn(
      `Polling timed out for PID ${pid} after ${this.maxAttempts} attempts.`,
    );

    // Determine final status based on the last successful analysis (if any)
    const finalStatus =
      lastAnalysisResult && !isAnalysisFailure(lastAnalysisResult)
        ? `TimedOut_${lastAnalysisResult.inferredStatus}` // e.g., TimedOut_Running
        : 'TimedOut_AnalysisFailed'; // If last attempt failed or no analysis succeeded

    const finalSummary =
      lastAnalysisResult && !isAnalysisFailure(lastAnalysisResult)
        ? `Polling timed out after ${this.maxAttempts} attempts. Last known summary: ${lastAnalysisResult.summary}`
        : lastAnalysisResult && isAnalysisFailure(lastAnalysisResult)
          ? `Polling timed out; last analysis attempt failed: ${lastAnalysisResult}`
          : `Polling timed out after ${this.maxAttempts} attempts without any successful analysis.`;

    return { status: finalStatus, summary: finalSummary };
  }

  // --- Actual Implementation of isProcessRunning ---
  /**
   * Checks if the background process is still running using OS-specific methods.
   * @param pid Process handle/identifier (expects a number for standard checks).
   * @returns True if running, false otherwise.
   * @throws Error if the check itself fails critically (e.g., command not found, permissions).
   */
  private async isProcessRunning(pid: ProcessHandle): Promise<boolean> {
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
      console.warn(
        `isProcessRunning: Invalid PID provided (${pid}). Assuming not running.`,
      );
      return false;
    }

    try {
      if (process.platform === 'win32') {
        // Windows: Use tasklist command
        const command = `tasklist /FI "PID eq ${pid}" /NH`; // /NH for no header
        const { stdout } = await execAsync(command);
        // Check if the output contains the process information (it will have the image name if found)
        return stdout.toLowerCase().includes('.exe'); // A simple check, adjust if needed
      } else {
        // Linux/macOS/Unix-like: Use kill -0 signal
        // process.kill sends signal 0 to check existence without killing
        process.kill(pid, 0);
        return true; // If no error is thrown, process exists
      }
    } catch (error: any) {
      if (error.code === 'ESRCH') {
        // ESRCH: Standard error code for "No such process" on Unix-like systems
        return false;
      } else if (
        process.platform === 'win32' &&
        error.message.includes('No tasks are running')
      ) {
        // tasklist specific error when PID doesn't exist
        return false;
      } else {
        // Other errors (e.g., EPERM - permission denied) mean we couldn't determine status.
        // Re-throwing might be appropriate depending on desired behavior.
        // Here, we log it and cautiously return true, assuming it *might* still be running.
        console.warn(
          `isProcessRunning(${pid}) encountered error: ${error.message}. Assuming process might still exist.`,
        );
        // Or you could throw the error: throw new Error(`Failed to check process status for PID ${pid}: ${error.message}`);
        return true; // Cautious assumption
      }
    }
  }

  // --- LLM Analysis Method (largely unchanged but added validation robustness) ---
  private async analyzeOutputWithLLM(
    stdout: string,
    stderr: string,
    command: string,
  ): Promise<AnalysisResult | AnalysisFailure> {
    try {
      const schema: SchemaUnion = {
        /* ... schema definition remains the same ... */ type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description:
              "A concise interpretation of significant events, progress, final results, or errors found in the process's stdout and stderr. Summarizes what the logs indicate happened. Should be formatted as markdown.",
          },
          inferredStatus: {
            type: Type.STRING,
            description:
              "The inferred status based *only* on analyzing the provided log content. Possible values: 'Running' (logs show ongoing activity without completion/error), 'SuccessReported' (logs indicate successful completion or final positive result), 'ErrorReported' (logs indicate an error or failure), 'Unknown' (status cannot be clearly determined from the log content).",
            enum: ['Running', 'SuccessReported', 'ErrorReported', 'Unknown'],
          },
        },
        required: ['summary', 'inferredStatus'],
      };

      const prompt = `**Analyze Background Process Logs**

**Context:** A command (\`${command}\`) was executed in the background. You are analyzing the standard output (stdout) and standard error (stderr) collected so far to understand its progress and outcome. This analysis will be used to inform a user about what the command did.

**Input:**
* **Command:** \`${command}\`
* **Stdout:**
    \`\`\`
    ${stdout.slice(-2000) || '(empty)'} ${stdout.length > 2000 ? '\n... (truncated)' : ''}
    \`\`\`
* **Stderr:**
    \`\`\`
    ${stderr.slice(-2000) || '(empty)'} ${stderr.length > 2000 ? '\n... (truncated)' : ''}
    \`\`\`

**Task:**

Based *only* on the provided stdout and stderr:

1.  **Interpret and Summarize:** Do *not* simply repeat the logs. Analyze the content and provide a concise summary describing the significant actions, results, progress, or errors reported by the command. If logs are empty, state that no output was captured. Summaries should be formatted as markdown. Focus on the most recent or conclusive information if logs are long.
2.  **Infer Current Status:** Based *only* on the log content, infer the likely status of the command's execution as reflected *in the logs*. Choose the most appropriate status from the options defined in the schema (\`Running\`, \`SuccessReported\`, \`ErrorReported\`, \`Unknown\`). For example:
    * If logs show ongoing activity or progress messages without clear completion or error signals, use \`Running\`.
    * If logs contain explicit messages indicating successful completion or the final expected output of a successful run, use \`SuccessReported\`.
    * If logs contain error messages, stack traces, or failure indications, use \`ErrorReported\`.
    * If the logs provide insufficient information to determine a clear status (e.g., empty logs, vague messages), use \`Unknown\`.
    * If dealing with a node server, the second the port has been shown the server is considered booted, use \`SuccessReported\`.
    * *Note: This status reflects the log content, not necessarily the absolute real-time state of the OS process.*
3.  **Format Output:** Return the results as a JSON object adhering strictly to the following schema:

    \`\`\`json
    ${JSON.stringify(
      {
        // Generate the schema JSON string for the prompt context
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Concise markdown summary of log interpretation.',
          },
          inferredStatus: {
            type: 'string',
            enum: ['Running', 'SuccessReported', 'ErrorReported', 'Unknown'],
            description: 'Status inferred *only* from log content.',
          },
        },
        required: ['summary', 'inferredStatus'],
      },
      null,
      2,
    )}
    \`\`\`

**Instructions:**
* The \`summary\` must be an interpretation of the logs, focusing on key outcomes or activities. Prioritize recent events if logs are extensive.
* The \`inferredStatus\` should reflect the most likely state *deduced purely from the log text provided*. Ensure it is one of the specified enum values.`;

      const response = await this.ai.generateJson(
        [{ role: 'user', parts: [{ text: prompt }] }],
        schema,
      );

      // --- Enhanced Validation ---
      if (typeof response !== 'object' || response === null) {
        throw new Error(
          `LLM returned non-object response: ${JSON.stringify(response)}`,
        );
      }
      if (
        typeof response.summary !== 'string' ||
        response.summary.trim() === ''
      ) {
        // Ensure summary is a non-empty string
        console.warn(
          "LLM response validation warning: 'summary' field is missing, empty or not a string. Raw response:",
          response,
        );
        // Decide how to handle: throw error, or assign default? Let's throw for now.
        throw new Error(
          `LLM response missing or invalid 'summary'. Got: ${JSON.stringify(response.summary)}`,
        );
      }
      if (
        !['Running', 'SuccessReported', 'ErrorReported', 'Unknown'].includes(
          response.inferredStatus,
        )
      ) {
        console.warn(
          `LLM response validation warning: 'inferredStatus' is invalid ('${response.inferredStatus}'). Raw response:`,
          response,
        );
        // Decide how to handle: throw error, or default to 'Unknown'? Let's throw.
        throw new Error(
          `LLM returned invalid 'inferredStatus': ${JSON.stringify(response.inferredStatus)}`,
        );
      }

      return response as AnalysisResult; // Cast after validation
    } catch (error: any) {
      console.error(
        `LLM analysis call failed for command "${command}":`,
        error,
      );
      // Ensure the error message passed back is helpful
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        error: `LLM analysis call encountered an error: ${errorMessage}`,
        inferredStatus: 'AnalysisFailed',
      };
    }
  }
}
