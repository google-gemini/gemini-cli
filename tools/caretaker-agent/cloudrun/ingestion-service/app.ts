/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { PubSub } from '@google-cloud/pubsub';
import dotenv from 'dotenv';
import { Firestore } from '@google-cloud/firestore';
import {
  verifyGithubSignature,
  isGitHubWebhookPayload,
} from './auth/github.js';
import type { GitHubWebhookPayload } from './auth/github.js';
import { IssuesStore } from './db/issuesStore.js';

dotenv.config();

const app = express();

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const projectId = getRequiredEnvVar('PROJECT_ID');
const topicId = getRequiredEnvVar('TOPIC_ID');
const githubWebhookSecret = getRequiredEnvVar('GITHUB_WEBHOOK_SECRET');
const databaseId = getRequiredEnvVar('FIRESTORE_DATABASE');
const collectionName = getRequiredEnvVar('FIRESTORE_COLLECTION');

const pubSubClient = new PubSub({ projectId });
const topic = pubSubClient.topic(topicId);

const db = new Firestore({ projectId, databaseId });
const issuesStore = new IssuesStore(db, collectionName);

// Middleware: read incoming JSON payloads as raw Buffer bytes
app.use(express.raw({ type: 'application/json', limit: '1mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many requests, please try again later.',
  },
});

app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: process.env.K_SERVICE || 'caretaker-ingestion-service',
    revision: process.env.K_REVISION || 'local',
  });
});

app.post('/webhook', limiter, async (req, res) => {
  const header = req.headers['x-hub-signature-256'];
  const signature = Array.isArray(header) ? header[0] : header;

  // Github Authentication
  if (
    !req.body ||
    !verifyGithubSignature(req.body, signature, githubWebhookSecret)
  ) {
    console.error('Unauthorized: HMAC signature mismatch.');
    return res
      .status(401)
      .json({ status: 'error', message: 'Invalid Signature' });
  }

  const eventType = req.headers['x-github-event'];
  if (eventType !== 'issues') {
    return res.status(200).json({
      status: 'ignored',
      reason: `unsupported event type: ${eventType}`,
    });
  }

  let payload: GitHubWebhookPayload;
  try {
    const parsed: unknown = JSON.parse(req.body.toString());
    if (!isGitHubWebhookPayload(parsed)) {
      return res
        .status(400)
        .json({ status: 'error', message: 'Invalid payload structure' });
    }
    payload = parsed;
  } catch {
    return res
      .status(400)
      .json({ status: 'error', message: 'Invalid JSON payload' });
  }

  const action = payload.action;
  if (action !== 'opened') {
    return res.status(200).json({
      status: 'ignored',
      reason: `unsupported action: ${action}`,
    });
  }

  const issueNumber = payload.issue.number;
  const repository = payload.repository.full_name;

  // Payload preprocessing
  const rawBody = payload.issue.body || '';
  const escapedBody = rawBody.replace(
    /<\/untrusted_context>/g,
    '\\</untrusted_context>',
  );
  const sanitizedBody = `<untrusted_context>\n${escapedBody}\n</untrusted_context>`;

  const processedData = {
    issue_number: issueNumber,
    repository,
    sender: payload.sender?.login,
    body: sanitizedBody,
    title: payload.issue.title,
  };

  const [owner, repo] = repository.split('/');
  const title = processedData.title || '';

  try {
    const created = await issuesStore.createIssue(
      owner,
      repo,
      issueNumber,
      title,
    );

    if (!created) {
      // If the Firestore document already exists, check its status.
      // If it is 'UNTRIAGED', we continue to publish to Pub/Sub
      // to recover from previous publish failures.
      const issueRef = issuesStore.getIssueRef(owner, repo, issueNumber);
      const snapshot = await issueRef.get();
      if (snapshot.get('status') !== 'UNTRIAGED') {
        return res.status(200).json({
          status: 'ignored',
          reason: `issue already exists: ${repository}#${issueNumber}`,
        });
      }
    }

    // Publish to Pub/Sub
    const dataBuffer = Buffer.from(JSON.stringify(processedData));
    const messageId = await topic.publishMessage({ data: dataBuffer });

    return res.status(202).json({ status: 'accepted', message_id: messageId });
  } catch (error) {
    console.error('Error processing webhook:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ status: 'error', message });
  }
});

// Global Express error handler for middleware failures (e.g., HTTP 413)
app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (
      err &&
      typeof err === 'object' &&
      'status' in err &&
      err.status === 413
    ) {
      console.error('Payload too large. Limit is 1mb.');
      return res
        .status(413)
        .json({ status: 'error', message: 'Payload too large' });
    }
    next(err);
  },
);

export { app };
