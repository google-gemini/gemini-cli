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

# Broader search to include recently closed issues (to catch merged PRs)
# We look for issues updated since March 1st, 2026 to keep the history relevant but manageable.
SEARCH_QUERY = f'repo:{TARGET_REPO} is:issue label:area/core,area/extensions,area/site label:"help wanted" updated:>=2026-03-01 sort:updated-desc'

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
        url
        timelineItems(itemTypes: CROSS_REFERENCED_EVENT, last: 50) {
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
    if result.returncode != 0:
        return None
    return json.loads(result.stdout)

def main():
    print("Fetching expanded team review statistics (including recently merged)...")
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
    stats = {login: {"name": name, "all_prs": {}} for login, name in MAINTAINERS.items()}
    
    # Process issues to find official reviewers
    for issue in all_issues:
        issue_no = issue['number']
        issue_url = issue['url']
        events = issue.get('timelineItems', {}).get('nodes', [])
        
        for event in events:
            pr = event.get('source')
            if not pr or 'number' not in pr: continue
            
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
                        "issue_no": issue_no,
                        "issue_url": issue_url
                    }
                    # Use a dict keyed by PR number to avoid duplicates from multiple cross-references
                    stats[reviewer]["all_prs"][pr['number']] = pr_info

    # Generate Markdown
    now = datetime.datetime.now(datetime.timezone.utc)
    ts = now.strftime("%Y-%m-%d %H:%M")
    md = f"# 📊 Gemini CLI Team Review Statistics\n\n"
    md += f"*Last Updated: {ts} (UTC)*\n\n"
    md += f"**Context:** Statistics for Pull Requests linked to 'Help Wanted' issues (updated since 2026-03-01).\n\n"
    
    md += "## 📈 Summary\n\n"
    md += "| Maintainer | Open PRs | Closed/Merged PRs | Total |\n"
    md += "| :--- | :--- | :--- | :--- |\n"
    
    # Pre-calculate counts for sorting
    sorted_stats = []
    for login, data in stats.items():
        all_prs = list(data['all_prs'].values())
        opened = len([p for p in all_prs if p['state'] == 'OPEN'])
        closed = len([p for p in all_prs if p['state'] != 'OPEN'])
        sorted_stats.append({
            "login": login, "name": data['name'], "open_count": opened, "closed_count": closed, "total": len(all_prs), "prs": all_prs
        })
    
    # Sort summary by open count descending
    for s in sorted(sorted_stats, key=lambda x: x['open_count'], reverse=True):
        md += f"| **{s['name']}** (@{s['login']}) | {s['open_count']} | {s['closed_count']} | {s['total']} |\n"

    md += "\n---\n"
    md += "## 👤 Individual Review History\n"
    md += "*Note: PRs are sorted by status (Open first) and then by update date.*\n"
    
    # Sort detailed queues alphabetically by name
    for s in sorted(sorted_stats, key=lambda x: x['name']):
        md += f"\n### {s['name']} (@{s['login']})\n"
        md += "| PR | Associated Issue | Title | Status | Updated |\n"
        md += "| :--- | :--- | :--- | :--- | :--- |\n"
        
        # Sort PRs: Open first, then by date descending
        sorted_prs = sorted(s['prs'], key=lambda x: (x['state'] != 'OPEN', x['updated']), reverse=False)
        
        for p in sorted_prs:
            status_emoji = "🟢" if p['state'] == 'OPEN' else "🔴"
            md += f"| {status_emoji} [#{p['number']}]({p['url']}) | [#{p['issue_no']}]({p['issue_url']}) | {p['title']} | `{p['state']}` | `{p['updated']}` |\n"
            
        if not s['prs']:
            md += "| - | - | _No review history found._ | - | - |\n"

    md += "\n---\n*Report generated by automated triage script.*"
    
    with open("TEAM_STATS.md", "w") as f:
        f.write(md)
    print("Successfully generated TEAM_STATS.md (Expanded search).")

if __name__ == "__main__":
    main()
