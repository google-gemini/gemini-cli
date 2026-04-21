import { execSync } from 'node:child_process';

try {
  const repoInfo = execSync('gh repo view --json nameWithOwner', { encoding: 'utf-8' });
  const repo = JSON.parse(repoInfo).nameWithOwner;
  const output = execSync(`gh search prs --state open --repo ${repo} --limit 1000 --json authorAssociation`, { encoding: 'utf-8' });
  const prs = JSON.parse(output);
  const communityPrs = prs.filter(pr => 
    pr.authorAssociation !== 'MEMBER' && 
    pr.authorAssociation !== 'OWNER' && 
    pr.authorAssociation !== 'COLLABORATOR'
  );
  process.stdout.write(JSON.stringify({
    metric: 'open_community_prs',
    value: communityPrs.length,
    timestamp: new Date().toISOString()
  }));
} catch (err) {
  process.stderr.write(err.message);
  process.exit(1);
}
