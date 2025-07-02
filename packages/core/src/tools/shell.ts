import { exec } from 'child_process';
import util from 'util';
import { Tool } from '../types/toolTypes';
import { logger } from '../utils/logger'; // Assuming logger path

const execAsync = util.promisify(exec);

export interface ShellArgs {
  command: string;
}

// List of potentially dangerous commands to block
const DANGEROUS_COMMANDS = [
  'rm -rf',
  'mkfs.',
  'dd ',
  'fdisk ',
  'format ',
  'reboot ',
  'shutdown ',
  // TODO: This list should be configurable or more robust via config.ts
];

export const shellTool: Tool<ShellArgs, string> = {
  name: 'Shell',
  description: 'Executes a shell command.',
  async execute(args: ShellArgs): Promise<string> {
    const { command } = args;

    if (!command) {
      const errMsg = 'Command is required for Shell tool.';
      logger.error(`ShellTool: ${errMsg}`);
      throw new Error(errMsg);
    }

    for (const dangerousCmd of DANGEROUS_COMMANDS) {
      if (command.toLowerCase().includes(dangerousCmd.toLowerCase())) {
        const errMsg = `Execution of command "${command}" containing "${dangerousCmd}" is blocked for safety reasons.`;
        logger.warn(`ShellTool: ${errMsg}`);
        throw new Error(errMsg);
      }
    }

    logger.info(`ShellTool: Executing command: ${command}`);

    try {
      const { stdout, stderr } = await execAsync(command);
      let outputMessage = `Command "${command}" executed.`;
      let outputDetails = "";

      if (stdout) {
        outputDetails += `Stdout:\n${stdout}`;
      }
      if (stderr) {
        // Stderr is not always an error; some commands output informational messages to stderr.
        // Log it as a warning for review, but include in output.
        logger.warn(`ShellTool: Command "${command}" produced Stderr:\n${stderr}`);
        outputDetails += `${stdout ? '\n' : ''}Stderr:\n${stderr}`;
      }

      if (!stdout && !stderr) {
        outputDetails = "(no stdout/stderr)";
      }

      logger.info(`ShellTool: ${outputMessage} ${outputDetails}`);
      return `${outputMessage}\n${outputDetails}`.trim();
    } catch (error: any) {
      const baseErrorMessage = `Failed to execute command: "${command}". Reason: ${error.message}`;
      // error object from execAsync might contain stdout/stderr from the failed command
      const stderrContent = error.stderr ? `\nStderr: ${error.stderr}` : '';
      const stdoutContent = error.stdout ? `\nStdout: ${error.stdout}` : '';
      const detailedErrorMessage = `${baseErrorMessage}${stderrContent}${stdoutContent}`;

      logger.error(`ShellTool: ${detailedErrorMessage}`, { error });
      throw new Error(detailedErrorMessage);
    }
  },
};
