/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import process from 'node:process';
import { parseJsonl, type ConversationRecord } from '@google/gemini-cli-core';

/**
 * Debug tool to convert Gemini session files between JSON and JSONL.
 *
 * Usage:
 *   npx tsx scripts/convert-session.ts <path-to-session.json> > session.jsonl
 *   npx tsx scripts/convert-session.ts <path-to-session.jsonl> > session.json
 *   npx tsx scripts/convert-session.ts --to jsonl <path> > session.jsonl
 *   npx tsx scripts/convert-session.ts --to json <path> > session.json
 */

type Format = 'json' | 'jsonl';

function usage(exitCode = 0): void {
  const lines = [
    'Usage:',
    '  npx tsx scripts/convert-session.ts <path-to-session.json> > session.jsonl',
    '  npx tsx scripts/convert-session.ts <path-to-session.jsonl> > session.json',
    '  npx tsx scripts/convert-session.ts --to jsonl <path> > session.jsonl',
    '  npx tsx scripts/convert-session.ts --to json <path> > session.json',
  ];
  console.error(lines.join('\n'));
  process.exit(exitCode);
}

function parseArgs(argv: string[]): { filePath: string; toFormat?: Format } {
  let toFormat: Format | undefined;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      usage(0);
    }
    if (arg === '--to') {
      const value = argv[i + 1];
      if (!value || (value !== 'json' && value !== 'jsonl')) {
        console.error('Error: --to must be "json" or "jsonl".');
        usage(1);
      }
      toFormat = value;
      i++;
      continue;
    }
    if (arg.startsWith('-')) {
      console.error(`Error: Unknown option "${arg}".`);
      usage(1);
    }
    positional.push(arg);
  }

  if (positional.length !== 1) {
    usage(1);
  }

  return { filePath: positional[0], toFormat };
}

function detectFormat(filePath: string): Format | null {
  if (filePath.endsWith('.jsonl')) return 'jsonl';
  if (filePath.endsWith('.json')) return 'json';
  return null;
}

function toJsonl(session: ConversationRecord): string {
  const metadata = {
    type: 'session_metadata',
    sessionId: session.sessionId,
    projectHash: session.projectHash,
    startTime: session.startTime,
    lastUpdated: session.lastUpdated,
    summary: session.summary,
  };

  const lines: string[] = [JSON.stringify(metadata)];
  for (const msg of session.messages) {
    lines.push(JSON.stringify(msg));
  }
  return lines.join('\n') + '\n';
}

const { filePath, toFormat } = parseArgs(process.argv.slice(2));

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const fromFormat = detectFormat(filePath);
if (!fromFormat) {
  console.error('Error: Input file must end with .json or .jsonl.');
  process.exit(1);
}

const targetFormat = toFormat ?? (fromFormat === 'json' ? 'jsonl' : 'json');
if (targetFormat === fromFormat) {
  console.error('Error: Target format must differ from input format.');
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');

if (fromFormat === 'json') {
  const session = JSON.parse(content) as ConversationRecord;
  if (!session.sessionId || !Array.isArray(session.messages)) {
    console.error('Error: Invalid session file format.');
    process.exit(1);
  }

  process.stdout.write(toJsonl(session));
} else {
  const session = parseJsonl(content, '', '');
  if (!session.sessionId || !Array.isArray(session.messages)) {
    console.error('Error: Invalid JSONL session file format.');
    process.exit(1);
  }

  process.stdout.write(JSON.stringify(session, null, 2));
}
