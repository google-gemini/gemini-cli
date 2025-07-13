// packages/cli/src/commands/debugAssist.ts
// Pyrmethus, the Termux Coding Wizard, conjures a spell for interactive debugging assistance.

import { Command, Args } from '@oclif/core'; // Removed Flags
import { readFileSync, existsSync } from 'fs'; // writeFileSync was unused
import { join } from 'path';
import chalk from 'chalk';
// Import tools and Config
import {
  ShellTool,
  EditTool,
  Config,
  // Logger, // Oclif's logger is used
  ApprovalMode,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  TelemetryTarget,
  EditToolParams // For EditTool
} from '@google/gemini-cli-core';
// import os from 'os'; // No longer needed for Config construction here
import * as readline from 'readline';



// Chromatic constants for enchanted logging
const NG = chalk.green.bold; // Success
const NB = chalk.cyan.bold; // Information
const NP = chalk.magenta.bold; // Headers, prompts
const NY = chalk.yellow.bold; // Warnings
const NR = chalk.red.bold; // Errors
const RST = chalk.reset; // Reset

export default class DebugAssist extends Command {
  static description = `${NP}Provides interactive, guided debugging assistance.${RST}`;

  static examples = [
    `${NG}<%= config.bin %> <%= command.id %> <codeOrPath> [errorMsg]${RST}`,
  ];

  static args = {
    codeOrPath: Args.string({ // Changed from Flags.string
      name: 'codeOrPath',
      required: true,
      description: 'Code snippet or path to the file to debug.',
    }),
    errorMsg: Args.string({ // Changed from Flags.string
      name: 'errorMsg',
      required: false, // Optional arguments must have required: false (or not set, as it defaults to false for Args)
      description: 'Optional error message to provide context.',
    }),
  };

  private rl: readline.Interface | undefined;
  private shellTool: ShellTool;
  private editTool: EditTool;
  private commandConfig: Config;

  constructor(argv: string[], config: any) {
    super(argv, config);
    const configParams: import('@google/gemini-cli-core').ConfigParameters = {
      sessionId: 'debug-assist-session',
      targetDir: process.cwd(),
      approvalMode: ApprovalMode.DEFAULT,
      model: DEFAULT_GEMINI_MODEL,
      embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL,
      debugMode: false,
      fullContext: false,
      mcpServers: {},
      excludeTools: [],
      telemetry: {
        enabled: false,
        target: TelemetryTarget.LOCAL,
        otlpEndpoint: undefined,
        logPrompts: false,
      },
      checkpointing: false,
      cwd: process.cwd(),
    };
    this.commandConfig = new Config(configParams);
    this.shellTool = new ShellTool(this.commandConfig);
    this.editTool = new EditTool(this.commandConfig);
  }

  public async run(): Promise<void> {
    const { args } = await this.parse(DebugAssist);
    // Args are already correctly typed by oclif Flags
    const codeOrPath = args.codeOrPath!;
    const errorMsg = args.errorMsg;

    this.log(NP + 'Summoning the debugging spirits...' + RST);

    let codeContent: string | undefined;
    let isFilePath = false;

    if (existsSync(join(process.cwd(), codeOrPath))) {
      isFilePath = true;
      codeContent = readFileSync(join(process.cwd(), codeOrPath), 'utf8');
      this.log(NB + `Analyzing file: ${codeOrPath}` + RST);
    } else {
      codeContent = codeOrPath;
      this.log(NB + 'Analyzing code snippet...' + RST);
    }

    if (!codeContent) {
      this.log(`${NR}Error: No code or file content to debug.${RST}`);
      return;
    }

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    await this.startDebuggingSession(codeContent, isFilePath, errorMsg);

    this.rl.close();
    this.log(
      NG + 'Debugging session complete. May your code be bug-free.' + RST,
    );
  }

