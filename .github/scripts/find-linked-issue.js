#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import { findLinkedIssue } from '../../scripts/link-utils.js';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
  }
  return chunks.join('');
}

const args = process.argv.slice(2);
let repository = '';

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--repo') {
    repository = args[index + 1] ?? '';
    break;
  }

  if (arg.startsWith('--repo=')) {
    repository = arg.slice('--repo='.length);
    break;
  }
}

if (!repository) {
  repository = process.env['GITHUB_REPOSITORY'] ?? '';
}

const text = await readStdin();
const issue = findLinkedIssue(text, repository);

if (issue) {
  process.stdout.write(issue);
}
