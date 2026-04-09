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

# Common bots to exclude
BOT_BLACKLIST = {
    'gemini-code-assist', 'github-actions', 'google-allstar', 'renovate',
    'dependabot', 'google-gemini-bot', 'google-cla', 'googlebot'
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
                  mergeable
                  statusCheckRollup { state }
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
                  comments(last: 20) {
                    nodes {
                      author { login }
                      publishedAt
                    }
                  }
                  commits(last: 1) {
                    nodes {
                      commit {
                        committedDate
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

def get_latest_activity(pr):
    latest = pr['commits']['nodes'][0]['commit']['committedDate']
    for c in pr.get('comments', {}).get('nodes', []):
        latest = max(latest, c['publishedAt'])
    for r in pr.get('latestReviews', {}).get('nodes', []):
        latest = max(latest, r['updatedAt'])
    return latest

def get_reviewer_activity(pr):
    author = pr.get('author', {}).get('login')
    latest = ""
    for r in pr.get('latestReviews', {}).get('nodes', []):
        if r.get('author') and r['author']['login'] != author and r['author']['login'] not in BOT_BLACKLIST:
            latest = max(latest, r['updatedAt'])
    for c in pr.get('comments', {}).get('nodes', []):
        if c.get('author') and c['author']['login'] != author and c['author']['login'] not in BOT_BLACKLIST:
            latest = max(latest, c['publishedAt'])
    return latest

def get_status_label(pr):
    latest_pr_act = get_latest_activity(pr)
    latest_rev_act = get_reviewer_activity(pr)
    
    # Check for technical blockers
    rollup = pr.get('statusCheckRollup')
    is_conflicting = pr['mergeable'] == 'CONFLICTING'
    is_failing = rollup and rollup.get('state') in ['FAILURE', 'ERROR']
    
    if is_conflicting: return "🔴 Blocked: Merge Conflict"
    if is_failing: return "🔴 Blocked: Test Failure"
    
    # Author vs Reviewer flow
    if not latest_rev_act or latest_pr_act > latest_rev_act:
        return "🟢 Awaiting Reviewer"
    else:
        return "✍️ Awaiting Author"

def main():
    print("Fetching weekly team review statistics with detailed status...")
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
    days_since_monday = now.weekday()
    report_start = (now - datetime.timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)

    # Member data structure
    stats = {login: {"name": name, "weekly_assigned": 0, "weekly_closed": 0, "open_queue": [], "history": []} for login, name in MAINTAINERS.items()}
    processed_prs = set()
    
    for issue in all_issues:
        issue_no = issue['number']
        events = issue.get('timelineItems', {}).get('nodes', [])
        for event in events:
            pr = event.get('source')
            if not pr or 'number' not in pr or pr['number'] in processed_prs: continue
            
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
                    
                    pr_info = {
                        "number": pr['number'], "title": pr['title'], "url": pr['url'],
                        "state": pr['state'], "updated": pr['updatedAt'][:10], "issue_no": issue_no,
                        "status_label": get_status_label(pr)
                    }

                    if created_at and created_at >= report_start:
                        stats[reviewer]["weekly_assigned"] += 1
                    
                    if pr['state'] != 'OPEN':
                        if updated_at and updated_at >= report_start:
                            stats[reviewer]["weekly_closed"] += 1
                        stats[reviewer]["history"].append(pr_info)
                    else:
                        stats[reviewer]["open_queue"].append(pr_info)
            
            processed_prs.add(pr['number'])

    # Generate Markdown
    ts = now.strftime("%Y-%m-%d %H:%M")
    md = f"# 📊 Gemini CLI Weekly Team Review Stats\n\n"
    md += f"*Reporting Period: **Monday {report_start.strftime('%Y-%m-%d')}** to Today*\n"
    md += f"*Last Updated: {ts} (UTC)*\n\n"
    
    md += "## 📈 Weekly Summary\n"
    md += "| Maintainer | New Assignments | Closed/Merged | Current Open Queue |\n"
    md += "| :--- | :--- | :--- | :--- |\n"
    for login, data in sorted(stats.items(), key=lambda x: x[1]['weekly_closed'], reverse=True):
        md += f"| **{data['name']}** (@{login}) | {data['weekly_assigned']} | **{data['weekly_closed']}** | {len(data['open_queue'])} |\n"

    md += "\n---\n## 👤 Individual Review Queues\n"
    for login, data in sorted(stats.items(), key=lambda x: x[1]['name']):
        md += f"\n### {data['name']} (@{login})\n"
        md += "#### 🟢 Active Queue\n"
        md += "| PR | Issue | Title | Status & Next Step | Updated |\n"
        md += "| :--- | :--- | :--- | :--- | :--- |\n"
        for p in sorted(data['open_queue'], key=lambda x: x['updated'], reverse=True):
            md += f"| [#{p['number']}]({p['url']}) | [#{p['issue_no']}](https://github.com/{TARGET_REPO}/issues/{p['issue_no']}) | {p['title']} | {p['status_label']} | `{p['updated']}` |\n"
        if not data['open_queue']: md += "| - | - | _No active reviews._ | - | - |\n"

        recent_closed = [p for p in data['history'] if parse_date(p['updated']+'T00:00:00Z') >= report_start]
        if recent_closed:
            md += "\n#### 🔴 Recently Closed (Since Monday)\n"
            md += "| PR | Issue | Title | Closed Date |\n"
            md += "| :--- | :--- | :--- | :--- |\n"
            for p in recent_closed:
                md += f"| [#{p['number']}]({p['url']}) | [#{p['issue_no']}](https://github.com/{TARGET_REPO}/issues/{p['issue_no']}) | {p['title']} | `{p['updated']}` |\n"

    md += "\n---\n*Report generated by automated triage script.*"
    with open("TEAM_STATS.md", "w") as f: f.write(md)
    print("Successfully generated TEAM_STATS.md (Detailed Status).")

if __name__ == "__main__":
    main()
