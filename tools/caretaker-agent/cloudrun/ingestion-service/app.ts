/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { PubSub } from '@google-cloud/pubsub';
import dotenv from 'dotenv';
import { Firestore } from '@google-cloud/firestore';
import { verifyGithubSignature } from './auth/github.js';
import { IssuesStore } from './db/issuesStore.js';

interface GitHubWebhookPayload {
  action?: string;
  issue?: {
    body?: string;
    number?: number;
    title?: string;
  };
  repository?: {
    full_name?: string;
  };
  sender?: {
    login?: string;
  };
}

dotenv.config();

const app = express();

const projectId = process.env.PROJECT_ID;
const topicId = process.env.TOPIC_ID;
const githubWebhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
const databaseId = process.env.FIRESTORE_DATABASE;
const collectionName = process.env.FIRESTORE_COLLECTION;

if (
  !projectId ||
  !topicId ||
  !githubWebhookSecret ||
  !databaseId ||
  !collectionName
) {
  throw new Error('Missing required environment variables');
}

const pubSubClient = new PubSub({ projectId });
const topic = pubSubClient.topic(topicId);

const db = new Firestore({ projectId, databaseId });
const issuesStore = new IssuesStore(db, collectionName);

// Middleware: read incoming JSON payloads as raw Buffer bytes
app.use(express.raw({ type: 'application/json', limit: '1mb' }));

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.post('/webhook', async (req, res) => {
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

  // Parse JSON payload
  let payload: GitHubWebhookPayload;
  try {
    const parsed = JSON.parse(req.body.toString());
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Payload is not an object');
    }
    payload = parsed as GitHubWebhookPayload;
  } catch {
    return res
      .status(400)
      .json({ status: 'error', message: 'Invalid JSON payload' });
  }

  const eventType = req.headers['x-github-event'];
  const action = payload.action;

  // Only process issues.opened events
  if (eventType !== 'issues' || action !== 'opened') {
    return res.status(200).json({
      status: 'ignored',
      reason: `unsupported event/action combo: ${eventType}.${action}`,
    });
  }

  const issueNumber = payload.issue?.number;
  const repository = payload.repository?.full_name;

  if (!issueNumber || !repository) {
    return res
      .status(400)
      .json({ status: 'error', message: 'Missing issue number or repository' });
  }

  // Payload preprocessing
  const rawBody = payload.issue?.body || '';
  const escapedBody = rawBody.replace(
    /<\/untrusted_context>/g,
    '\\</untrusted_context>',
  );
  const sanitizedBody = `<untrusted_context>\n${escapedBody}\n</untrusted_context>`;

  const processedData = {
    issue_number: issueNumber,
    repository: repository,
    sender: payload.sender?.login,
    body: sanitizedBody,
    title: payload.issue?.title,
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
      const status = snapshot.exists ? snapshot.data()?.status : null;
      if (status !== 'UNTRIAGED') {
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

export { app };
