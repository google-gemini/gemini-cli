// packages/cli/src/commands/codeReview.ts
// Pyrmethus, the Termux Coding Wizard, conjures a spell to review code quality.

import { Command, Args } from '@oclif/core'; // Removed Flags
import { existsSync } from 'fs';
import { join, extname } from 'path';
import chalk from 'chalk';
import { ShellTool, Config, ApprovalMode, DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_EMBEDDING_MODEL, TelemetryTarget } from '@google/gemini-cli-core';
// import os from 'os'; // No longer needed for Config construction here
// import { Logger } from '@google/gemini-cli-core'; // Oclif's logger is used via this.log

// Chromatic constants for enchanted logging
const NG = chalk.green.bold; // Success
const NB = chalk.cyan.bold; // Information
const NP = chalk.magenta.bold; // Headers, prompts
const NY = chalk.yellow.bold; // Warnings
const NR = chalk.red.bold; // Errors
const RST = chalk.reset; // Reset

export default class CodeReview extends Command {
  static description = `${NP}Analyzes code for quality issues and provides suggestions.${RST}`;

  static examples = [
    `${NG}<%= config.bin %> <%= command.id %> <filePath>${RST}`,
  ];

  static args = {
    filePath: Args.string({ // Changed from Flags.string to Args.string
      name: 'filePath',
      required: true,
      description: 'Path to the file to review.',
    }),
  };

  private shellTool: ShellTool;
  private commandConfig: Config; // Basic config for the tool

