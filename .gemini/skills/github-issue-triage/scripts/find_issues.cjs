const { execSync } = require('child_process');

function findIssues(repo, searchString = "label:area/core,area/extensions,area/site,area/non-interactive sort:updated-asc", limit = 10) {
  if (!repo) {
    console.error(JSON.stringify({ error: "Repository is required (e.g., owner/repo)" }));
    process.exit(1);
  }

  try {
    const cmd = `gh issue list --repo ${repo} --state open --search "${searchString}" --json url --limit ${limit}`;
    const output = execSync(cmd, { encoding: 'utf-8' });
    const issues = JSON.parse(output);
    const urls = issues.map(issue => issue.url);
    
    console.log(JSON.stringify({ issue_urls: urls }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const repo = args[0];
const searchString = args[1];
const limitStr = args[2];
const limit = limitStr ? parseInt(limitStr, 10) : 10;

if (!repo) {
  console.log("Usage: node find_issues.cjs <owner/repo> [search_string] [limit]");
  console.log("Example: node find_issues.cjs google-gemini/gemini-cli 'label:area/core sort:updated-asc' 10");
  process.exit(1);
}

findIssues(repo, searchString, limit);
