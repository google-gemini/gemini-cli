import { MCPClient } from '@mastra/mcp';
import * as dotenv from 'dotenv';

dotenv.config();

// GitHub MCP Client Configuration
export const githubMCPClient = new MCPClient({
  servers: {
    github: {
      url: new URL(process.env.GITHUB_MCP_SERVER_URL || 'http://localhost:3001/mcp'),
      requestInit: {
        headers: {
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
    },
  },
});

// Helper function to get tools
export const githubTools = await githubMCPClient.getTools();