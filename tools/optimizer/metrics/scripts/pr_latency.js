/* eslint-env node */
import { execSync } from 'node:child_process';

try {
  const repoInfo = execSync('gh repo view --json nameWithOwner', { encoding: 'utf-8' });
  const repo = JSON.parse(repoInfo).nameWithOwner;
  
  const output = execSync(`gh pr list --state merged --repo ${repo} --limit 100 --json createdAt,mergedAt`, { encoding: 'utf-8' });
  const prs = JSON.parse(output);
  
  let totalLatencyMs = 0;
  let count = 0;
  
  for (const pr of prs) {
    if (pr.createdAt && pr.mergedAt) {
      const created = new Date(pr.createdAt).getTime();
      const merged = new Date(pr.mergedAt).getTime();
      totalLatencyMs += (merged - created);
      count++;
    }
  }
  
  const avgLatencyHours = count > 0 ? (totalLatencyMs / count) / (1000 * 60 * 60) : 0;
  
  process.stdout.write(JSON.stringify({
    metric: 'pr_latency',
    value: Math.round(avgLatencyHours * 100) / 100,
    timestamp: new Date().toISOString()
  }));
} catch (err) {
  process.stderr.write(err.message);
  process.exit(1);
}
