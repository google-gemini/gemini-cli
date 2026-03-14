/**
 * Universal Deep Review Worker (Remote)
 */
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workDir = process.cwd();
const prNumber = process.argv[2];
const branchName = process.argv[3];

async function main() {
  if (!prNumber || !branchName) {
    console.error('Usage: tsx worker.ts <PR_NUMBER> <BRANCH_NAME>');
    process.exit(1);
  }

  const targetDir = path.join(workDir, branchName);

  // 1. Provision PR Directory (Fast Blobless Clone)
  if (!fs.existsSync(targetDir)) {
    console.log(`🌿 Provisioning PR #${prNumber} into ${branchName}...`);
    // Blobless clone: downloads history but no file contents until checked out. Extremely fast.
    const cloneCmd = `git clone --filter=blob:none https://github.com/google-gemini/gemini-cli.git ${targetDir}`;
    spawnSync(cloneCmd, { stdio: 'inherit', shell: true });
    
    process.chdir(targetDir);
    spawnSync('gh', ['pr', 'checkout', prNumber], { stdio: 'inherit' });
  } else {
    process.chdir(targetDir);
  }

  const logDir = path.join(targetDir, `.gemini/logs/review-${prNumber}`);
  fs.mkdirSync(logDir, { recursive: true });

  const GEMINI_CMD = path.join(workDir, 'node_modules/.bin/gemini');

  // Use mirrored policy if available
  const policyFile = path.join(process.env.HOME || '', '.gemini/policies/policy.toml');
  const policyFlag = fs.existsSync(policyFile) ? `--policy ${policyFile}` : '';

  // 2. Define Parallel Tasks
  const tasks = [
    { id: 'build', name: 'Fast Build', cmd: `cd ${targetDir} && npm ci && npm run build` },
    { id: 'ci', name: 'CI Checks', cmd: `gh pr checks ${prNumber}` },
    // Point the analysis at the PR directory specifically
    { id: 'review', name: 'Gemini Analysis', cmd: `${GEMINI_CMD} ${policyFlag} --cwd ${targetDir} -p "/review-frontend ${prNumber}"` },
    { id: 'verify', name: 'Behavioral Proof', cmd: `${GEMINI_CMD} ${policyFlag} --cwd ${targetDir} -p "Analyze the code in ${targetDir} and exercise it."`, dep: 'build' }
  ];

  const state: Record<string, any> = {};
  tasks.forEach(t => state[t.id] = { status: 'PENDING' });

  function runTask(task: any) {
    if (task.dep && state[task.dep].status !== 'SUCCESS') {
      setTimeout(() => runTask(task), 1000);
      return;
    }

    state[task.id].status = 'RUNNING';
    const proc = spawn(task.cmd, { shell: true, env: { ...process.env, FORCE_COLOR: '1' } });
    const logStream = fs.createWriteStream(path.join(logDir, `${task.id}.log`));
    proc.stdout.pipe(logStream);
    proc.stderr.pipe(logStream);

    proc.on('close', (code) => {
      const exitCode = code ?? 0;
      state[task.id].status = exitCode === 0 ? 'SUCCESS' : 'FAILED';
      // Write exit code for remote polling
      fs.writeFileSync(path.join(logDir, `${task.id}.exit`), exitCode.toString());
      render();
    });
  }

  function render() {
    console.clear();
    console.log(`==================================================`);
    console.log(`🚀 Deep Review | PR #${prNumber} | ${branchName}`);
    console.log(`📂 PR Target:  ${targetDir}`);
    console.log(`==================================================\n`);
    
    tasks.forEach(t => {
      const s = state[t.id];
      const icon = s.status === 'SUCCESS' ? '✅' : s.status === 'FAILED' ? '❌' : s.status === 'RUNNING' ? '⏳' : '💤';
      console.log(`  ${icon} ${t.name.padEnd(20)}: ${s.status}`);
    });

    const allDone = tasks.every(t => ['SUCCESS', 'FAILED'].includes(state[t.id].status));
    if (allDone) {
      console.log(`\n✨ Verification complete. Launching interactive session...`);
      // cd into the targetDir for the final interactive session
      process.chdir(targetDir);
      process.exit(0);
    }
  }

  tasks.filter(t => !t.dep).forEach(runTask);
  tasks.filter(t => t.dep).forEach(runTask);
  setInterval(render, 1500);
}

main().catch(console.error);
