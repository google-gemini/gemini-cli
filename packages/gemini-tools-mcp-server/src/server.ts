import { McpServer, McpServerOptions, ToolExecuteRequest } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { FunctionDeclarationSchema } from '@modelcontextprotocol/sdk/shared';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

interface ToolSchema {
  name: string;
  description: string;
  parameterSchema: Record<string, unknown>;
}

async function main() {
  // Path to tool-schemas.json, assuming the server is run from the monorepo root
  // or the path is adjusted accordingly.
  const schemasPath = path.resolve(process.cwd(), 'dist/tool-schemas.json');
  let toolSchemas: ToolSchema[];

  try {
    const schemasFileContent = fs.readFileSync(schemasPath, 'utf-8');
    toolSchemas = JSON.parse(schemasFileContent) as ToolSchema[];
  } catch (error) {
    console.error(`Failed to load tool schemas from ${schemasPath}:`, error);
    process.exit(1);
  }

  const serverOptions: McpServerOptions = {
    name: 'gemini-cli-tools-server',
    version: '0.1.0',
  };
  const server = new McpServer(serverOptions);

  for (const schema of toolSchemas) {
    server.registerTool(
      schema.name,
      {
        title: schema.name, // Or a more descriptive title if available
        description: schema.description,
        inputSchema: schema.parameterSchema as FunctionDeclarationSchema, // Cast needed
      },
      async (request: ToolExecuteRequest) => {
        // Command to execute. Assumes this server is run from the monorepo root.
        // A more robust solution might involve finding the script path dynamically.
        const command = 'node';
        const scriptPath = path.resolve(process.cwd(), 'packages/cli/dist/execute-tool-cli.js');

        const args = [
          scriptPath,
          request.toolName,
          JSON.stringify(request.input),
          '--target-dir', // Pass the current working dir of the MCP server as target-dir
          process.cwd(), // Or make this configurable if tools need different target dirs
        ];

        return new Promise((resolve, reject) => {
          const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });

          let stdoutData = '';
          let stderrData = '';

          child.stdout.on('data', (data) => {
            stdoutData += data.toString();
          });

          child.stderr.on('data', (data) => {
            stderrData += data.toString();
          });

          child.on('close', (code) => {
            if (stderrData) { // Prioritize stderr for errors
              try {
                // Try to parse stderr as JSON, assuming our CLI command outputs JSON errors
                const errorOutput = JSON.parse(stderrData);
                 reject(new Error(errorOutput.error || stderrData));
              } catch (e) {
                // If not JSON, just use the raw stderr
                 reject(new Error(stderrData));
              }
              return;
            }

            if (code !== 0) {
              reject(new Error(`Tool execution failed with code ${code}. Output: ${stdoutData}`));
              return;
            }

            try {
              const result = JSON.parse(stdoutData);
              // The MCP SDK expects `content` which usually is an array of Parts.
              // result.llmContent from our CLI command is already in the Part[] format.
              // result.returnDisplay is also available if needed for richer MCP responses,
              // but for now, we'll focus on llmContent.
              if (result.llmContent) {
                 resolve({ content: result.llmContent });
              } else {
                 reject(new Error('Tool executed but llmContent was missing from the output.'));
              }
            } catch (e) {
              reject(new Error(`Failed to parse tool output: ${(e as Error).message}. Raw output: ${stdoutData}`));
            }
          });

          child.on('error', (err) => {
            reject(new Error(`Failed to start tool process: ${err.message}`));
          });
        });
      }
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Gemini Tools MCP Server connected via Stdio.'); // MCP uses stderr for logs
}

main().catch(error => {
  console.error('Failed to start Gemini Tools MCP Server:', error);
  process.exit(1);
});
