/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-20
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// A simple dictionary for our translation tool
const dictionary = {
  hello: '안녕하세요',
  world: '세상',
  file: '파일',
  read: '읽다',
};

// Define the tool(s) that this server provides
const tools = [
  {
    functionDeclarations: [
      {
        name: 'greet',
        description: 'Sends a personalized greeting.',
        parameters: {
          type: 'OBJECT',
          properties: {
            name: {
              type: 'STRING',
              description: 'The name of the person to greet.',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'readFile',
        description: 'Reads the content of a specified file.',
        parameters: {
          type: 'OBJECT',
          properties: {
            filePath: {
              type: 'STRING',
              description: 'The path to the file to read.',
            },
          },
          required: ['filePath'],
        },
      },
      {
        name: 'translateKorean',
        description: 'Translates a word from English to Korean.',
        parameters: {
          type: 'OBJECT',
          properties: {
            text: {
              type: 'STRING',
              description: 'The English word to translate.',
            },
          },
          required: ['text'],
        },
      },
    ],
  },
];

// The single endpoint for all MCP communication
app.post('/mcp', (req, res) => {
  console.log(`[MCP Server] Received request on /mcp`);
  console.log(`[MCP Server] Body: ${JSON.stringify(req.body, null, 2)}`);

  // Check if the request is for tool execution
  if (req.body.functionCalls && req.body.functionCalls.length > 0) {
    const call = req.body.functionCalls[0];
    let response;

    if (call.name === 'greet') {
      const name = call.args.name || 'World';
      response = {
        results: [
          { name: 'greet', content: `Hello, ${name}! Welcome to MCP.` },
        ],
      };
    } else if (call.name === 'readFile') {
      const filePath = call.args.filePath;
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        response = { results: [{ name: 'readFile', content: content }] };
      } catch (error) {
        response = {
          results: [
            {
              name: 'readFile',
              content: `Error reading file: ${error.message}`,
            },
          ],
        };
      }
    } else if (call.name === 'translateKorean') {
      const textToTranslate = (call.args.text || '').toLowerCase();
      const translation = dictionary[textToTranslate];
      const content = translation
        ? `The Korean translation of '${textToTranslate}' is '${translation}'.`
        : `Sorry, I don't know the word '${textToTranslate}'.`;
      response = { results: [{ name: 'translateKorean', content: content }] };
    } else {
      response = {
        results: [{ name: call.name, content: `Unknown tool: ${call.name}` }],
      };
    }

    console.log(
      `[MCP Server] Executing tool. Sending response: ${JSON.stringify(response, null, 2)}`,
    );
    return res.json(response);
  }

  // Otherwise, assume it's a discovery request and return the list of tools
  const response = { tools };
  console.log(
    `[MCP Server] Responding with tool definitions: ${JSON.stringify(response, null, 2)}`,
  );
  res.json(response);
});

app.listen(port, () => {
  console.log(
    `[MCP Server] Example server listening at http://localhost:${port}`,
  );
  console.log('[MCP Server] Ready to accept connections from Gemini CLI.');
});
