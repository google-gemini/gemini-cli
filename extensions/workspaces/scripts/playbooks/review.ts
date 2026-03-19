import { TaskRunner } from '../TaskRunner.ts';
import path from 'path';

export async function runReviewPlaybook(prNumber: string, targetDir: string, policyPath: string, geminiBin: string) {
  const runner = new TaskRunner(
    path.join(targetDir, `.gemini/logs/workspace-${prNumber}`),
    `🚀 Workspace | REVIEW | PR #${prNumber}`
  );

  runner.register([
    { id: 'build', name: 'Fast Build', cmd: `cd ${targetDir} && npm ci && npm run build` },
    { id: 'ci', name: 'CI Checks', cmd: `gh pr checks ${prNumber}` },
    { id: 'review', name: 'Workspaceed Review', cmd: `cd ${targetDir} && ${geminiBin} --policy ${policyPath} -p "Please activate the 'review-pr' skill and use it to conduct a behavioral review of PR #${prNumber}."` }
  ]);

  return runner.run();
}
