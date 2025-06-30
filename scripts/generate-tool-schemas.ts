import * as fs from 'node:fs';
import * as path from 'node:path';
import { Config, ConfigParameters, createToolRegistry, Tool, AuthType } from '@google/gemini-cli-core';

// Helper function to ensure directory exists
function ensureDirectoryExistence(filePath: string) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

async function generateToolSchemas() {
  const outputDir = path.resolve(process.cwd(), 'dist');
  const outputFile = path.join(outputDir, 'tool-schemas.json');

  ensureDirectoryExistence(outputFile);

  // Minimal config parameters.
  // targetDir is important as some tools resolve paths relative to it.
  // model and sessionId are required by Config constructor.
  const configParams: ConfigParameters = {
    targetDir: process.cwd(), // Use current working directory
    sessionId: `gen-schema-${Date.now()}`,
    model: 'gemini-pro', // A default model
    debugMode: false,
    // Provide dummy values or omit where possible for other required fields
    // if they are not strictly necessary for tool registration.
    // Based on config.ts, many can be undefined or have defaults.
    cwd: process.cwd(),
  };

  const config = new Config(configParams);

  // refreshAuth is crucial to initialize the toolRegistry among other things.
  // Using a common AuthType, assuming it doesn't affect schema generation.
  await config.refreshAuth(AuthType.API_KEY);


  // Now get the tool registry
  const toolRegistry = await config.getToolRegistry();
  if (!toolRegistry) {
    console.error('Failed to get tool registry from config.');
    process.exit(1);
  }

  const tools = toolRegistry.getAllTools();
  const schemas = tools.map((tool: Tool) => {
    return {
      name: tool.name,
      description: tool.description,
      parameterSchema: tool.schema.parameters || {}, // Ensure parameters is not undefined
    };
  });

  try {
    fs.writeFileSync(outputFile, JSON.stringify(schemas, null, 2));
    console.log(`Successfully wrote tool schemas to ${outputFile}`);
  } catch (error) {
    console.error(`Error writing tool schemas to ${outputFile}:`, error);
    process.exit(1);
  }
}

generateToolSchemas().catch((error) => {
  console.error('Unhandled error during schema generation:', error);
  process.exit(1);
});
