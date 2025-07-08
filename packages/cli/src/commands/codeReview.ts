// packages/cli/src/commands/codeReview.ts
// Pyrmethus, the Termux Coding Wizard, conjures a spell to review code quality.

import { Command } from '@oclif/core';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { Fore, Style, init } from 'colorama';

init();

// Chromatic constants for enchanted logging
const NG = Fore.LIGHTGREEN_EX + Style.BRIGHT; // Success
const NB = Fore.CYAN + Style.BRIGHT; // Information
const NP = Fore.MAGENTA + Style.BRIGHT; // Headers, prompts
const NY = Fore.YELLOW + Style.BRIGHT; // Warnings
const NR = Fore.LIGHTRED_EX + Style.BRIGHT; // Errors
const RST = Style.RESET_ALL; // Reset

export default class CodeReview extends Command {
  static description = `${NP}Analyzes code for quality issues and provides suggestions.${RST}`;

  static examples = [
    `${NG}<%= config.bin %> <%= command.id %> <filePath>${RST}`,
  ];

  static args = [
    {
      name: 'filePath',
      required: true,
      description: 'Path to the file to review.',
    },
  ];

  public async run(): Promise<void> {
    const { args } = await this.parse(CodeReview);
    const filePath = args.filePath as string;
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
      const { stdout, stderr } = await run_shell_command({
        command: `npx eslint --format json ${filePath}`,
        description: `Running ESLint on ${filePath}`,
      });

      if (stderr) {
        this.log(`${NY}ESLint encountered warnings or errors: ${stderr}${RST}`);
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
      const { stdout, stderr } = await run_shell_command({
        command: `ruff check --output-format=json ${filePath}`,
        description: `Running Ruff on ${filePath}`,
      });

      if (stderr) {
        this.log(`${NY}Ruff encountered warnings or errors: ${stderr}${RST}`);
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
