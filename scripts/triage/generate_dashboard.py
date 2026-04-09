import subprocess
import json
import datetime
import os

# Target repository to query for issues
TARGET_REPO = 'google-gemini/gemini-cli'

# Exact search query from original user request:
# is:issue state:open label:area/core,area/extensions,area/site label:"help wanted" sort:updated-asc
SEARCH_QUERY = f'repo:{TARGET_REPO} is:issue state:open label:area/core,area/extensions,area/site label:"help wanted" sort:updated-asc'

GRAPHQL_QUERY = """
query($searchQuery: String!) {
  search(query: $searchQuery, type: ISSUE, first: 100) {
    nodes {
      ... on Issue {
        number
        title
        url
        updatedAt
        assignees(first: 1) { totalCount }
        timelineItems(itemTypes: CROSS_REFERENCED_EVENT, first: 20) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                ... on PullRequest {
                  number
                  url
                  state
                  isDraft
                  mergeable
                  baseRepository {
                    nameWithOwner
                  }
                  statusCheckRollup { state }
                  closingIssuesReferences(first: 5) { nodes { number } }
                  reviewThreads(first: 50) { nodes { isResolved } }
                }
              }
            }
          }
        }
      }
    }
  }
}
"""

def fetch_data():
    cmd = ['gh', 'api', 'graphql', '-F', f'searchQuery={SEARCH_QUERY}', '-f', f'query={GRAPHQL_QUERY}']
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        return None
    return json.loads(result.stdout)

def filter_ready_issues(data):
    issues = data.get('data', {}).get('search', {}).get('nodes', [])
    ready_list = []
    
    for issue in issues:
        issue_no = issue['number']
        
        # Check if assigned
        if issue['assignees']['totalCount'] == 0:
            continue
            
        valid_pr = None
        timeline_nodes = issue.get('timelineItems', {}).get('nodes', [])
        for event in timeline_nodes:
            pr = event.get('source')
            if not pr or pr.get('state') != 'OPEN' or pr.get('isDraft'):
                continue
            
            # Target main repo (google-gemini/gemini-cli)
            if pr.get('baseRepository', {}).get('nameWithOwner') != TARGET_REPO:
                continue
                
            # Officially linked
            closing_issues = [n['number'] for n in pr['closingIssuesReferences']['nodes']]
            if issue_no not in closing_issues:
                continue
            
            # Check blockers (conflicts, tests, comments)
            if pr['mergeable'] == 'CONFLICTING': continue
            if pr.get('statusCheckRollup', {}).get('state') == 'FAILURE': continue
            if any(not thread['isResolved'] for thread in pr['reviewThreads']['nodes']): continue
            
            # If all checks pass, we have our PR
            valid_pr = pr
            break
            
        if valid_pr:
            ready_list.append({
                "issue_no": issue_no,
                "title": issue['title'],
                "issue_url": issue['url'],
                "pr_no": valid_pr['number'],
                "pr_url": valid_pr['url'],
                "updated_at": issue['updatedAt'][:10]
            })
            
    return ready_list

def generate_markdown(ready_list):
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    md = f"# 🔎 Gemini CLI Review Dashboard\n\n"
    md += f"*Last Synchronized: {now} (UTC)*\n\n"
    md += "### Criteria for Inclusion\n"
    md += "- Issue is **assigned** to a contributor.\n"
    md += "- PR is **officially linked** (e.g., 'Closes #number') and targets the main repo.\n"
    md += "- PR is **open** and **not a draft**.\n"
    md += "- PR has **no merge conflicts**.\n"
    md += "- PR status checks are **not failing** (Allows SUCCESS or PENDING).\n"
    md += "- PR has **all review comments resolved**.\n\n"
    
    md += "| # | Issue Title | Linked PR | Ready Since |\n"
    md += "| :--- | :--- | :--- | :--- |\n"
    
    for item in ready_list:
        md += f"| {item['issue_no']} | [{item['title']}]({item['issue_url']}) | [#{item['pr_no']}]({item['pr_url']}) | `{item['updated_at']}` |\n"
        
    if not ready_list:
        md += "| - | _No issues matching criteria found._ | - | - |\n"
        
    md += "\n---\n*Dashboard maintained by automated triage script.*"
    return md

def main():
    data = fetch_data()
    if not data: return
    
    ready_list = filter_ready_issues(data)
    markdown_content = generate_markdown(ready_list)
    
    # Write to local file (or stdout if preferred)
    with open("REVIEWS.md", "w") as f:
        f.write(markdown_content)
    print(f"Successfully generated REVIEWS.md with {len(ready_list)} issues.")

if __name__ == "__main__":
    main()
