/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

import { ProviderFactory } from './providers/ProviderFactory.ts';


const REPO_ROOT = process.cwd();

const USER = process.env.USER || 'mattkorwel';
const INSTANCE_PREFIX = `gcli-workspace-${USER}`;
const DEFAULT_ZONE = 'us-west1-a';

function getProjectId(): string {
  const settingsPath = path.join(REPO_ROOT, '.gemini/workspaces/settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return settings.workspace?.projectId;
    } catch {
      // Ignore
    }
  }
  return process.env.GOOGLE_CLOUD_PROJECT || '';
}

async function listWorkers() {
  const projectId = getProjectId();
  if (!projectId) {
    console.error('❌ Project ID not found. Run "workspace setup" first.');
    return;
  }

  console.log(`🔍 Listing Workspace Workers for ${USER} in ${projectId}...`);

  spawnSync(
    'gcloud',
    [
      'compute',
      'instances',
      'list',
      '--project',
      projectId,
      '--filter',
      `name~^${INSTANCE_PREFIX}`,
      '--format',
      'table(name,zone,status,networkInterfaces[0].networkIP:label=INTERNAL_IP,creationTimestamp)',
    ],
    { stdio: 'inherit' },
  );
}

async function provisionWorker() {
  const projectId = getProjectId();
  if (!projectId) {
    console.error('❌ Project ID not found. Run "workspace setup" first.');
    return;
  }

  const provider = ProviderFactory.getProvider({
    projectId: projectId,
    zone: DEFAULT_ZONE,
    instanceName: INSTANCE_PREFIX,
  });

  const status = await provider.getStatus();
  if (status.status !== 'UNKNOWN' && status.status !== 'ERROR') {
    console.log(
      `✅ Worker ${INSTANCE_PREFIX} already exists and is ${status.status}.`,
    );
    return;
  }

  await provider.provision();
}

async function stopWorker() {
  const projectId = getProjectId();
  const provider = ProviderFactory.getProvider({
    projectId: projectId,
    zone: DEFAULT_ZONE,
    instanceName: INSTANCE_PREFIX,
  });

  console.log(`🛑 Stopping workspace worker: ${INSTANCE_PREFIX}...`);
  await provider.stop();
}

async function rebuildWorker() {
  const projectId = getProjectId();
  console.log(`🔥 Rebuilding worker ${INSTANCE_PREFIX}...`);

  const knownHostsPath = path.join(REPO_ROOT, '.gemini/workspaces_known_hosts');
  if (fs.existsSync(knownHostsPath)) {
    console.log(`   - Clearing isolated known_hosts...`);
    fs.unlinkSync(knownHostsPath);
  }

  spawnSync(
    'gcloud',
    [
      'compute',
      'instances',
      'delete',
      INSTANCE_PREFIX,
      '--project',
      projectId,
      '--zone',
      DEFAULT_ZONE,
      '--quiet',
    ],
    { stdio: 'inherit' },
  );
  await provisionWorker();
}

async function main() {
  const action = process.argv[2] || 'list';

  switch (action) {
    case 'list':
      await listWorkers();
      break;
    case 'provision':
      await provisionWorker();
      break;
    case 'rebuild':
      await rebuildWorker();
      break;
    case 'stop':
      await stopWorker();
      break;
    default:
      console.error(`❌ Unknown fleet action: ${action}`);
      process.exit(1);
  }
}

main().catch(console.error);
