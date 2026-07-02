/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import dotenv from 'dotenv';
import {
  isPubSubMessageEnvelope,
  isEgressEvent,
  type EgressEvent,
} from './types.js';

dotenv.config();

/**
 * Top-down stub handler for Egress events.
 * Octokit GitHub REST API integration will be added in a follow-up PR.
 *
 * @param event - The validated EgressEvent object decoded from Pub/Sub push envelope.
 */
export async function handleEgressEvent(event: EgressEvent): Promise<void> {
  console.log(
    `[EGRESS_STUB] Received ${event.action} event for ${event.payload.owner}/${event.payload.repo}#${event.payload.issueNumber}`,
  );
}

export const app = express();
app.use(express.json());

// Health check endpoint for Cloud Run liveness/readiness probes
app.get('/', (_req, res) => {
  res.json({
    status: 'healthy',
    service: process.env.K_SERVICE || 'caretaker-egress-service',
    revision: process.env.K_REVISION || 'local',
  });
});

// Pub/Sub push subscription endpoint
app.post('/', async (req, res) => {
  if (!isPubSubMessageEnvelope(req.body)) {
    return res.status(400).send('Invalid Pub/Sub message envelope');
  }

  const data = req.body.message?.data;
  if (!data) {
    return res.status(400).send('Missing message.data');
  }

  let event: unknown;
  try {
    const jsonStr = Buffer.from(data, 'base64').toString('utf-8');
    event = JSON.parse(jsonStr);
  } catch {
    return res.status(400).send('Malformed payload: invalid JSON');
  }

  if (!isEgressEvent(event)) {
    return res
      .status(400)
      .send('Malformed payload: missing or invalid required egress fields');
  }

  try {
    await handleEgressEvent(event);
    console.log(
      `[EGRESS] Successfully executed ${event.action} for ${event.payload.owner}/${event.payload.repo}#${event.payload.issueNumber}`,
    );
    return res.status(200).send('OK');
  } catch (err) {
    console.error('[EGRESS_ERROR] Error handling egress event execution:', err);
    return res
      .status(500)
      .send(err instanceof Error ? err.message : 'Internal Server Error');
  }
});
