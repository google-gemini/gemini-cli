import { spawnSync } from 'child_process';
import path from 'path';

export async function runFixPlaybook(prNumber: string, targetDir: string, policyPath: string, geminiBin: string) {
  console.log(`🚀 Workspace | FIX | PR #${prNumber}`);
  console.log('Switching to agentic fix loop inside Gemini CLI...');

  // Use the nightly gemini binary to activate the fix-pr skill and iterate
  // Note: Gemini doesn't support --cwd, so the caller (worker.ts) must ensure we are already in targetDir
  const result = spawnSync(geminiBin, [
    '--policy', policyPath,
    '-p', `Please activate the 'fix-pr' skill and use it to iteratively fix PR #${prNumber}. 
           Ensure you handle CI failures, merge conflicts, and unaddressed review comments 
           until the PR is fully passing and mergeable.`
  ], { stdio: 'inherit' });

  return result?.status ?? 1;
}
