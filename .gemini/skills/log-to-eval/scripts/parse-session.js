#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parses a Gemini CLI session file and extracts a summary of user prompts,
 * tool calls, and file interactions for use in eval generation.
 *
 * Usage: node parse-session.js <path-to-session.json>
 *
 * Output: JSON object with session summary to stdout.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sessionPath = process.argv[2];

if (!sessionPath) {
  console.error('Usage: node parse-session.js <path-to-session.json>');
  process.exit(1);
}

let session;
try {
  const raw = readFileSync(resolve(sessionPath), 'utf-8');
  session = JSON.parse(raw);
} catch (err) {
  console.error(`Failed to read session file: ${err.message}`);
  process.exit(1);
}

const FILE_TOOLS = new Set([
  'read_file',
  'write_file',
  'replace',
  'read_many_files',
]);

const summary = {
  sessionId: session.sessionId,
  startTime: session.startTime,
  messageCount: session.messages?.length ?? 0,
  turns: [],
  filesInteracted: new Set(),
};

for (const message of session.messages ?? []) {
  if (message.type === 'user') {
    const text = extractText(message.content);
    if (text) {
      summary.turns.push({
        role: 'user',
        text: text.slice(0, 500),
      });
    }
  }

  if (message.type === 'gemini' && message.toolCalls?.length) {
    const calls = message.toolCalls.map((tc) => {
      const call = {
        name: tc.name,
        args: summarizeArgs(tc.args),
        status: tc.status,
      };

      if (tc.args?.file_path) {
        summary.filesInteracted.add(tc.args.file_path);
      }
      if (tc.args?.path) {
        summary.filesInteracted.add(tc.args.path);
      }

      return call;
    });

    summary.turns.push({
      role: 'agent',
      toolCalls: calls,
    });
  }
}

summary.filesInteracted = [...summary.filesInteracted];

console.log(JSON.stringify(summary, null, 2));

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p.text)
      .map((p) => p.text)
      .join('\n');
  }
  if (content?.parts) {
    return content.parts
      .filter((p) => p.text)
      .map((p) => p.text)
      .join('\n');
  }
  return null;
}

function summarizeArgs(args) {
  if (!args || typeof args !== 'object') return {};
  const result = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' && value.length > 200) {
      result[key] = value.slice(0, 200) + '...';
    } else {
      result[key] = value;
    }
  }
  return result;
}
