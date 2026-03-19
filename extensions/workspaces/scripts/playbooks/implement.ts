import { TaskRunner } from '../TaskRunner.js';
import path from 'path';
import { spawnSync } from 'child_process';

import { TaskRunner } from '../TaskRunner.js';
import path from 'path';
import { spawnSync } from 'child_process';
import fs from 'fs';

export async function runImplementPlaybook(issueNumber: string, workDir: string, policyPath: string, geminiBin: string) {
  console.log(`🚀 Workspace | IMPLEMENT (Supervisor Loop) | Issue #${issueNumber}`);
  
  const ghView = spawnSync('gh', ['issue', 'view', issueNumber, '--json', 'title,body', '-q', '{title:.title,body:.body}'], { shell: true });
  const meta = JSON.parse(ghView.stdout.toString());
  const branchName = `impl/${issueNumber}-${meta.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`.slice(0, 50);

  // 1. Initial Research & Test Creation
  console.log('\n🧠 Phase 1: Research & Reproduction...');
  spawnSync(geminiBin, [
    '--policy', policyPath, '--cwd', workDir,
    '-p', `Research Issue #${issueNumber}: "${meta.title}". 
           Description: ${meta.body}.
           ACTION: Create a NEW Vitest test file in 'tests/repro_issue_${issueNumber}.test.ts' that demonstrates the issue or feature. 
           Ensure this test fails currently.`
  ], { stdio: 'inherit' });

  // 2. The Self-Healing Loop
  let attempts = 0;
  const maxAttempts = 5;
  let success = false;

  console.log('\n🛠️ Phase 2: Implementation Loop...');
  while (attempts < maxAttempts && !success) {
    attempts++;
    console.log(`\n👉 Attempt ${attempts}/${maxAttempts}...`);

    // Run the specific repro test
    const testRun = spawnSync('npx', ['vitest', 'run', `tests/repro_issue_${issueNumber}.test.ts`], { cwd: workDir });
    
    if (testRun.status === 0) {
      console.log('✅ Reproduction test PASSED!');
      success = true;
      break;
    }

    console.log('❌ Test failed. Asking Gemini to fix the implementation...');
    const testError = testRun.stdout.toString() + testRun.stderr.toString();
    
    spawnSync(geminiBin, [
      '--policy', policyPath, '--cwd', workDir,
      '-p', `The reproduction test for Issue #${issueNumber} is still failing. 
             ERROR OUTPUT:
             ${testError.slice(-2000)}
             
             ACTION: Modify the source code to fix this error and make the test pass. 
             Do not modify the test itself unless it has a syntax error.`
    ], { stdio: 'inherit' });
  }

  // 3. Final Verification
  if (success) {
    console.log('\n🧪 Phase 3: Final Verification...');
    const finalCheck = spawnSync('npm', ['test'], { cwd: workDir, stdio: 'inherit' });
    if (finalCheck.status === 0) {
      console.log('\n🎉 Implementation complete and verified!');
      spawnSync('git', ['add', '.'], { cwd: workDir });
      spawnSync('git', ['commit', '-m', `feat: implement issue #${issueNumber}`], { cwd: workDir });
      return 0;
    }
  }

  console.error('\n❌ Supervisor: Failed to reach a passing state within retry limit.');
  return 1;
}
