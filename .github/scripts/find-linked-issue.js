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

const text = await readStdin();
const repository = process.env['GITHUB_REPOSITORY'] ?? '';
const issue = findLinkedIssue(text, repository);

if (issue) {
  process.stdout.write(issue);
}
