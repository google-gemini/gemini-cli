/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';

const PROJECT_ID = 36;
const ORG = 'google-gemini';
const REPO = 'google-gemini/gemini-cli';
const MAINTAINERS_REPO = 'google-gemini/maintainers-gemini-cli';

// Parent issues to recursively traverse
const PARENT_ISSUES = [15374, 15456, 15324];

// Labels to Exclude
const EXCLUDED_LABELS = [
  'help wanted',
  'status/need-triage',
  'status/need-info',
  'area/unknown',
];

// Labels that force inclusion (override exclusions)
const FORCE_INCLUDE_LABELS = ['🔒 maintainer only'];

function runCommand(command) {
  try {
    return execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (_e) {
    return null;
  }
}

function getIssues(repo) {
  console.log(`Fetching open issues from ${repo}...`);
  const json = runCommand(
    `gh issue list --repo ${repo} --state open --limit 3000 --json number,title,url,labels`,
  );
  if (!json) {
    return [];
  }
  return JSON.parse(json);
}

function getIssueBody(repo, number) {
  const json = runCommand(
    `gh issue view ${number} --repo ${repo} --json body,title,url,number`,
  );
  if (!json) {
    return null;
  }
  return JSON.parse(json);
}

function getProjectItems() {
  console.log(`Fetching items from Project ${PROJECT_ID}...`);
  const json = runCommand(
    `gh project item-list ${PROJECT_ID} --owner ${ORG} --format json --limit 3000`,
  );
  if (!json) {
    return [];
  }
  return JSON.parse(json).items;
}

function shouldInclude(issue) {
  const labels = issue.labels.map((l) => l.name);

  // Check Force Include first
  if (labels.some((l) => FORCE_INCLUDE_LABELS.includes(l))) {
    return true;
  }

  // Check Exclude
  if (labels.some((l) => EXCLUDED_LABELS.includes(l))) {
    return false;
  }

  return true;
}

// Recursive function to find children
const visitedParents = new Set();
async function findChildren(repo, number, depth = 0) {
  const key = `${repo}/${number}`;
  if (visitedParents.has(key) || depth > 3) {
    return []; // Avoid cycles and too deep
  }
  visitedParents.add(key);

  process.stdout.write('.'); // progress indicator
  const issue = getIssueBody(repo, number);
  if (!issue) {
    return [];
  }

  const children = [];
  const body = issue.body || '';

  // Regex to find #1234 (local repo) and https://github.com/.../issues/1234 (cross repo)
  // 1. Local references: #1234
  const localMatches = [
    ...body.matchAll(/(?<!issue\s)(?<!issues\/)(?<!pull\/)(?<!#)#(\d+)/g),
  ];
  for (const match of localMatches) {
    children.push({ repo, number: parseInt(match[1]) });
  }

  // 2. Full URL references
  const urlMatches = [
    ...body.matchAll(/https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/g),
  ];
  for (const match of urlMatches) {
    children.push({ repo: match[1], number: parseInt(match[2]) });
  }

  // Recursively find children of these children
  const allDescendants = [];
  for (const child of children) {
    // Only recurse if it's one of our interesting repos
    if (child.repo !== REPO && child.repo !== MAINTAINERS_REPO) {
      continue;
    }

    // Fetch details
    const childDetails = getIssueBody(child.repo, child.number);
    if (childDetails) {
      allDescendants.push({ ...childDetails, repo: child.repo });

      // Recurse
      const grandChildren = await findChildren(
        child.repo,
        child.number,
        depth + 1,
      );
      allDescendants.push(...grandChildren);
    }
  }

  return allDescendants;
}

async function run() {
  const issues = getIssues(REPO);
  const currentItems = getProjectItems();

  console.log(`
Total Open Gemini Issues: ${issues.length}`);
  console.log(`Total Current Project Items: ${currentItems.length}`);

  const currentUrlMap = new Set(currentItems.map((i) => i.content.url));
  const toAddMap = new Map();
  const allowedUrls = new Set(); // URLs that are safe to stay/be added

  // 1. Label Logic
  for (const issue of issues) {
    if (shouldInclude(issue)) {
      allowedUrls.add(issue.url);
      if (!currentUrlMap.has(issue.url)) {
        toAddMap.set(issue.url, issue);
      }
    }
  }

  // 2. Hierarchy Logic
  console.log('\n--- SCANNING HIERARCHY ---');
  console.log(`Fetching recursive children of: ${PARENT_ISSUES.join(', ')}`);
  for (const parentId of PARENT_ISSUES) {
    const descendants = await findChildren(REPO, parentId);
    for (const item of descendants) {
      if (item.repo === REPO || item.repo === MAINTAINERS_REPO) {
        allowedUrls.add(item.url); // Mark as allowed
        if (!currentUrlMap.has(item.url) && !toAddMap.has(item.url)) {
          toAddMap.set(item.url, item);
        }
      }
    }
  }
  console.log('\nScanning complete.');

  // 3. Removal Logic
  const toRemove = [];
  for (const item of currentItems) {
    // Protect Maintainers Repo
    if (
      item.content.repository === MAINTAINERS_REPO ||
      (item.content.url && item.content.url.includes('maintainers-gemini-cli'))
    ) {
      continue;
    }

    // If not allowed by Labels OR Hierarchy, remove
    if (!allowedUrls.has(item.content.url)) {
      toRemove.push(item);
    }
  }

  const toAdd = Array.from(toAddMap.values());

  console.log('\n--- ANALYSIS ---');
  console.log(`Items to ADD:    ${toAdd.length}`);
  console.log(`Items to REMOVE: ${toRemove.length}`);

  if (toAdd.length > 0) {
    console.log('\n--- EXAMPLES TO ADD ---');
    toAdd
      .slice(0, 5)
      .forEach((i) => console.log(`[+] #${i.number} ${i.title}`));
  }

  if (toRemove.length > 0) {
    console.log('\n--- EXAMPLES TO REMOVE ---');
    toRemove
      .slice(0, 5)
      .forEach((i) => console.log(`[-] ${i.content.title} (${i.status})`));
  }

  if (process.argv.includes('--execute')) {
    console.log('\n--- EXECUTING CHANGES ---');

    for (const issue of toAdd) {
      process.stdout.write(`Adding ${issue.url}... `);
      const res = runCommand(
        `gh project item-add ${PROJECT_ID} --owner ${ORG} --url "${issue.url}" --format json`,
      );
      process.stdout.write(res ? 'OK\n' : 'FAILED\n');
    }

    for (const item of toRemove) {
      process.stdout.write(`Removing ${item.id}... `);
      const res = runCommand(
        `gh project item-delete ${PROJECT_ID} --owner ${ORG} --id ${item.id}`,
      );
      process.stdout.write(res ? 'OK\n' : 'FAILED\n');
    }
    console.log('Done.');
  } else {
    console.log('\nRun with --execute to apply.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
