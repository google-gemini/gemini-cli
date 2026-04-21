import { execSync } from 'node:child_process';

try {
  const repoInfo = execSync('gh repo view --json nameWithOwner', { encoding: 'utf-8' });
  const repo = JSON.parse(repoInfo).nameWithOwner;
  const [owner, name] = repo.split('/');
  
  const query = `query($endCursor: String) { repository(owner: "${owner}", name: "${name}") { pullRequests(states: MERGED, first: 100, after: $endCursor) { nodes { authorAssociation } pageInfo { hasNextPage endCursor } } } }`;

  const command = `gh api graphql --paginate -f query='${query}' --jq '.data.repository.pullRequests.nodes[] | select(.authorAssociation != "MEMBER" and .authorAssociation != "OWNER" and .authorAssociation != "COLLABORATOR") | .authorAssociation' | wc -l`;
  
  const output = execSync(command, { encoding: 'utf-8' });
  const completedCommunityPrs = parseInt(output.trim(), 10);
  
  process.stdout.write(JSON.stringify({
    metric: 'completed_community_prs',
    value: completedCommunityPrs,
    timestamp: new Date().toISOString()
  }));
} catch (err) {
  process.stderr.write(err.message);
  process.exit(1);
}
