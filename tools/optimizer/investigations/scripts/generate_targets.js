/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { createObjectCsvWriter } from 'csv-writer';

async function run() {
  try {
    // 1. Community PRs
    const prQuery = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        pullRequests(first: 100, states: OPEN) {
          nodes {
            number
            author { login }
            authorAssociation
            mergeable
            reviewDecision
            commits(last: 1) {
              nodes {
                commit {
                  statusCheckRollup {
                    state
                  }
                }
              }
            }
          }
        }
      }
    }
    `;
    const prOutput = execSync(`gh api graphql -F owner=google-gemini -F repo=gemini-cli -f query='${prQuery}'`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    const prs = JSON.parse(prOutput).data.repository.pullRequests.nodes;

    const communityPrs = prs.filter(p => !['MEMBER', 'OWNER', 'COLLABORATOR'].includes(p.authorAssociation));
    
    const stalePrs = communityPrs.filter(p => p.mergeable === 'CONFLICTING').map(p => ({
        number: p.number,
        author: p.author?.login,
        reason: 'Merge Conflict'
    }));

    const readyPrs = communityPrs.filter(p => p.mergeable === 'MERGEABLE' && p.commits?.nodes[0]?.commit?.statusCheckRollup?.state === 'SUCCESS' && p.reviewDecision === 'REVIEW_REQUIRED').map(p => ({
        number: p.number,
        author: p.author?.login,
        reason: 'Mergeable + CI Success + Needs Review'
    }));

    const staleWriter = createObjectCsvWriter({
        path: 'author_stale_prs.csv',
        header: [
            {id: 'number', title: 'number'},
            {id: 'author', title: 'author'},
            {id: 'reason', title: 'reason'}
        ]
    });
    await staleWriter.writeRecords(stalePrs);

    const readyWriter = createObjectCsvWriter({
        path: 'ready_for_review_prs.csv',
        header: [
            {id: 'number', title: 'number'},
            {id: 'author', title: 'author'},
            {id: 'reason', title: 'reason'}
        ]
    });
    await readyWriter.writeRecords(readyPrs);

    // 2. Untriaged Issues
    const issueQuery = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        issues(first: 100, states: OPEN, labels: ["status/need-triage"]) {
          nodes {
            number
            title
            body
            author { login }
          }
        }
      }
    }
    `;
    const issueOutput = execSync(`gh api graphql -F owner=google-gemini -F repo=gemini-cli -f query='${issueQuery}'`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    const issues = JSON.parse(issueOutput).data.repository.issues.nodes;

    const highQualityIssues = issues.filter(i => (i.body?.length || 0) > 200 && (i.title?.length || 0) > 20).map(i => ({
        number: i.number,
        author: i.author?.login,
        reason: 'High quality content (>200 chars body, >20 chars title)'
    }));

    const issueWriter = createObjectCsvWriter({
        path: 'untriaged_high_quality.csv',
        header: [
            {id: 'number', title: 'number'},
            {id: 'author', title: 'author'},
            {id: 'reason', title: 'reason'}
        ]
    });
    await issueWriter.writeRecords(highQualityIssues);

    console.log('Generated author_stale_prs.csv, ready_for_review_prs.csv, and untriaged_high_quality.csv');

  } catch (err) {
    console.error('Error generating CSVs:', err);
    process.exit(1);
  }
}

run();
