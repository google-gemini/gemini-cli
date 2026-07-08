/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import type { EgressEvent } from '../types.js';

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
  const { action, payload } = event;
  const { owner, repo, issueNumber } = payload;

  const allowedOwner = getRequiredEnvVar('ALLOWED_OWNER');
  const allowedRepo = getRequiredEnvVar('ALLOWED_REPO');

  if (
    owner.toLowerCase() !== allowedOwner.toLowerCase() ||
    repo.toLowerCase() !== allowedRepo.toLowerCase()
  ) {
    throw new Error(`Unauthorized repository target: ${owner}/${repo}`);
  }

  const octokit = getOctokit();

  switch (action) {
    // Note: The Egress Service operates as a stateless execution worker ("Hands").
    // Upstream event filtering (e.g. evaluating newly created issues for NEEDS_INFO
    // or verifying bot mention/author criteria) is performed in the Triage Worker
    // before publishing action payloads to the egress-actions topic.
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

    case 'UNLABEL':
      if (!payload.labels || !Array.isArray(payload.labels)) {
        throw new Error('Missing or invalid labels array for UNLABEL action');
      }
      console.log(
        `[EGRESS_GITHUB] Removing labels [${payload.labels.join(', ')}] from ${owner}/${repo}#${issueNumber}...`,
      );
      for (const name of payload.labels) {
        await octokit.rest.issues.removeLabel({
          owner,
          repo,
          issue_number: issueNumber,
          name,
        });
      }
      break;

    case 'PATCH':
      throw new Error('PATCH action is not yet implemented');

    default:
      throw new Error(`Unknown or unsupported egress action: ${action}`);
  }
}
