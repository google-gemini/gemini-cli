import { TaskRunner } from '../TaskRunner.ts';
import path from 'path';

export async function runReadyPlaybook(prNumber: string, targetDir: string, policyPath: string, geminiBin: string) {
  const runner = new TaskRunner(
    path.join(targetDir, `.gemini/logs/workspace-${prNumber}`),
    `🚀 Workspace | READY | PR #${prNumber}`
  );

  runner.register([
    { id: 'clean', name: 'Clean Workspace', cmd: `npm run clean && npm ci` },
    { id: 'preflight', name: 'Full Preflight', cmd: `npm run preflight`, dep: 'clean' },
    { id: 'conflicts', name: 'Main Conflict Check', cmd: `git fetch origin main && git merge-base --is-ancestor origin/main HEAD` }
  ]);

  return runner.run();
}
