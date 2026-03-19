/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { workspaceRouter } from './routes/workspaceRoutes.js';
import { iapMiddleware } from './middleware/iap.js';
import { CleanupService } from './services/cleanupService.js';

export const app = express();
app.use(express.json());
app.use(iapMiddleware);

const PORT = process.env['PORT'] || 8080;

app.get('/health', (_req, res) => {
  res.send({ status: 'ok' });
});

/**
 * Endpoint to trigger cleanup of idle workspaces.
 * Typically called by a Cloud Scheduler job.
 */
app.post('/cleanup', async (_req, res) => {
    try {
        const cleanupService = new CleanupService();
        const count = await cleanupService.cleanupIdleWorkspaces();
        res.json({ status: 'ok', cleaned_count: count });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
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