  constructor(argv: string[], config: any) {
    super(argv, config);
    // Instantiate a basic Config for the ShellTool
    const configParams: import('@google/gemini-cli-core').ConfigParameters = {
      sessionId: 'code-review-session',
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
  }

  public async run(): Promise<void> {
    const { args } = await this.parse(CodeReview);
    const filePath = args.filePath as string; // filePath will be a string due to Flags.string
    const absolutePath = join(process.cwd(), filePath);

    this.log(NP + `Summoning the code review spirits for ${filePath}...` + RST);

    if (!existsSync(absolutePath)) {
      this.log(`${NR}Error: File not found at ${filePath}${RST}`);
      return;
    }

    const fileExtension = extname(filePath);

    switch (fileExtension) {
      case '.js':
      case '.ts':
        await this.reviewJavaScriptTypeScript(absolutePath);
        break;
      case '.py':
        await this.reviewPython(absolutePath);
        break;
      default:
        this.log(
          `${NY}Unsupported file type for code review: ${fileExtension}${RST}`,
        );
        this.log(
          `${NB}Pyrmethus currently supports .js, .ts, and .py files for code review.${RST}`,
        );
    }

    this.log(NG + 'Code review complete. May your code be pure.' + RST);
  }

  private async reviewJavaScriptTypeScript(filePath: string): Promise<void> {
    this.log(NB + `Channeling ESLint for ${filePath}...` + RST);
    try {
      // Use ShellTool instance
      const result = await this.shellTool.execute({
        command: `npx eslint --format json ${filePath}`,
        description: `Running ESLint on ${filePath}`,
      }, new AbortController().signal); // Provide an AbortSignal

      // result.llmContent contains the structured output.
      // result.returnDisplay contains a user-friendly display string.
      // For this command, we parse the JSON from llmContent if successful.
      // The llmContent structure for ShellTool is:
      // Command: ...
      // Directory: ...
      // Stdout: ...  <-- This is what we need
      // Stderr: ...
      // Error: ...
      // Exit Code: ...
      // Signal: ...

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
      let stdout = "";
      let stderr = "";
      let exitCode: number | null = null;

      const lines = llmTextOutput.split('\n');
      lines.forEach(line => {
        if (line.startsWith("Stdout: ")) stdout = line.substring("Stdout: ".length).trim();
        if (line.startsWith("Stderr: ")) stderr = line.substring("Stderr: ".length).trim();
        if (line.startsWith("Exit Code: ")) {
          const codeStr = line.substring("Exit Code: ".length).trim();
          if (codeStr !== '(none)') exitCode = parseInt(codeStr, 10);
        }
      });

      if (stdout === "(empty)") stdout = ""; // Normalize "(empty)"
      if (stderr === "(empty)") stderr = "";


      if (stderr) {
        this.log(`${NY}ESLint encountered warnings or errors: ${stderr}${RST}`);
      }

      if (!stdout && (exitCode !== 0 && exitCode !== null)) {
        this.log(`${NR}ESLint command failed or produced no JSON output. Exit code: ${exitCode}. Stderr: ${stderr}${RST}`);
        return;
      }

      if (!stdout) {
         this.log(NG + `No ESLint issues found in ${filePath} (no output). Your JavaScript/TypeScript is harmonious.` + RST);
        return;
      }

      const results = JSON.parse(stdout);

      if (results.length === 0 || results[0].messages.length === 0) {
        this.log(
          NG +
            `No ESLint issues found in ${filePath}. Your JavaScript/TypeScript is harmonious.` +
            RST,
        );
        return;
      }

      this.log(NP + `--- ESLint Report for ${filePath} ---` + RST);
      results[0].messages.forEach((message: any) => {
        const severity = message.severity === 2 ? NR + 'ERROR' : NY + 'WARNING';
        this.log(
          `${severity}: Line ${message.line}, Col ${message.column} - ${message.message} (${message.ruleId})${RST}`,
        );
      });
      this.log(
        NY +
          `
Consider running: ${NG}npm run lint:fix${NY} to automatically resolve some issues, or manually address them.${RST}`,
      );
    } catch (error: any) {
      this.log(
        `${NR}Failed to run ESLint: ${error.message}. Ensure ESLint is installed and configured.${RST}`,
      );
      this.log(
        `${NB}You might need to run: ${NG}npm install eslint @eslint/js${NB} or similar, depending on your project setup.${RST}`,
      );
    }
  }

  private async reviewPython(filePath: string): Promise<void> {
    this.log(NB + `Channeling Ruff for ${filePath}...` + RST);
    try {
      // Use ShellTool instance
      const result = await this.shellTool.execute({
        command: `ruff check --output-format=json ${filePath}`,
        description: `Running Ruff on ${filePath}`,
      }, new AbortController().signal); // Provide an AbortSignal

      // Helper to extract text from PartListUnion (can be defined at class level or module level if preferred)
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
      let stdout = "";
      let stderr = "";
      let exitCode: number | null = null;

      const lines = llmTextOutput.split('\n');
      lines.forEach(line => {
        if (line.startsWith("Stdout: ")) stdout = line.substring("Stdout: ".length).trim();
        if (line.startsWith("Stderr: ")) stderr = line.substring("Stderr: ".length).trim();
        if (line.startsWith("Exit Code: ")) {
          const codeStr = line.substring("Exit Code: ".length).trim();
          if (codeStr !== '(none)') exitCode = parseInt(codeStr, 10);
        }
      });

      if (stdout === "(empty)") stdout = ""; // Normalize "(empty)"
      if (stderr === "(empty)") stderr = "";

      if (stderr) {
        this.log(`${NY}Ruff encountered warnings or errors: ${stderr}${RST}`);
      }

      if (!stdout && (exitCode !== 0 && exitCode !== null)) {
        this.log(`${NR}Ruff command failed or produced no JSON output. Exit code: ${exitCode}. Stderr: ${stderr}${RST}`);
        return;
      }

      if (!stdout) {
        this.log(NG + `No Ruff issues found in ${filePath} (no output). Your Python is harmonious.` + RST);
        return;
      }

      const results = JSON.parse(stdout);

      if (results.length === 0) {
        this.log(
          NG +
            `No Ruff issues found in ${filePath}. Your Python is harmonious.` +
            RST,
        );
        return;
      }

      this.log(NP + `--- Ruff Report for ${filePath} ---` + RST);
      results.forEach((message: any) => {
        this.log(
          `${NR}ERROR: Line ${message.location.row}, Col ${message.location.column} - ${message.message} (${message.code})${RST}`,
        );
      });
      this.log(
        NY +
          `
Consider running: ${NG}ruff format ${filePath} && ruff check --fix ${filePath}${NY} to automatically resolve some issues, or manually address them.${RST}`,
      );
    } catch (error: any) {
      this.log(
        `${NR}Failed to run Ruff: ${error.message}. Ensure Ruff is installed (pip install ruff).${RST}`,
      );
    }
  }
}
