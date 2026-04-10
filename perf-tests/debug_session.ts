/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Storage } from '../packages/core/src/config/storage';
import { SessionSelector } from '../packages/cli/src/utils/sessionUtils';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

async function main() {
  const testDir = '/private/tmp/perf-scroll-up-true-true';
  mkdirSync(testDir, { recursive: true });

  const storage = new Storage(testDir);
  await storage.initialize();

  console.log('Project Temp Dir:', storage.getProjectTempDir());

  const chatsDir = join(storage.getProjectTempDir(), 'chats');
  mkdirSync(chatsDir, { recursive: true });

  const sessionFile = join(chatsDir, 'session-2026-04-10T00-00-test.jsonl');
  const metadata = {
    sessionId: 'test-session-id',
    projectHash: 'test-project-hash',
    startTime: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    kind: 'main',
    hasUserOrAssistantMessage: true,
    messageCount: 1,
    summary: 'Test Session',
  };

  const msg = {
    id: 'msg-0',
    timestamp: new Date().toISOString(),
    type: 'user',
    content: 'Message content 0',
  };

  writeFileSync(
    sessionFile,
    JSON.stringify(metadata) + '\n' + JSON.stringify(msg) + '\n',
  );
  console.log('Created file:', sessionFile);

  const selector = new SessionSelector(storage);
  const sessions = await selector.listSessions();
  console.log(
    'Sessions found:',
    sessions.map((s) => s.id),
  );

  try {
    const resolved = await selector.resolveSession('test-session-id');
    console.log('Resolved session:', resolved.sessionData.sessionId);
  } catch (e) {
    console.error('Failed to resolve:', e);
  }
}

main();
