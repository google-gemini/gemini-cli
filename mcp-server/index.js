/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-env node */

import express from 'express';
const app = express();
const port = 3000;

app.use(express.json());

app.post('/tool/execute', (req, res) => {
  console.log('Received tool execution request:');
  console.log(JSON.stringify(req.body, null, 2));

  const toolResponse = {
    tool_code: req.body.tool_code,
    tool_name: req.body.tool_name,
    output: 'This is a mock response from the custom MCP server.',
    is_error: false,
  };

  res.json(toolResponse);
});

app.listen(port, () => {
  console.log(`Custom MCP server listening at http://localhost:${port}`);
});
