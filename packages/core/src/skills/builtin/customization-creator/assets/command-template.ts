/* eslint-disable no-restricted-imports */
import { defineCommand } from '@google/gemini-cli-core';

export default defineCommand({
  name: 'my-command',
  description: 'Description of what this command does.',
  usage: '/my-command [args]',
  async run(context, args) {
    // Access UI, file system, or execute shell commands via context
    context.ui.print('Running my custom command...');
    
    // Example: Read arguments
    const arg = args[0] || 'default';
    
    // Example: Return a response to the chat
    return `Command executed with argument: ${arg}`;
  },
});
