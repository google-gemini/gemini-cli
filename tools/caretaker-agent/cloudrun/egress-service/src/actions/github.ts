/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { EgressEvent } from '../types.js';

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let cachedOctokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (!cachedOctokit) {
    const appId = getRequiredEnvVar('GH_APP_ID');
    const privateKey = getRequiredEnvVar('GH_PRIVATE_KEY');
    const installationId = getRequiredEnvVar('GH_INSTALLATION_ID');

    cachedOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: Number(appId),
        privateKey: privateKey.replace(/\\n/g, '\n'),
        installationId: Number(installationId),
      },
    });
  }
  return cachedOctokit;
}

export async function handleEgressEvent(event: EgressEvent): Promise<void> {
  const octokit = getOctokit();
  const { action, payload } = event;
  const { owner, repo, issueNumber } = payload;

  switch (action) {
    case 'COMMENT':
      if (!payload.commentBody || payload.commentBody.trim() === '') {
        throw new Error('Missing or empty commentBody for COMMENT action');
      }
      console.log(
        `[EGRESS_GITHUB] Posting comment to ${owner}/${repo}#${issueNumber}...`,
      );
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: payload.commentBody,
      });
      break;

    case 'LABEL':
      if (!payload.labels || !Array.isArray(payload.labels)) {
        throw new Error('Missing or invalid labels array for LABEL action');
      }
      console.log(
        `[EGRESS_GITHUB] Adding labels [${payload.labels.join(', ')}] to ${owner}/${repo}#${issueNumber}...`,
      );
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels: payload.labels,
      });
      break;

    case 'PATCH':
      console.log('[EGRESS] Patching action triggered (not yet implemented).');
      break;

    default:
      console.log(`[EGRESS] Unknown action: ${action}`);
      break;
  }
}
