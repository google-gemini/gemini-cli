/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * @license
 */

import { GITHUB_OWNER, GITHUB_REPO, type MetricOutput } from '../types.js';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../../');

try {
  // 1. Fetch recent PR numbers and reviews from GitHub (so we have reviewer names/logins)
  const query = `
  query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      pullRequests(last: 100, states: MERGED) {
        nodes {
          number
          reviews(first: 20) {
            nodes {
              authorAssociation
              author { login, ... on User { name } }
            }
          }
        }
      }
    }
  }
  `;
  const output = execSync(
    `gh api graphql -F owner=${GITHUB_OWNER} -F repo=${GITHUB_REPO} -f query='${query}'`,
    { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const data = JSON.parse(output).data.repository;

  // 2. Map PR numbers to local commits using git log
  const logOutput = execSync('git log -n 5000 --format="%H|%s"', {
    cwd: repoRoot,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const prCommits = new Map<number, string>();
  for (const line of logOutput.split('\n')) {
    if (!line) continue;
    const [hash, subject] = line.split('|');
    const match = subject.match(/\(#(\d+)\)$/);
    if (match) {
      prCommits.set(parseInt(match[1], 10), hash);
    }
  }

  let totalMaintainerReviews = 0;
  let maintainerReviewsWithExpertise = 0;

  for (const pr of data.pullRequests.nodes) {
    if (!pr.reviews?.nodes || pr.reviews.nodes.length === 0) continue;

    const commitHash = prCommits.get(pr.number);
    if (!commitHash) continue; // Skip if we don't have the commit locally

    // 3. Get exact files changed using local git diff-tree, bypassing GraphQL limits
    const diffTreeOutput = execSync(
      `git diff-tree --no-commit-id --name-only -r ${commitHash}`,
      { cwd: repoRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const files = diffTreeOutput.split('\n').filter(Boolean);
    if (files.length === 0) continue;

    // Cache git log authors per path to avoid redundant child_process calls
    const authorCache = new Map<string, string>();
    const getAuthors = (targetPath: string) => {
      if (authorCache.has(targetPath)) return authorCache.get(targetPath)!;
      try {
        const authors = execSync(
          `git log --format="%an|%ae" -- ${JSON.stringify(targetPath)}`,
          {
            cwd: repoRoot,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
          },
        ).toLowerCase();
        authorCache.set(targetPath, authors);
        return authors;
      } catch {
        authorCache.set(targetPath, '');
        return '';
      }
    };

    const reviewersOnPR = new Map<string, { name?: string }>();
    for (const review of pr.reviews.nodes) {
      if (
        ['MEMBER', 'OWNER'].includes(review.authorAssociation) &&
        review.author?.login
      ) {
        const login = review.author.login.toLowerCase();
        if (login.endsWith('[bot]') || login.includes('bot')) continue;
        reviewersOnPR.set(login, review.author);
      }
    }

    for (const [login, authorInfo] of reviewersOnPR.entries()) {
      totalMaintainerReviews++;
      let hasExpertise = false;
      const name = authorInfo.name ? authorInfo.name.toLowerCase() : '';

      for (const file of files) {
        // Precise check: immediate file
        let authorsStr = getAuthors(file);
        if (authorsStr.includes(login) || (name && authorsStr.includes(name))) {
          hasExpertise = true;
          break;
        }

        // Fallback: file's directory
        const dir = path.dirname(file);
        authorsStr = getAuthors(dir);
        if (authorsStr.includes(login) || (name && authorsStr.includes(name))) {
          hasExpertise = true;
          break;
        }
      }

      if (hasExpertise) {
        maintainerReviewsWithExpertise++;
      }
    }
  }

  const ratio =
    totalMaintainerReviews > 0
      ? maintainerReviewsWithExpertise / totalMaintainerReviews
      : 0;
  const timestamp = new Date().toISOString();

  process.stdout.write(
    JSON.stringify(<MetricOutput>{
      metric: 'domain_expertise',
      value: Math.round(ratio * 100) / 100,
      timestamp,
      details: {
        totalMaintainerReviews,
        maintainerReviewsWithExpertise,
      },
    }) + '\n',
  );
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
