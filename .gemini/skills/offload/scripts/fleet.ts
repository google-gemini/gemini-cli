/**
 * Offload Fleet Manager
 * 
 * Manages dynamic GCP workers for offloading tasks.
 */
import { spawnSync } from 'child_process';

const PROJECT_ID = 'gemini-cli-team-quota';
const USER = process.env.USER || 'mattkorwel';
const INSTANCE_PREFIX = `gcli-offload-${USER}`;

async function listWorkers() {
  console.log(`🔍 Listing Offload Workers for ${USER} in ${PROJECT_ID}...`);
  
  const result = spawnSync('gcloud', [
    'compute', 'instances', 'list',
    '--project', PROJECT_ID,
    '--filter', `name~^${INSTANCE_PREFIX}`,
    '--format', 'table(name,zone,status,networkInterfaces[0].networkIP:label=INTERNAL_IP,creationTimestamp)'
  ], { stdio: 'inherit' });

  if (result.status !== 0) {
    console.error('\n❌ Failed to list workers. Ensure you have access to the project and gcloud is authenticated.');
  }
}

async function provisionWorker() {
  const name = INSTANCE_PREFIX;
  const zone = 'us-west1-a';
  
  console.log(`🔍 Checking if worker ${name} already exists...`);
  const existCheck = spawnSync('gcloud', [
    'compute', 'instances', 'describe', name,
    '--project', PROJECT_ID,
    '--zone', zone
  ], { stdio: 'pipe' });

  if (existCheck.status === 0) {
    console.log(`✅ Worker ${name} already exists and is ready for use.`);
    return;
  }

  console.log(`🚀 Provisioning secure offload worker: ${name}...`);
  
  const result = spawnSync('gcloud', [
    'compute', 'instances', 'create', name,
    '--project', PROJECT_ID,
    '--zone', zone,
    '--machine-type', 'n2-standard-8',
    '--image-family', 'gcli-maintainer-worker',
    '--image-project', PROJECT_ID,
    '--metadata', `enable-oslogin=TRUE`,
    '--labels', `owner=${USER.replace(/[^a-z0-9_-]/g, '_')},type=offload-worker`,
    '--tags', `gcli-offload-${USER}`,
    '--scopes', 'https://www.googleapis.com/auth/cloud-platform'
  ], { stdio: 'inherit' });

  if (result.status === 0) {
    console.log(`\n✅ Worker ${name} is being provisioned.`);
    console.log(`👉 Access is restricted via OS Login and tags.`);
  }
}

async function createImage() {
  const name = `gcli-maintainer-worker-build-${Math.floor(Date.now() / 1000)}`;
  const zone = 'us-west1-a';
  const imageName = 'gcli-maintainer-worker-v1';

  console.log(`🏗️  Building Maintainer Image: ${imageName}...`);

  // 1. Create a temporary builder VM
  console.log('   - Creating temporary builder VM...');
  spawnSync('gcloud', [
    'compute', 'instances', 'create', name,
    '--project', PROJECT_ID,
    '--zone', zone,
    '--machine-type', 'n2-standard-4',
    '--image-family', 'ubuntu-2204-lts',
    '--image-project', 'ubuntu-os-cloud',
    '--metadata-from-file', `startup-script=.gemini/skills/offload/scripts/provision-worker.sh`
  ], { stdio: 'inherit' });

  console.log('\n⏳ Waiting for provisioning to complete (this takes ~3-5 mins)...');
  console.log('   - You can tail the startup script via:');
  console.log(`     gcloud compute instances get-serial-port-output ${name} --project ${PROJECT_ID} --zone ${zone} --follow`);
  
  // Note: For a true automation we'd poll here, but for a maintainer tool,
  // we'll provide the instructions to finalize.
  console.log(`\n👉 Once provisioning is DONE, run these commands to finalize:`);
  console.log(`   1. gcloud compute instances stop ${name} --project ${PROJECT_ID} --zone ${zone}`);
  console.log(`   2. gcloud compute images create ${imageName} --project ${PROJECT_ID} --source-disk ${name} --source-disk-zone ${zone} --family gcli-maintainer-worker`);
  console.log(`   3. gcloud compute instances delete ${name} --project ${PROJECT_ID} --zone ${zone} --quiet`);
}

async function stopWorker() {
  const name = INSTANCE_PREFIX;
  const zone = 'us-west1-a';
  
  console.log(`🛑 Stopping offload worker: ${name}...`);
  const result = spawnSync('gcloud', [
    'compute', 'instances', 'stop', name,
    '--project', PROJECT_ID,
    '--zone', zone
  ], { stdio: 'inherit' });

  if (result.status === 0) {
    console.log(`\n✅ Worker ${name} has been stopped.`);
  }
}

async function remoteStatus() {
  const name = INSTANCE_PREFIX;
  const zone = 'us-west1-a';
  
  console.log(`📡 Fetching remote status from ${name}...`);
  spawnSync('ssh', ['gcli-worker', 'tsx .offload/scripts/status.ts'], { stdio: 'inherit', shell: true });
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
    case 'stop':
      await stopWorker();
      break;
    case 'status':
      await remoteStatus();
      break;
    case 'create-image':
      await createImage();
      break;
    default:
      console.error(`❌ Unknown fleet action: ${action}`);
      process.exit(1);
  }
}

main().catch(console.error);
