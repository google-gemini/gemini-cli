/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeminiCliAgent, tool, z } from '../src/index.js';

async function main() {
  const myTool = tool(
    {
      name: 'add',
      description: 'Add two numbers.',
      inputSchema: z.object({
        a: z.number().describe('the first number'),
        b: z.number().describe('the second number'),
      }),
    },
    async ({ a, b }) => {
      console.log(`Tool 'add' called with a=${a}, b=${b}`);
      return { result: a + b };
    },
  );

  const agent = new GeminiCliAgent({
    instructions: 'Make sure to always talk like a pirate.',
    tools: [myTool],
  });

  console.log("Sending prompt: 'add 5 + 6'");
  for await (const chunk of agent.sendStream(
    'add 5 + 6 and tell me a story involving the result',
  )) {
    console.log(JSON.stringify(chunk, null, 2));
  }
}

main().catch(console.error);
