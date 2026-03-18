/**
 * Universal Workspace Worker (Remote)
 * 
 * Stateful orchestrator for complex development loops.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { runReviewPlaybook } from './playbooks/review.ts';
import { runFixPlaybook } from './playbooks/fix.ts';
import { runReadyPlaybook } from './playbooks/ready.ts';

export async function runWorker(args: string[]) {
  const prNumberOrIssue = args[0];
  const branchName = args[1];
  const policyPath = args[2];
  const action = args[3] || 'review';

  if (!prNumberOrIssue || !policyPath) {
    console.error('Usage: tsx worker.ts <ID> <BRANCH_NAME> <POLICY_PATH> [action]');
    return 1;
  }

  const workDir = process.cwd();
  
  // For 'implement', the ID is an issue number and we might not have a branch yet
  const isImplement = action === 'implement';
  const targetDir = isImplement ? workDir : path.join(workDir, branchName);

  // 1. Provision Environment
  if (!isImplement && !fs.existsSync(targetDir)) {
    console.log(`🌿 Provisioning PR #${prNumberOrIssue} into ${branchName}...`);
    const cloneCmd = `git clone --filter=blob:none https://github.com/google-gemini/gemini-cli.git ${targetDir}`;
    spawnSync(cloneCmd, { stdio: 'inherit', shell: true });
    
    process.chdir(targetDir);
    spawnSync('gh', ['pr', 'checkout', prNumberOrIssue], { stdio: 'inherit' });
  } else if (!isImplement) {
    process.chdir(targetDir);
  }

  // Use global gemini command pre-installed in the maintainer image
  const geminiBin = 'gemini';

  // 2. Dispatch to Playbook
  switch (action) {
    case 'review':
      return runReviewPlaybook(prNumberOrIssue, targetDir, policyPath, geminiBin);
    
    case 'fix':
      // The 'fix' playbook now handles its own internal loop
      return runFixPlaybook(prNumberOrIssue, targetDir, policyPath, geminiBin);
    
    case 'ready':
      return runReadyPlaybook(prNumberOrIssue, targetDir, policyPath, geminiBin);
    
    case 'implement':
      // Lazy-load implement playbook (to be created)
      const { runImplementPlaybook } = await import('./playbooks/implement.ts');
      return runImplementPlaybook(prNumberOrIssue, workDir, policyPath, geminiBin);
      
    case 'open':
      console.log(`🚀 Dropping into manual session...`);
      return 0;
      
    default:
      console.error(`❌ Unknown action: ${action}`);
      return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWorker(process.argv.slice(2)).catch(console.error);
}
