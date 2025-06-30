import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
  Config,
  ConfigParameters,
  createToolRegistry, // Assuming createToolRegistry is the way to get it if config.getToolRegistry() needs prior async setup
  ToolCallRequestInfo,
  AuthType,
  executeToolCall, // Assuming this is the correct import path
  sessionId,
} from '@google/gemini-cli-core';
import { loadSettings } from './config/settings.js'; // For default settings
import { loadExtensions } from './config/extension.js'; // For default settings
import { loadCliConfig } from './config/config.js'; // To get a fully initialized config

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .command('$0 <tool-name> [tool-args]', 'Execute a Gemini tool directly', (y) => {
      return y
        .positional('tool-name', {
          describe: 'The name of the tool to execute',
          type: 'string',
          demandOption: true,
        })
        .positional('tool-args', {
          describe: 'JSON string of arguments for the tool',
          type: 'string',
          default: '{}',
        });
    })
    .option('target-dir', {
      alias: 'd',
      type: 'string',
      description: 'The target directory for the tool execution',
      default: process.cwd(),
    })
    .option('debug-mode', {
      type: 'boolean',
      description: 'Enable debug mode',
      default: false,
    })
    .help()
    .alias('h', 'help')
    .parseAsync();

  const toolName = argv.toolName as string;
  const toolArgsString = argv.toolArgs as string;

  let parsedToolArgs: Record<string, unknown>;
  try {
    parsedToolArgs = JSON.parse(toolArgsString);
  } catch (e) {
    console.error(JSON.stringify({ error: 'Invalid JSON string for tool-args', details: (e as Error).message }));
    process.exit(1);
  }

  try {
    // Simplified config setup, might need more from gemini.tsx for full fidelity
    // However, for direct tool execution, many UI or LLM related configs might not be needed.
    const workspaceRoot = argv.targetDir || process.cwd();
    const settings = loadSettings(workspaceRoot);
    if (settings.errors.length > 0) {
        //Simplified error handling for CLI
        console.error(JSON.stringify({ error: "Error loading settings", details: settings.errors }));
        process.exit(1);
    }
    const extensions = loadExtensions(workspaceRoot);

    // Use loadCliConfig to get a fully initialized Config object
    // This is more robust as it mirrors the main CLI's config loading.
    const config = await loadCliConfig(settings.merged, extensions, sessionId);

    // Ensure auth is refreshed to initialize tool registry etc.
    // Use a default auth type if not specified, as some tools might not need auth,
    // but refreshAuth initializes critical components like the toolRegistry.
    const authTypeToUse = settings.merged.selectedAuthType || AuthType.NONE; // Or API_KEY if preferred as default
    await config.refreshAuth(authTypeToUse);


    const toolRegistry = await config.getToolRegistry();
    if (!toolRegistry) {
        console.error(JSON.stringify({ error: "Failed to initialize tool registry" }));
        process.exit(1);
    }

    const requestInfo: ToolCallRequestInfo = {
      callId: `${toolName}-${Date.now()}`, // Simple unique ID for the call
      name: toolName,
      args: parsedToolArgs,
      isClientInitiated: true, // Marking it as client-initiated
    };

    const result = await executeToolCall(config, requestInfo, toolRegistry);

    // executeToolCall returns ToolCallResponseInfo. We want to output something
    // that contains both llmContent and returnDisplay if possible.
    // For now, let's assume the MCP server will mostly care about llmContent.
    // A more structured output would be:
    // { llmContent: result.responseParts, displayContent: result.resultDisplay, error: result.error }

    if (result.error) {
      console.error(JSON.stringify({
        error: `Error executing tool: ${toolName}`,
        details: result.error.message,
        llmContent: result.responseParts, // Include this as it might contain error details for LLM
        returnDisplay: result.resultDisplay
      }));
      process.exit(1);
    }

    // Success: output the core results.
    // The actual ToolResult (with llmContent and returnDisplay) is somewhat embedded.
    // llmContent is in result.responseParts (often as FunctionResponsePart)
    // resultDisplay is directly available.
    console.log(JSON.stringify({
      llmContent: result.responseParts,
      returnDisplay: result.resultDisplay
    }, null, 2));

  } catch (e) {
    console.error(JSON.stringify({ error: `Failed to execute tool ${toolName}`, details: (e as Error).message, stack: (e as Error).stack }));
    process.exit(1);
  }
}

main().catch(err => {
  console.error(JSON.stringify({ error: "Unhandled error in execute-tool-cli", details: (err as Error).message, stack: (err as Error).stack }));
  process.exit(1);
});
