/**
 * Deep Review Entrypoint (Remote)
 * 
 * This script is the single command executed by the remote tmux session.
 * It handles environment loading and sequence orchestration.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prNumber = process.argv[2];
const branchName = process.argv[3];
const policyPath = process.argv[4];
const ISOLATED_CONFIG = process.env.GEMINI_CLI_HOME || path.join(process.env.HOME || '', '.gemini-deep-review');

async function main() {
  if (!prNumber || !branchName || !policyPath) {
    console.error('Usage: tsx entrypoint.ts <PR_NUMBER> <BRANCH_NAME> <POLICY_PATH>');
    process.exit(1);
  }

  const workDir = process.cwd(); // This is remoteWorkDir as set in review.ts
  const targetDir = path.join(workDir, branchName);

  // Path to the locally installed binaries in the work directory
  const tsxBin = path.join(workDir, 'node_modules/.bin/tsx');
  const geminiBin = path.join(workDir, 'node_modules/.bin/gemini');

  // 1. Run the Parallel Reviewer
  console.log('🚀 Launching Parallel Review Worker...');
  const workerResult = spawnSync(tsxBin, [path.join(__dirname, 'worker.ts'), prNumber, branchName, policyPath], {
    stdio: 'inherit',
    env: { ...process.env, GEMINI_CLI_HOME: ISOLATED_CONFIG }
  });

  if (workerResult.status !== 0) {
    console.error('❌ Worker failed. Check the logs above.');
  }

  // 2. Launch the Interactive Gemini Session (Local Nightly)
  console.log('\n✨ Verification complete. Joining interactive session...');
  
  const geminiArgs = ['--policy', policyPath];
  geminiArgs.push('-p', `Review for PR #${prNumber} is complete. Read the logs in .gemini/logs/review-${prNumber}/ and synthesize your findings.`);

  process.chdir(targetDir);
  spawnSync(geminiBin, geminiArgs, {
    stdio: 'inherit',
    env: { ...process.env, GEMINI_CLI_HOME: ISOLATED_CONFIG }
  });
}

main().catch(console.error);
