/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Standalone Google Chat bridge server.
 * Runs independently from the A2A agent server — connects to it
 * via the A2A protocol over HTTP. Deploy as a separate Cloud Run
 * service for independent scaling.
 */

import express from 'express';
import { createChatBridgeRoutes } from './routes.js';
import { logger } from '../utils/logger.js';

function main() {
  const a2aServerUrl = process.env['A2A_SERVER_URL'];
  if (!a2aServerUrl) {
    logger.error(
      '[ChatBridge] A2A_SERVER_URL is required. Set it to the A2A agent server URL.',
    );
    process.exit(1);
  }

  const app = express();
  app.use(express.json());

  const chatRoutes = createChatBridgeRoutes({
    a2aServerUrl,
    projectNumber: process.env['CHAT_PROJECT_NUMBER'],
    debug: process.env['CHAT_BRIDGE_DEBUG'] === 'true',
    gcsBucket: process.env['GCS_BUCKET_NAME'],
    serviceAccountKeyPath: process.env['CHAT_SA_KEY_PATH'],
  });
  app.use(chatRoutes);

  // Root health check
  app.get('/', (_req, res) => {
    res.json({
      service: 'gemini-chat-bridge',
      status: 'ok',
      a2aServerUrl,
    });
  });

  const port = Number(process.env['PORT'] || 8080);
  const host = process.env['HOST'] || '0.0.0.0';

  app.listen(port, host, () => {
    logger.info(`[ChatBridge] Server started on http://${host}:${port}`);
    logger.info(`[ChatBridge] Connected to A2A agent at ${a2aServerUrl}`);
  });
}

process.on('uncaughtException', (error) => {
  logger.error('[ChatBridge] Unhandled exception:', error);
  process.exit(1);
});

main();
