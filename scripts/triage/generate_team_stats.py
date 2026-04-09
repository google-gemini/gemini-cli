import subprocess
import json
import datetime
import sys

# Target repository
TARGET_REPO = 'google-gemini/gemini-cli'

# Maintainers list
MAINTAINERS = {
    "Adib234": "A.K.M. Adib",
    "cocosheng-g": "Coco Sheng",
    "cynthialong0-0": "Cynthia Long",
    "devr0306": "Dev Randalpura",
    "ivanporty": "Ivan Port",
    "kschaab": "Keith Schaab",
    "ruomengz": "Ruomeng Zhang",
    "spencer426": "Spencer Tang",
    "sripasg": "Sri Pasumarthi",
    "scidomino": "Tommaso Sciortino"
}

# The EXACT search query used by the dashboard
SEARCH_QUERY = f'repo:{TARGET_REPO} is:issue state:open label:area/core,area/extensions,area/site label:"help wanted" sort:updated-asc'

ISSUES_QUERY = """
query($searchQuery: String!, $cursor: String) {
  search(query: $searchQuery, type: ISSUE, first: 100, after: $cursor) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      ... on Issue {
        number
        timelineItems(itemTypes: CROSS_REFERENCED_EVENT, last: 20) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                ... on PullRequest {
                  number
                  title
                  url
                  state
                  updatedAt
                  author { login }
                  reviewRequests(first: 10) {
                    nodes {
                      requestedReviewer {
                        ... on User { login }
                      }
                    }
                  }
                  latestReviews(first: 20) {
                    nodes {
                      author { login }
                      state
                    }
                  }
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

def gh_api_graphql(query, variables):
    cmd = ['gh', 'api', 'graphql']
    for k, v in variables.items():
        if v: cmd.extend(['-F', f'{k}={v}'])
    cmd.extend(['-f', f'query={query}'])
    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout) if result.returncode == 0 else None

def main():
    print("Fetching dashboard-consistent team review statistics...")
    all_issues = []
    cursor = None
    while True:
        data = gh_api_graphql(ISSUES_QUERY, {"searchQuery": SEARCH_QUERY, "cursor": cursor})
        if not data: break
        search_data = data['data']['search']
        all_issues.extend(search_data['nodes'])
        if not search_data['pageInfo']['hasNextPage']: break
        cursor = search_data['pageInfo']['endCursor']

    # Member data structure
    stats = {login: {"name": name, "open_prs": [], "closed_prs": []} for login, name in MAINTAINERS.items()}
    
    # Process issues to find official reviewers
    processed_prs = set()
    
    for issue in all_issues:
        issue_no = issue['number']
        events = issue.get('timelineItems', {}).get('nodes', [])
        
        for event in events:
            pr = event.get('source')
            if not pr or 'number' not in pr or pr['number'] in processed_prs: continue
            
            # Find official human reviewers
            reviewers = set()
            
            # 1. Requested
            for req in pr.get('reviewRequests', {}).get('nodes', []):
                rr = req.get('requestedReviewer')
                if rr and 'login' in rr:
                    reviewers.add(rr['login'])
            
            # 2. Formal Reviewers
            for rev in pr.get('latestReviews', {}).get('nodes', []):
                if rev.get('author'):
                    reviewers.add(rev['author']['login'])
            
            # Record for each maintainer
            for reviewer in reviewers:
                if reviewer in stats:
                    pr_info = {
                        "number": pr['number'],
                        "title": pr['title'],
                        "url": pr['url'],
                        "state": pr['state'],
                        "updated": pr['updatedAt'][:10],
                        "issue_no": issue_no
                    }
                    if pr['state'] == 'OPEN':
                        stats[reviewer]["open_prs"].append(pr_info)
                    else:
                        stats[reviewer]["closed_prs"].append(pr_info)
            
            processed_prs.add(pr['number'])

    # Generate Markdown
    now = datetime.datetime.now(datetime.timezone.utc)
    ts = now.strftime("%Y-%m-%d %H:%M")
    md = f"# 📊 Gemini CLI Team Review Statistics\n\n"
    md += f"*Last Updated: {ts} (UTC)*\n\n"
    md += f"**Context:** Statistics for Pull Requests linked to the {len(all_issues)} 'Help Wanted' issues.\n\n"
    
    md += "## 📈 Summary\n\n"
    md += "| Maintainer | Open PRs | Closed/Merged PRs |\n"
    md += "| :--- | :--- | :--- |\n"
    
    sorted_members = sorted(stats.items(), key=lambda x: len(x[1]['open_prs']), reverse=True)
    for login, data in sorted_members:
        md += f"| **{data['name']}** (@{login}) | {len(data['open_prs'])} | {len(data['closed_prs'])} |\n"

    md += "\n---\n"
    md += "## 👤 Individual Review Queues\n"
    
    for login, data in sorted(stats.items(), key=lambda x: x[1]['name']):
        md += f"\n### {data['name']} (@{login})\n"
        md += "| PR | Associated Issue | Title | Status | Updated |\n"
        md += "| :--- | :--- | :--- | :--- | :--- |\n"
        
        for p in data['open_prs']:
            md += f"| [#{p['number']}]({p['url']}) | #{p['issue_no']} | {p['title']} | `{p['state']}` | `{p['updated']}` |\n"
            
        if not data['open_prs']:
            md += "| - | - | _No active reviews._ | - | - |\n"

    md += "\n---\n*Report generated by automated triage script.*"
    
    with open("TEAM_STATS.md", "w") as f:
        f.write(md)
    print("Successfully generated TEAM_STATS.md (Dashboard Consistent).")

if __name__ == "__main__":
    main()
