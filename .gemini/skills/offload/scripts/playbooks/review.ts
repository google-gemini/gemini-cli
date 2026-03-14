import { TaskRunner } from '../TaskRunner.js';
import path from 'path';

export async function runReviewPlaybook(prNumber: string, targetDir: string, policyPath: string, geminiBin: string) {
  const runner = new TaskRunner(
    path.join(targetDir, `.gemini/logs/offload-${prNumber}`),
    `🚀 Offload | REVIEW | PR #${prNumber}`
  );

  runner.register([
    { id: 'build', name: 'Fast Build', cmd: `cd ${targetDir} && npm ci && npm run build` },
    { id: 'ci', name: 'CI Checks', cmd: `gh pr checks ${prNumber}` },
    { id: 'review', name: 'Gemini Analysis', cmd: `${geminiBin} --policy ${policyPath} --cwd ${targetDir} -p "/review-frontend ${prNumber}"` },
    { id: 'verify', name: 'Behavioral Proof', cmd: `${geminiBin} --policy ${policyPath} --cwd ${targetDir} -p "Analyze the code in ${targetDir} and exercise it to prove it works."`, dep: 'build' }
  ]);

  return runner.run();
}
