/**
 * CI Failure Extraction Utility
 * 
 * Analyzes remote CI logs to identify specific failing test files.
 * Used by the review-pr and fix-pr skills to minimize local repro noise.
 */
import { spawnSync } from 'child_process';

async function main() {
  const prNumber = process.argv[2];
  if (!prNumber) {
    console.error('Usage: npx tsx extract-failures.ts <PR_NUMBER>');
    process.exit(1);
  }

  console.log(`🔍 Investigating CI failures for PR #${prNumber}...`);

  // 1. Get branch name
  const branchView = spawnSync('gh', ['pr', 'view', prNumber, '--json', 'headRefName', '-q', '.headRefName'], { shell: true });
  const branchName = branchView.stdout.toString().trim();

  // 2. Get latest CI run ID
  const runList = spawnSync('gh', ['run', 'list', '--branch', branchName, '--workflow', 'ci.yml', '--json', 'databaseId', '-q', '.[0].databaseId'], { shell: true });
  const runId = runList.stdout.toString().trim();

  if (!runId) {
    console.log('⚠️ No recent CI runs found for this branch.');
    process.exit(0);
  }

  // 3. Extract failing files from logs
  // Pattern matches common test locations in the monorepo
  const logView = spawnSync('gh', ['run', 'view', runId, '--log-failed'], { shell: true });
  const logOutput = logView.stdout.toString();
  
  const testPattern = /(packages\/[a-zA-Z0-9_-]+|integration-tests|evals)\/[a-zA-Z0-9_\/-]+\.test\.ts(x)?/g;
  const matches = logOutput.match(testPattern);

  if (!matches || matches.length === 0) {
    console.log('✅ No specific failing test files detected in logs.');
    process.exit(0);
  }

  const uniqueFiles = Array.from(new Set(matches)).sort();
  console.log('\n❌ Found failing test files:');
  uniqueFiles.forEach(f => console.log(`  - ${f}`));

  console.log('\n👉 Recommendation: Run these tests locally using:');
  uniqueFiles.forEach(file => {
    let wsDir = file.split('/')[0];
    if (wsDir === 'packages') {
      wsDir = file.split('/').slice(0, 2).join('/');
    }
    const relFile = file.replace(`${wsDir}/`, '');
    console.log(`  npm run test:ci -w ${wsDir} -- ${relFile}`);
  });
}

main().catch(console.error);
