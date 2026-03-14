/**
 * Universal Deep Review Checker (Local)
 * 
 * Polls the remote machine for task status.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

export async function runChecker(args: string[]) {
  const prNumber = args[0];
  if (!prNumber) {
    console.error('Usage: npm run review:check <PR_NUMBER>');
    return 1;
  }

  const settingsPath = path.join(REPO_ROOT, '.gemini/settings.json');
  if (!fs.existsSync(settingsPath)) {
    console.error('❌ Settings not found. Run "npm run review:setup" first.');
    return 1;
  }
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const config = settings.maintainer?.deepReview;
  if (!config) {
    console.error('❌ Deep Review configuration not found.');
    return 1;
  }
  const { remoteHost, remoteWorkDir } = config;

  console.log(`🔍 Checking remote status for PR #${prNumber} on ${remoteHost}...`);

  const branchView = spawnSync('gh', ['pr', 'view', prNumber, '--json', 'headRefName', '-q', '.headRefName'], { shell: true });
  const branchName = branchView.stdout.toString().trim();
  const logDir = `${remoteWorkDir}/${branchName}/.gemini/logs/review-${prNumber}`;

  const tasks = ['build', 'ci', 'review', 'verify'];
  let allDone = true;

  console.log('\n--- Task Status ---');
  for (const task of tasks) {
    const checkExit = spawnSync('ssh', [remoteHost, `cat ${logDir}/${task}.exit 2>/dev/null`], { shell: true });
    if (checkExit.status === 0) {
      const code = checkExit.stdout.toString().trim();
      console.log(`  ${code === '0' ? '✅' : '❌'} ${task.padEnd(10)}: ${code === '0' ? 'SUCCESS' : `FAILED (exit ${code})`}`);
    } else {
      const checkRunning = spawnSync('ssh', [remoteHost, `[ -f ${logDir}/${task}.log ]`], { shell: true });
      if (checkRunning.status === 0) {
        console.log(`  ⏳ ${task.padEnd(10)}: RUNNING`);
      } else {
        console.log(`  💤 ${task.padEnd(10)}: PENDING`);
      }
      allDone = false;
    }
  }

  if (allDone) {
    console.log('\n✨ All remote tasks complete. You can now synthesize the results.');
  } else {
    console.log('\n⏳ Some tasks are still in progress. Check again in a few minutes.');
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runChecker(process.argv.slice(2)).catch(console.error);
}