  private async askQuestion(query: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl?.question(NP + query + RST + ' ', (answer) => {
        resolve(answer.trim());
      });
    });
  }

  private async startDebuggingSession(
    code: string,
    isFilePath: boolean,
    initialErrorMsg?: string,
  ): Promise<void> {
    let currentCode = code;
    let currentError = initialErrorMsg;
    let step = 0;

    while (true) {
      step++;
      this.log(NB + `\n--- Debugging Step ${step} ---` + RST);

      if (currentError) {
        this.log(`${NR}Observed Error: ${currentError}${RST}`);
      }

      this.log(NB + 'Current Code:' + RST);
      this.log(currentCode);

      const suggestion = await this.getDebuggingSuggestion(
        currentCode,
        currentError,
      );
      this.log(NG + `Suggestion: ${suggestion.suggestionText}${RST}`);

      if (suggestion.action === 'fix') {
        const confirmFix = await this.askQuestion('Apply this fix? (yes/no):');
        if (confirmFix.toLowerCase() === 'yes') {
          const { args } = await this.parse(DebugAssist);
          const targetFilePath = join(process.cwd(), args.codeOrPath!);

          if (isFilePath) {
            try {
              const editParams: EditToolParams = {
                file_path: targetFilePath,
                old_string: suggestion.oldCode || '',
                new_string: suggestion.newCode || '',
                count: suggestion.expectedReplacements || 1,
                // Add other EditToolParams as needed, e.g., use_regex if applicable
              };
              // We might need to handle confirmation for EditTool here or ensure ApprovalMode.AUTO works.
              // For simplicity, assuming direct execution if user confirmed the high-level fix.
              await this.editTool.execute(editParams, new AbortController().signal);
              this.log(NG + 'Fix applied to file.' + RST);
              currentCode = suggestion.newCode || currentCode; // Update local code representation
            } catch (e: any) {
              this.log(`${NR}Failed to apply fix to file: ${e.message}${RST}`);
            }
          } else {
            // For snippets, the "fix" is just updating the string in memory
            currentCode = suggestion.newCode || currentCode;
            this.log(NG + 'Fix applied to snippet.' + RST);
          }
        }
      } else if (suggestion.action === 'run') {
        const confirmRun = await this.askQuestion(
          'Run this command? (yes/no):',
        );
        if (confirmRun.toLowerCase() === 'yes') {
          try {
            const result = await this.shellTool.execute({
              command: suggestion.command || '',
              description: 'Executing suggested command',
            }, new AbortController().signal);

            // Helper to extract text from PartListUnion
            const getTextFromParts = (parts: import('@google/genai').PartListUnion | undefined): string => {
              if (!parts) return "";
              let textContent = "";
              const partArray = Array.isArray(parts) ? parts : [parts];

              for (const part of partArray) {
                if (typeof part === 'string') {
                  textContent += part;
                } else if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
                  textContent += part.text;
                }
              }
              return textContent;
            };

            const llmTextOutput = getTextFromParts(result.llmContent);
            let cmdStdout = "";
            let cmdStderr = "";
            const lines = llmTextOutput.split('\n');
            lines.forEach(line => {
              if (line.startsWith("Stdout: ")) cmdStdout = line.substring("Stdout: ".length).trim();
              if (line.startsWith("Stderr: ")) cmdStderr = line.substring("Stderr: ".length).trim();
            });
            if (cmdStdout === "(empty)") cmdStdout = "";
            if (cmdStderr === "(empty)") cmdStderr = "";

            this.log(NB + 'Command Output (stdout):\n' + cmdStdout + RST);
            if (cmdStderr) {
              this.log(NY + 'Command Output (stderr):\n' + cmdStderr + RST);
              currentError = cmdStderr; // Update error for next iteration
            } else {
              currentError = undefined; // Clear error if command ran without stderr
            }
          } catch (e: any) {
            this.log(`${NR}Failed to execute command: ${e.message}${RST}`);
            currentError = e.message; // Update error for next iteration
          }
        }
      }

      const continueDebugging = await this.askQuestion(
        'Continue debugging? (yes/no/exit):',
      );
      if (
        continueDebugging.toLowerCase() === 'no' ||
        continueDebugging.toLowerCase() === 'exit'
      ) {
        break;
      }

      // If continuing, ask for new error or observation
      currentError = await this.askQuestion(
        'Any new error messages or observations? (Leave empty if none):',
      );
      if (currentError === '') {
        currentError = undefined;
      }
    }
  }

  private async getDebuggingSuggestion(
    code: string,
    errorMsg?: string,
  ): Promise<{
    suggestionText: string;
    action: 'fix' | 'run' | 'info';
    oldCode?: string;
    newCode?: string;
    command?: string;
    expectedReplacements?: number;
  }> {
    // This is where the core AI logic would be. For now, a placeholder.
    // In a real scenario, this would call the Gemini API with the code and error.
    let prompt = `I am debugging the following code:\n\`\`\`\n${code}\n\`\`\``;
    if (errorMsg) {
      prompt += `\nI am encountering this error: ${errorMsg}`;
    }
    prompt += `\n\nBased on this, provide a concise debugging suggestion. If it's a code fix, provide the old and new code. If it's a command to run, provide the command. Otherwise, provide an informational suggestion. Format your response as a JSON object with 'suggestionText', 'action' ('fix', 'run', 'info'), and optional 'oldCode', 'newCode', 'command', 'expectedReplacements'.`;

    // Simulate AI response for now
    // In a real implementation, this would be a call to the Gemini API
    // For demonstration, let's provide a simple mock response.
    if (errorMsg && errorMsg.includes('TypeError') && code.includes('+')) {
      return {
        suggestionText:
          'It seems like a TypeError, possibly due to incorrect type concatenation. Consider converting variables to numbers before addition.',
        action: 'fix',
        oldCode: "result = add_numbers('5'), '3')",
        newCode: "result = add_numbers(parseInt('5'), parseInt('3'))",
        expectedReplacements: 1,
      };
    } else if (code.includes('console.log') && !errorMsg) {
      return {
        suggestionText:
          'The code seems to be logging. Try running it to see the output.',
        action: 'run',
        command: 'node -e \"' + code.replace(/\n/g, '\n') + '\"', // Escape newlines for shell
      };
    } else {
      return {
        suggestionText:
          'Please provide more context or a specific error message for a better suggestion.',
        action: 'info',
      };
    }
  }
}
