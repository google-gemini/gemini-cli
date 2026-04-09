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

# Search for issues updated in the last 30 days to ensure we catch all weekly activity
SEARCH_QUERY = f'repo:{TARGET_REPO} is:issue label:area/core,area/extensions,area/site label:"help wanted" updated:>=2026-03-10 sort:updated-desc'

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
        timelineItems(itemTypes: CROSS_REFERENCED_EVENT, last: 50) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                ... on PullRequest {
                  number
                  title
                  url
                  state
                  createdAt
                  updatedAt
                  mergedAt
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
                      updatedAt
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

def parse_date(date_str):
    if not date_str: return None
    return datetime.datetime.fromisoformat(date_str.replace('Z', '+00:00'))

def main():
    print("Fetching weekly team review statistics...")
    all_issues = []
    cursor = None
    while True:
        data = gh_api_graphql(ISSUES_QUERY, {"searchQuery": SEARCH_QUERY, "cursor": cursor})
        if not data: break
        search_data = data['data']['search']
        all_issues.extend(search_data['nodes'])
        if not search_data['pageInfo']['hasNextPage']: break
        cursor = search_data['pageInfo']['endCursor']

    now = datetime.datetime.now(datetime.timezone.utc)
    one_week_ago = now - datetime.timedelta(days=7)

    # Member data structure
    stats = {login: {
        "name": name, 
        "weekly_assigned": 0, 
        "weekly_closed": 0, 
        "open_queue": [],
        "history": []
    } for login, name in MAINTAINERS.items()}
    
    processed_prs = set()
    
    for issue in all_issues:
        issue_no = issue['number']
        events = issue.get('timelineItems', {}).get('nodes', [])
        
        for event in events:
            pr = event.get('source')
            if not pr or 'number' not in pr or pr['number'] in processed_prs: continue
            
            # Find official human reviewers
            reviewers = set()
            for req in pr.get('reviewRequests', {}).get('nodes', []):
                rr = req.get('requestedReviewer')
                if rr and 'login' in rr: reviewers.add(rr['login'])
            for rev in pr.get('latestReviews', {}).get('nodes', []):
                if rev.get('author'): reviewers.add(rev['author']['login'])
            
            for reviewer in reviewers:
                if reviewer in stats:
                    created_at = parse_date(pr['createdAt'])
                    updated_at = parse_date(pr['updatedAt'])
                    merged_at = parse_date(pr.get('mergedAt'))
                    
                    pr_info = {
                        "number": pr['number'],
                        "title": pr['title'],
                        "url": pr['url'],
                        "state": pr['state'],
                        "updated": pr['updatedAt'][:10],
                        "issue_no": issue_no
                    }

                    # Weekly Logic
                    if created_at and created_at >= one_week_ago:
                        stats[reviewer]["weekly_assigned"] += 1
                    
                    if pr['state'] != 'OPEN':
                        # If closed/merged this week
                        if updated_at and updated_at >= one_week_ago:
                            stats[reviewer]["weekly_closed"] += 1
                        stats[reviewer]["history"].append(pr_info)
                    else:
                        stats[reviewer]["open_queue"].append(pr_info)
            
            processed_prs.add(pr['number'])

    # Generate Markdown
    ts = now.strftime("%Y-%m-%d %H:%M")
    md = f"# 📊 Gemini CLI Weekly Team Review Stats\n\n"
    md += f"*Report Period: {(one_week_ago).strftime('%Y-%m-%d')} to {now.strftime('%Y-%m-%d')}*\n"
    md += f"*Last Updated: {ts} (UTC)*\n\n"
    
    md += "## 📈 Weekly Summary\n"
    md += "Stats for PRs linked to 'Help Wanted' issues.\n\n"
    md += "| Maintainer | New Assignments (Week) | Closed/Merged (Week) | Current Open Queue |\n"
    md += "| :--- | :--- | :--- | :--- |\n"
    
    sorted_members = sorted(stats.items(), key=lambda x: x[1]['weekly_closed'], reverse=True)
    for login, data in sorted_members:
        md += f"| **{data['name']}** (@{login}) | {data['weekly_assigned']} | **{data['weekly_closed']}** | {len(data['open_queue'])} |\n"

    md += "\n---\n"
    md += "## 👤 Individual Review Queues\n"
    
    for login, data in sorted(stats.items(), key=lambda x: x[1]['name']):
        md += f"\n### {data['name']} (@{login})\n"
        md += "#### 🟢 Active Queue\n"
        md += "| PR | Issue | Title | Updated |\n"
        md += "| :--- | :--- | :--- | :--- |\n"
        for p in sorted(data['open_queue'], key=lambda x: x['updated'], reverse=True):
            md += f"| [#{p['number']}]({p['url']}) | #{p['issue_no']} | {p['title']} | `{p['updated']}` |\n"
        if not data['open_queue']: md += "| - | - | _No active reviews._ | - |\n"

        # Show recent history (last 7 days closed)
        recent_closed = [p for p in data['history'] if parse_date(p['updated']+'T00:00:00Z') >= one_week_ago]
        if recent_closed:
            md += "\n#### 🔴 Recently Closed (This Week)\n"
            md += "| PR | Issue | Title | Closed Date |\n"
            md += "| :--- | :--- | :--- | :--- |\n"
            for p in recent_closed:
                md += f"| [#{p['number']}]({p['url']}) | #{p['issue_no']} | {p['title']} | `{p['updated']}` |\n"

    md += "\n---\n*Report generated by automated triage script.*"
    
    with open("TEAM_STATS.md", "w") as f:
        f.write(md)
    print("Successfully generated TEAM_STATS.md (Weekly Stats).")

if __name__ == "__main__":
    main()
