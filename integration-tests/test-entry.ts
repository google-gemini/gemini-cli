import { Polly } from '@pollyjs/core';
import NodeHttpAdapter from '@pollyjs/adapter-fetch';
import FSPersister from '@pollyjs/persister-fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { env } from 'process';

const __dirname = dirname(fileURLToPath(import.meta.url));

Polly.register(NodeHttpAdapter);
Polly.register(FSPersister);

const testName = env.GEMINI_TEST_NAME || 'unknown-test';
const sanitizedName = sanitizeTestName(testName);
const polly = new Polly(sanitizedName, {
  adapters: ['fetch'],
  persister: 'fs',
  persisterOptions: {
    fs: {
      recordingsDir: join(env.INTEGRATION_TEST_FILE_DIR!, sanitizedName, 'polly-recordings'),
    },
  },
  recordIfMissing: true,
  matchRequestsBy: {
    headers: {
      exclude: ['user-agent', 'accept', 'accept-encoding', 'connection'],
    },
  },
});

process.on('beforeExit', async () => {
  await polly.stop();
});

function sanitizeTestName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-');
}

// Start the original application
import(join(__dirname, '..', 'bundle/gemini.js'));
