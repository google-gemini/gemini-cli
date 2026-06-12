/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { execSync } from 'node:child_process';

try {
  const query = `
  query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      pullRequests(last: 100) {
        nodes {
          reviews(first: 50) {
            nodes {
              author { login }
              authorAssociation
            }
          }
        }
      }
    }
  }
  `;
  const output = execSync(`gh api graphql -F owner=google-gemini -F repo=gemini-cli -f query='${query}'`, { encoding: 'utf-8' });
  const data = JSON.parse(output).data.repository;

  const reviewCounts = {};

  for (const pr of data.pullRequests.nodes) {
    if (!pr.reviews?.nodes) continue;
    // We only count one review per author per PR to avoid counting multiple review comments as multiple reviews
    const reviewersOnPR = new Set();
    
    for (const review of pr.reviews.nodes) {
      if (['MEMBER', 'OWNER'].includes(review.authorAssociation) && review.author?.login) {
        const login = review.author.login.toLowerCase();
        if (login.endsWith('[bot]') || login.includes('bot')) {
          continue; // Ignore bots
        }
        reviewersOnPR.add(review.author.login);
      }
    }

    for (const reviewer of reviewersOnPR) {
      reviewCounts[reviewer] = (reviewCounts[reviewer] || 0) + 1;
    }
  }

  const counts = Object.values(reviewCounts);
  
  let variance = 0;
  if (counts.length > 0) {
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    variance = counts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / counts.length;
  }

  const timestamp = new Date().toISOString();

  process.stdout.write(JSON.stringify({ 
    metric: 'review_distribution_variance', 
    value: Math.round(variance * 100) / 100, 
    timestamp,
    details: reviewCounts
  }) + '\n');
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
