const { execSync } = require('child_process');

function runCommand(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8' }).trim();
  } catch (error) {
    // Return empty or structured error so the agent can see it rather than failing the whole script
    return JSON.stringify({ error: error.message });
  }
}

async function analyzeIssue(issueLink, maintainersList) {
  if (!issueLink) {
    console.error(JSON.stringify({ error: "Issue link is required." }));
    process.exit(1);
  }

  const parts = issueLink.split('/');
  const issueNumberStr = parts[parts.length - 1];
  const issueNumber = parseInt(issueNumberStr, 10);
  const repoName = parts[parts.length - 3];
  const repoOwner = parts[parts.length - 4];
  const repo = `${repoOwner}/${repoName}`;

  const maintainers = maintainersList ? maintainersList.split(',').map(m => m.trim()) : [];

  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 14);

  const result = {
    issue_link: issueLink,
    repo: repo,
    issue_number: issueNumber,
    is_tracked_by_epic: false,
    is_stale: false,
    inactive_over_30_days: false,
    inactive_over_60_days: false,
    has_assignees: false,
    is_feature_request: false,
    is_high_priority: false,
    is_epic: false,
    reporter: null,
    assignees: [],
    labels: [],
    cross_references: [],
    deadline_date: deadline.toISOString().split('T')[0]
  };

  try {
    // 1. Fetch Issue Data
    const issueDataRaw = runCommand(`gh issue view ${issueLink} --json title,body,author,comments,labels,assignees,updatedAt`);
    if (issueDataRaw.startsWith('{"error"')) {
       console.error(issueDataRaw);
       process.exit(1);
    }
    const issue = JSON.parse(issueDataRaw);
    
    result.reporter = issue.author.login;
    result.assignees = issue.assignees.map(a => a.login);
    result.has_assignees = result.assignees.length > 0;
    result.labels = issue.labels.map(l => l.name);
    
    result.is_feature_request = result.labels.some(l => {
      const lower = l.toLowerCase();
      return lower.includes('feature') || lower.includes('enhancement');
    });
    
    result.is_high_priority = result.labels.some(l => {
      const lower = l.toLowerCase();
      return lower.includes('priority/p0') || lower.includes('priority/p1');
    });

    // 2. Fetch Timeline for cross references
    const timelineCmd = `gh api repos/${repo}/issues/${issueNumber}/timeline --jq '[.[] | select(.event == "cross-referenced" and .source.issue)] | map({issue: .source.issue.number, state: .source.issue.state, state_reason: .source.issue.state_reason, is_pr: (.source.issue.pull_request != null), is_merged: (.source.issue.pull_request.merged_at != null)})'`;
    const timelineRaw = runCommand(timelineCmd);
    if (!timelineRaw.startsWith('{"error"')) {
        result.cross_references = JSON.parse(timelineRaw);
    }

    // 3. Check if Epic (has sub issues or title starts with [Epic])
    const epicCmd = `gh api repos/${repo}/issues/${issueNumber} --jq '{is_epic: (.sub_issues_summary.total > 0)}'`;
    const epicRaw = runCommand(epicCmd);
    if (!epicRaw.startsWith('{"error"')) {
        result.is_epic = JSON.parse(epicRaw).is_epic || issue.title.toLowerCase().startsWith('[epic]');
    } else {
        result.is_epic = issue.title.toLowerCase().startsWith('[epic]');
    }

    // 4. Check for Parent Issue via GraphQL
    const query = `query($owner: String!, $repo: String!, $issueNumber: Int!) { repository(owner: $owner, name: $repo) { issue(number: $issueNumber) { trackedInIssues(first: 1) { totalCount } } } }`;
    const gqlCmd = `gh api graphql -F owner=${repoOwner} -F repo=${repoName} -F issueNumber=${issueNumber} -f query='${query}' --jq '.data.repository.issue.trackedInIssues.totalCount'`;
    const parentCountRaw = runCommand(gqlCmd);
    if (!parentCountRaw.startsWith('{"error"')) {
        const count = parseInt(parentCountRaw, 10);
        result.is_tracked_by_epic = !isNaN(count) && count > 0;
    }

    // Staleness Logic
    if (result.is_tracked_by_epic) {
      result.is_stale = true;
    } else {
      // Find last maintainer comment
      const maintainerComments = issue.comments.filter(c => {
        if (c.author.login === result.reporter) return false;
        
        const isMaintainer = maintainers.includes(c.author.login) || 
                             ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(c.authorAssociation);
        
        if (maintainers.length > 0) return isMaintainer;
        // Basic bot exclusion if no maintainers defined
        return !c.author.login.includes('github-actions') && c.author.login !== 'app/github-actions';
      });

      if (maintainerComments.length > 0) {
        const lastMaintainerComment = maintainerComments[maintainerComments.length - 1];
        
        // Did reporter reply after maintainer?
        const reporterReplied = issue.comments.some(c => {
            return c.author.login === result.reporter && 
                   new Date(c.updatedAt) > new Date(lastMaintainerComment.updatedAt);
        });

        if (!reporterReplied) {
          const daysAgo = (new Date() - new Date(lastMaintainerComment.updatedAt)) / (1000 * 60 * 60 * 24);
          if (daysAgo > 7) {
             result.is_stale = true;
          }
        }
      }
    }

    // Age / Inactivity check
    if (!result.is_stale) {
       const lastUpdateDaysAgo = (new Date() - new Date(issue.updatedAt)) / (1000 * 60 * 60 * 24);
       if (lastUpdateDaysAgo > 60) {
          result.inactive_over_60_days = true;
          result.inactive_over_30_days = true;
       } else if (lastUpdateDaysAgo > 30) {
          result.inactive_over_30_days = true;
       }
    }

    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const issueLink = args[0];
const maintainers = args[1] || ""; // Comma separated list of maintainers

if (!issueLink) {
  console.log("Usage: node analyze_issue.cjs <issue_link> [maintainers_csv]");
  console.log("Example: node analyze_issue.cjs https://github.com/owner/repo/issues/123 'user1,user2'");
  process.exit(1);
}

analyzeIssue(issueLink, maintainers);
