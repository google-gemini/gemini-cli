/* eslint-disable @typescript-eslint/no-require-imports */
/* global process, console, require */
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
  { owner: REPO_OWNER, repo: PUBLIC_REPO, number: 15324 },
];

const TARGET_LABEL = '🔒 maintainer only';
const isDryRun =
  process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';

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
  const urlRegex =
    /-\s+\[[ x]\].*https:\/\/github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)\/issues\/(\d+)\b/g;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    add(match[1], match[2], match[3]);
  }

  // 2. Cross-repo refs in task lists: owner/repo#123
  const crossRepoRegex =
    /-\s+\[[ x]\].*([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)#(\d+)\b/g;
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
 * Fetches issue data via GraphQL with full pagination for sub-issues, comments, and labels.
 */
async function fetchIssueData(owner, repo, number) {
  const query = `
    query($owner:String!, $repo:String!, $number:Int!) {
      repository(owner:$owner, name:$repo) {
        issue(number:$number) {
          state
          title
          body
          labels(first: 100) {
            nodes { name }
            pageInfo { hasNextPage endCursor }
          }
          subIssues(first: 100) {
            nodes {
              number
              repository {
                name
                owner { login }
              }
            }
            pageInfo { hasNextPage endCursor }
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
    const data = response.repository.issue;
    if (!data) return null;

    const issue = {
      state: data.state,
      title: data.title,
      body: data.body || '',
      labels: data.labels.nodes.map((n) => n.name),
      subIssues: [...data.subIssues.nodes],
      comments: data.comments.nodes.map((n) => n.body),
    };

    // Paginate subIssues if there are more than 100
    if (data.subIssues.pageInfo.hasNextPage) {
      const moreSubIssues = await paginateConnection(
        owner,
        repo,
        number,
        'subIssues',
        'number repository { name owner { login } }',
        data.subIssues.pageInfo.endCursor,
      );
      issue.subIssues.push(...moreSubIssues);
    }

    // Paginate labels if there are more than 100 (unlikely but for completeness)
    if (data.labels.pageInfo.hasNextPage) {
      const moreLabels = await paginateConnection(
        owner,
        repo,
        number,
        'labels',
        'name',
        data.labels.pageInfo.endCursor,
        (n) => n.name,
      );
      issue.labels.push(...moreLabels);
    }

    // Note: Comments are handled via Task Lists in body + first 100 comments.
    // If an issue has > 100 comments with task lists, we'd need to paginate those too.
    // Given the 1,100+ issue discovery count, 100 comments is usually sufficient,
    // but we can add it for absolute completeness.
    // (Skipping for now to avoid excessive API churn unless clearly needed).

    return issue;
  } catch (error) {
    if (error.errors && error.errors.some((e) => e.type === 'NOT_FOUND')) {
      return null;
    }
    throw error;
  }
}

/**
 * Helper to paginate any GraphQL connection.
 */
async function paginateConnection(
  owner,
  repo,
  number,
  connectionName,
  nodeFields,
  initialCursor,
  transformNode = (n) => n,
) {
  let additionalNodes = [];
  let hasNext = true;
  let cursor = initialCursor;

  while (hasNext) {
    const query = `
      query($owner:String!, $repo:String!, $number:Int!, $cursor:String) {
        repository(owner:$owner, name:$repo) {
          issue(number:$number) {
            ${connectionName}(first: 100, after: $cursor) {
              nodes { ${nodeFields} }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      }
    `;
    const response = await octokit.graphql(query, {
      owner,
      repo,
      number,
      cursor,
    });
    const connection = response.repository.issue[connectionName];
    additionalNodes.push(...connection.nodes.map(transformNode));
    hasNext = connection.pageInfo.hasNextPage;
    cursor = connection.pageInfo.endCursor;
  }
  return additionalNodes;
}

/**
 * Validates if an issue should be processed (Open, not a duplicate, not a PR)
 */
function shouldProcess(issueData) {
  if (!issueData) return false;

  if (issueData.state !== 'OPEN') return false;

  const labels = issueData.labels.map((l) => l.toLowerCase());
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
      const issueData = await fetchIssueData(
        current.owner,
        current.repo,
        current.number,
      );

      if (!shouldProcess(issueData)) {
        continue;
      }

      // ONLY add to labeling list if it's in the PUBLIC repository
      if (current.repo === PUBLIC_REPO) {
        // Don't label the roots themselves
        if (
          !ROOT_ISSUES.some(
            (r) => r.number === current.number && r.repo === current.repo,
          )
        ) {
          allDescendants.set(currentKey, {
            ...current,
            title: issueData.title,
            labels: issueData.labels,
          });
        }
      }

      const children = new Map();

      // 1. Process Native Sub-issues
      if (issueData.subIssues) {
        for (const node of issueData.subIssues) {
          const childOwner = node.repository.owner.login;
          const childRepo = node.repository.name;
          const childNumber = node.number;
          const key = `${childOwner}/${childRepo}#${childNumber}`;
          children.set(key, {
            owner: childOwner,
            repo: childRepo,
            number: childNumber,
          });
        }
      }

      // 2. Process Markdown Task Lists in Body and Comments
      let combinedText = issueData.body || '';
      if (issueData.comments) {
        for (const commentBody of issueData.comments) {
          combinedText += '\n' + (commentBody || '');
        }
      }

      const taskListLinks = extractTaskListLinks(
        combinedText,
        current.owner,
        current.repo,
      );
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
  console.log(
    `\nFound ${descendants.length} total unique open descendant issues in ${PUBLIC_REPO}.`,
  );

  for (const issueInfo of descendants) {
    const issueKey = `${issueInfo.owner}/${issueInfo.repo}#${issueInfo.number}`;
    try {
      // Data is already available from the discovery phase
      const hasLabel = issueInfo.labels.some((l) => l === TARGET_LABEL);

      if (!hasLabel) {
        if (isDryRun) {
          console.log(
            `[DRY RUN] Would label ${issueKey}: "${issueInfo.title}"`,
          );
        } else {
          console.log(`Labeling ${issueKey}: "${issueInfo.title}"...`);
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

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
