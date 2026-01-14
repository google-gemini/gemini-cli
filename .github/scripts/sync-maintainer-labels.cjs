const { Octokit } = require('@octokit/rest');

/**
 * Sync Maintainer Labels (Recursive with strict parent-child relationship detection)
 * - Uses Native Sub-issues.
 * - Uses Markdown Task Lists (- [ ] #123).
 * - Filters for OPEN issues only.
 * - Skips DUPLICATES.
 * - Skips Pull Requests.
 * - ONLY labels issues in the PUBLIC (gemini-cli) repo.
 */

const REPO_OWNER = 'google-gemini';
const PUBLIC_REPO = 'gemini-cli';
const PRIVATE_REPO = 'maintainers-gemini-cli';
const ALLOWED_REPOS = [PUBLIC_REPO, PRIVATE_REPO];

const ROOT_ISSUES = [
  { owner: REPO_OWNER, repo: PUBLIC_REPO, number: 15374 },
  { owner: REPO_OWNER, repo: PUBLIC_REPO, number: 15456 },
  { owner: REPO_OWNER, repo: PUBLIC_REPO, number: 15324 }
];

const TARGET_LABEL = '🔒 maintainer only';
const isDryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

/**
 * Extracts child issue references from markdown Task Lists ONLY.
 * e.g. - [ ] #123 or - [x] google-gemini/gemini-cli#123
 */
function extractTaskListLinks(text, contextOwner, contextRepo) {
  if (!text) return [];
  const childIssues = new Map();

  const add = (owner, repo, number) => {
    if (ALLOWED_REPOS.includes(repo)) {
      const key = `${owner}/${repo}#${number}`;
      childIssues.set(key, { owner, repo, number: parseInt(number, 10) });
    }
  };

  // 1. Full URLs in task lists
  const urlRegex = /-\s+\[[ x]\].*https:\/\/github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)\/issues\/(\d+)\b/g;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    add(match[1], match[2], match[3]);
  }

  // 2. Cross-repo refs in task lists: owner/repo#123
  const crossRepoRegex = /-\s+\[[ x]\].*([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)#(\d+)\b/g;
  while ((match = crossRepoRegex.exec(text)) !== null) {
    add(match[1], match[2], match[3]);
  }

  // 3. Short refs in task lists: #123
  const shortRefRegex = /-\s+\[[ x]\].*#(\d+)\b/g;
  while ((match = shortRefRegex.exec(text)) !== null) {
    add(contextOwner, contextRepo, match[1]);
  }

  return Array.from(childIssues.values());
}

/**
 * Fetches issue data via GraphQL.
 */
async function fetchIssueData(owner, repo, number) {
  const query = `
    query($owner:String!, $repo:String!, $number:Int!) {
      repository(owner:$owner, name:$repo) {
        issue(number:$number) {
          id
          number
          state
          body
          labels(first: 20) {
            nodes { name }
          }
          subIssues(first: 100) {
            nodes {
              number
              repository {
                name
                owner { login }
              }
            }
          }
          comments(first: 100) {
            nodes {
              body
            }
          }
        }
      }
    }
  `;

  try {
    const response = await octokit.graphql(query, { owner, repo, number });
    return response.repository.issue;
  } catch (error) {
    if (error.errors && error.errors.some(e => e.type === 'NOT_FOUND')) {
      return null;
    }
    throw error;
  }
}

/**
 * Validates if an issue should be processed (Open, not a duplicate, not a PR)
 */
function shouldProcess(issueData) {
  if (!issueData) return false;
  
  if (issueData.state !== 'OPEN') return false;

  const labels = issueData.labels.nodes.map(l => l.name.toLowerCase());
  if (labels.includes('duplicate') || labels.includes('kind/duplicate')) {
    return false;
  }

  return true;
}

async function getAllDescendants(roots) {
  const allDescendants = new Map();
  const visited = new Set();
  const queue = [...roots];

  for (const root of roots) {
    visited.add(`${root.owner}/${root.repo}#${root.number}`);
  }

  console.log(`Starting discovery from ${roots.length} roots...`);

  while (queue.length > 0) {
    const current = queue.shift();
    const currentKey = `${current.owner}/${current.repo}#${current.number}`;

    try {
      const issueData = await fetchIssueData(current.owner, current.repo, current.number);
      
      if (!shouldProcess(issueData)) {
        continue;
      }

      // ONLY add to labeling list if it's in the PUBLIC repository
      if (current.repo === PUBLIC_REPO) {
        // Don't label the roots themselves
        if (!ROOT_ISSUES.some(r => r.number === issueData.number && r.repo === current.repo)) {
          allDescendants.set(currentKey, current);
        }
      }

      const children = new Map();

      // 1. Process Native Sub-issues
      if (issueData.subIssues && issueData.subIssues.nodes) {
        for (const node of issueData.subIssues.nodes) {
          const childOwner = node.repository.owner.login;
          const childRepo = node.repository.name;
          const childNumber = node.number;
          const key = `${childOwner}/${childRepo}#${childNumber}`;
          children.set(key, { owner: childOwner, repo: childRepo, number: childNumber });
        }
      }

      // 2. Process Markdown Task Lists in Body and Comments
      let combinedText = issueData.body || '';
      if (issueData.comments && issueData.comments.nodes) {
        for (const comment of issueData.comments.nodes) {
          combinedText += '\n' + (comment.body || '');
        }
      }
      
      const taskListLinks = extractTaskListLinks(combinedText, current.owner, current.repo);
      for (const link of taskListLinks) {
        const key = `${link.owner}/${link.repo}#${link.number}`;
        children.set(key, link);
      }

      // Queue children (regardless of which repo they are in, for recursion)
      for (const [key, child] of children) {
        if (!visited.has(key)) {
          visited.add(key);
          queue.push(child);
        }
      }
    } catch (error) {
      console.error(`Error processing ${currentKey}: ${error.message}`);
    }
  }

  return Array.from(allDescendants.values());
}

async function run() {
  if (isDryRun) {
    console.log('=== DRY RUN MODE: No labels will be applied ===');
  }

  const descendants = await getAllDescendants(ROOT_ISSUES);
  console.log(`\nFound ${descendants.length} total unique open descendant issues in ${PUBLIC_REPO}.`);

  for (const issueInfo of descendants) {
    const issueKey = `${issueInfo.owner}/${issueInfo.repo}#${issueInfo.number}`;
    try {
      const { data: issue } = await octokit.rest.issues.get({
        owner: issueInfo.owner,
        repo: issueInfo.repo,
        issue_number: issueInfo.number,
      });

      if (issue.pull_request || issue.state !== 'open') continue;

      const hasLabel = issue.labels.some(l => l.name === TARGET_LABEL);

      if (!hasLabel) {
        if (isDryRun) {
          console.log(`[DRY RUN] Would label ${issueKey}: "${issue.title}"`);
        } else {
          console.log(`Labeling ${issueKey}: "${issue.title}"...`);
          await octokit.rest.issues.addLabels({
            owner: issueInfo.owner,
            repo: issueInfo.repo,
            issue_number: issueInfo.number,
            labels: [TARGET_LABEL],
          });
        }
      }
    } catch (error) {
      console.error(`Error processing label for ${issueKey}: ${error.message}`);
    }
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});