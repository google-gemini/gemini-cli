/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { workspaceRouter } from './routes/workspaceRoutes.js';

export const app = express();
app.use(express.json());

const PORT = process.env['PORT'] || 8080;

app.get('/health', (_req, res) => {
  res.send({ status: 'ok' });
});

// Register Workspace Routes
app.use('/workspaces', workspaceRouter);

// Only listen if not in test mode
if (process.env['NODE_ENV'] !== 'test') {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Workspace Hub listening on port ${PORT}`);
  });
}
