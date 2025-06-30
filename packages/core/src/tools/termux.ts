import { exec } from 'child_process';
import util from 'util';
import { Tool } from '../types/toolTypes';
import { logger } from '../core/logger.js';

const execAsync = util.promisify(exec);

export interface TermuxToastArgs {
  message: string;
  duration?: 'short' | 'long';
}

export const termuxToastTool: Tool<TermuxToastArgs, string> = {
  name: 'TermuxToast',
  description: 'Displays a toast message using Termux API.',
  async execute(args: TermuxToastArgs): Promise<string> {
    const { message, duration = 'short' } = args;

    if (!message) {
      const errMsg = 'Message is required for TermuxToast tool.';
      logger.error(`TermuxToastTool: ${errMsg}`);
      throw new Error(errMsg);
    }

    const durationFlag = duration === 'long' ? '-l' : '';
    // Basic escaping of double quotes for the message content to be safe in shell command
    const escapedMessage = message.replace(/"/g, '\\"');
    const command = `termux-toast ${durationFlag} "${escapedMessage}"`;

    logger.info(`TermuxToastTool: Executing command: ${command}`);

    try {
      await execAsync(command);
      const successMsg = `Toast displayed: "${message}"`; // Log original message for clarity
      logger.info(`TermuxToastTool: ${successMsg}`);
      return successMsg;
    } catch (error: any) {
      const baseErrorMessage = `Failed to display toast. Make sure termux-api is installed and running. Reason: ${error.message}`;
      const stderrContent = error.stderr ? `\nStderr: ${error.stderr}` : '';
      const detailedErrorMessage = `${baseErrorMessage}${stderrContent}`;

      logger.error(`TermuxToastTool: ${detailedErrorMessage}`, { command, error });
      throw new Error(detailedErrorMessage);
    }
  },
};
