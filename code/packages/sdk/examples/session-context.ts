/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeminiCliAgent, tool, z } from '../src/index.js';

async function main() {
  const getContextTool = tool(
    {
      name: 'get_context',
      description: 'Get information about the current session context.',
      inputSchema: z.object({}),
    },
    async (_params, context) => {
      if (!context) {
        return { error: 'Context not available' };
      }

      console.log('Session Context Accessed:');
      console.log(`- Session ID: ${context.sessionId}`);
      console.log(`- CWD: ${context.cwd}`);
      console.log(`- Timestamp: ${context.timestamp}`);

      let fileContent = null;
      try {
        // Try to read a file (e.g., package.json in the CWD)
        // Note: This relies on the agent running in a directory with package.json
        fileContent = await context.fs.readFile('package.json');
      } catch (e) {
        console.log(`- Could not read package.json: ${e}`);
      }

      let shellOutput = null;
      try {
        // Try to run a simple shell command
        const result = await context.shell.exec('echo "Hello from SDK Shell"');
        shellOutput = result.output.trim();
      } catch (e) {
        console.log(`- Could not run shell command: ${e}`);
      }

      return {
        sessionId: context.sessionId,
        cwd: context.cwd,
        hasFsAccess: !!context.fs,
        hasShellAccess: !!context.shell,
        packageJsonExists: !!fileContent,
        shellEcho: shellOutput,
      };
    },
  );

  const agent = new GeminiCliAgent({
    instructions:
      'You are a helpful assistant. Use the get_context tool to tell me about my environment.',
    tools: [getContextTool],
    // Set CWD to the package root so package.json exists
    cwd: process.cwd(),
  });

  console.log("Sending prompt: 'What is my current session context?'");
  for await (const chunk of agent.sendStream(
    'What is my current session context?',
  )) {
    if (chunk.type === 'content') {
      process.stdout.write(chunk.value || '');
    }
  }
}

main().catch(console.error);
