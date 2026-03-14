import { TaskRunner } from '../TaskRunner.js';
import path from 'path';
import { spawnSync } from 'child_process';

export async function runImplementPlaybook(issueNumber: string, workDir: string, policyPath: string, geminiBin: string) {
  const runner = new TaskRunner(
    path.join(workDir, `.gemini/logs/offload-issue-${issueNumber}`),
    `🚀 Offload | IMPLEMENT | Issue #${issueNumber}`
  );

  console.log(`🔍 Fetching metadata for Issue #${issueNumber}...`);
  const ghView = spawnSync('gh', ['issue', 'view', issueNumber, '--json', 'title', '-q', '.title'], { shell: true });
  const title = ghView.stdout.toString().trim() || `issue-${issueNumber}`;
  const branchName = `impl/${issueNumber}-${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`.slice(0, 50);

  runner.register([
    { id: 'branch', name: 'Create Branch', cmd: `git checkout -b ${branchName}` },
    { id: 'research', name: 'Codebase Research', cmd: `${geminiBin} --policy ${policyPath} -p "Research the requirements for issue #${issueNumber} using 'gh issue view ${issueNumber}'. Map out the files that need to be changed."`, dep: 'branch' },
    { id: 'implement', name: 'Implementation', cmd: `${geminiBin} --policy ${policyPath} -p "Implement the changes for issue #${issueNumber} based on your research. Ensure all code follows project standards."`, dep: 'research' },
    { id: 'verify', name: 'Verification', cmd: `npm run build && npm test`, dep: 'implement' },
    { id: 'pr', name: 'Create Pull Request', cmd: `git add . && git commit -m "feat: implement issue #${issueNumber}" && git push origin ${branchName} && gh pr create --title "${title}" --body "Closes #${issueNumber}"`, dep: 'verify' }
  ]);

  return runner.run();
}
