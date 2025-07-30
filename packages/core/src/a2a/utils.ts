import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const textResponse = (message: string): CallToolResult => {
  return {
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
  };
};
