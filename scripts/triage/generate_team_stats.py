import subprocess
import json
import datetime
import sys

TARGET_REPO = 'google-gemini/gemini-cli'
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

BOT_BLACKLIST = {
    'gemini-code-assist', 'github-actions', 'google-allstar', 'renovate',
    'dependabot', 'google-gemini-bot', 'google-cla', 'googlebot'
}

SEARCH_QUERY = f'repo:{TARGET_REPO} is:issue label:area/core,area/extensions,area/site label:"help wanted" updated:>=2026-03-10 sort:updated-desc'

ISSUES_QUERY = """
query($searchQuery: String!, $cursor: String) {
  search(query: $searchQuery, type: ISSUE, first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on Issue {
        number
        url
        timelineItems(itemTypes: CROSS_REFERENCED_EVENT, last: 20) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                ... on PullRequest { number }
              }
            }
          }
        }
      }
    }
  }
}
"""

def get_pr_batch_query(pr_numbers):
    owner, repo = TARGET_REPO.split('/')
    fragments = []
    for i, num in enumerate(pr_numbers):
        fragments.append(f"""
            pr{i}: pullRequest(number: {num}) {{
                number url title state createdAt updatedAt mergedAt
                author {{ login }}
                mergeable
                statusCheckRollup {{ state }}
                closingIssuesReferences(first: 5) {{ nodes {{ number }} }}
                reviewRequests(first: 10) {{ nodes {{ requestedReviewer {{ __typename ... on User {{ login }} }} }} }}
                latestReviews(last: 10) {{ nodes {{ author {{ login }} state updatedAt }} }}
                comments(last: 20) {{ nodes {{ author {{ login }} publishedAt }} }}
                commits(last: 1) {{ nodes {{ commit {{ committedDate }} }} }}
                timelineItems(last: 5, itemTypes: [REOPENED_EVENT, READY_FOR_REVIEW_EVENT]) {{
                    nodes {{ __typename ... on ReopenedEvent {{ createdAt }} ... on ReadyForReviewEvent {{ createdAt }} }}
                }}
            }}
        """)
    return f"query {{ repository(owner: \"{owner}\", name: \"{repo}\") {{ {' '.join(fragments)} }} }}"

def gh_api_graphql(query, variables=None):
    cmd = ['gh', 'api', 'graphql']
    if variables:
        for k, v in variables.items():
            if v: cmd.extend(['-F', f'{k}={v}'])
    cmd.extend(['-f', f'query={query}'])
    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout) if result.returncode == 0 else None

def parse_date(date_str):
    if not date_str: return None
    return datetime.datetime.fromisoformat(date_str.replace('Z', '+00:00'))

def get_latest_activity(pr):
    latest = pr.get('createdAt')
    if pr.get('commits') and pr['commits'].get('nodes'):
        latest = pr['commits']['nodes'][0]['commit']['committedDate']
    for c in pr.get('comments', {}).get('nodes', []):
        latest = max(latest, c['publishedAt'])
    for r in pr.get('latestReviews', {}).get('nodes', []):
        latest = max(latest, r['updatedAt'])
    for event in pr.get('timelineItems', {}).get('nodes', []):
        if 'createdAt' in event: latest = max(latest, event['createdAt'])
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
    rollup = pr.get('statusCheckRollup')
    if pr['mergeable'] == 'CONFLICTING': return "🔴 Blocked: Merge Conflict"
    if rollup and rollup.get('state') in ['FAILURE', 'ERROR']: return "🔴 Blocked: Test Failure"
    if not latest_rev_act or latest_pr_act > latest_rev_act: return "🟢 Awaiting Reviewer"
    return "✍️ Awaiting Author"

def main():
    print("Fetching issue list...")
    all_issue_data = []
    cursor = None
    while True:
        data = gh_api_graphql(ISSUES_QUERY, {"searchQuery": SEARCH_QUERY, "cursor": cursor})
        if not data: break
        search_data = data['data']['search']
        all_issue_data.extend(search_data['nodes'])
        if not search_data['pageInfo']['hasNextPage']: break
        cursor = search_data['pageInfo']['endCursor']

    # Collect unique PR numbers
    issue_to_prs = {}
    all_pr_numbers = set()
    for issue in all_issue_data:
        nums = [e['source']['number'] for e in issue['timelineItems']['nodes'] if e.get('source') and 'number' in e['source']]
        issue_to_prs[issue['number']] = nums
        all_pr_numbers.update(nums)

    # Fetch PR details in batches
    print(f"Fetching details for {len(all_pr_numbers)} PRs in batches...")
    pr_details = {}
    pr_list = sorted(list(all_pr_numbers))
    for i in range(0, len(pr_list), 20):
        batch = pr_list[i:i+20]
        res = gh_api_graphql(get_pr_batch_query(batch))
        if res and 'data' in res:
            repo_data = res['data']['repository']
            for j in range(len(batch)):
                pr_obj = repo_data.get(f'pr{j}')
                if pr_obj: pr_details[pr_obj['number']] = pr_obj

    now = datetime.datetime.now(datetime.timezone.utc)
    days_since_monday = now.weekday()
    report_start = (now - datetime.timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)

    stats = {login: {"name": name, "weekly_closed": 0, "open_queue": [], "history": []} for login, name in MAINTAINERS.items()}
    
    for issue_no, pr_nums in issue_to_prs.items():
        for pr_no in pr_nums:
            pr = pr_details.get(pr_no)
            if not pr: continue
            if issue_no not in [n['number'] for n in pr['closingIssuesReferences']['nodes']]: continue
            
            reviewers = set()
            for req in pr.get('reviewRequests', {}).get('nodes', []):
                rr = req.get('requestedReviewer')
                if rr and rr.get('__typename') == 'User': reviewers.add(rr['login'])
            for rev in pr.get('latestReviews', {}).get('nodes', []):
                if rev.get('author'): reviewers.add(rev['author']['login'])
            
            for reviewer in reviewers:
                if reviewer in stats:
                    updated_at = parse_date(pr['updatedAt'])
                    pr_info = {
                        "number": pr['number'], "title": pr['title'], "url": pr['url'],
                        "state": pr['state'], "updated": pr['updatedAt'][:10], "issue_no": issue_no,
                        "status_label": get_status_label(pr)
                    }
                    if pr['state'] != 'OPEN':
                        if updated_at and updated_at >= report_start:
                            stats[reviewer]["weekly_closed"] += 1
                        stats[reviewer]["history"].append(pr_info)
                    else:
                        stats[reviewer]["open_queue"].append(pr_info)

    # Generate Markdown
    ts = now.strftime("%Y-%m-%d %H:%M")
    md = f"# 📊 Gemini CLI Weekly Team Review Stats\n\n"
    md += f"*Reporting Period: **Monday {report_start.strftime('%Y-%m-%d')}** to Today*\n"
    md += f"*Last Updated: {ts} (UTC)*\n\n"
    md += "## 📈 Weekly Summary\n"
    md += "| Maintainer | Closed/Merged (Week) | Current Open Queue |\n| :--- | :--- | :--- |\n"
    # Sort summary by weekly closed count descending
    for login, data in sorted(stats.items(), key=lambda x: x[1]['weekly_closed'], reverse=True):
        md += f"| **{data['name']}** (@{login}) | **{data['weekly_closed']}** | {len(data['open_queue'])} |\n"

    md += "\n---\n## 👤 Individual Review Queues\n"
    for login, data in sorted(stats.items(), key=lambda x: x[1]['name']):
        md += f"\n### {data['name']} (@{login})\n"
        md += "#### 🟢 Active Queue\n| PR | Issue | Title | Status & Next Step | Updated |\n| :--- | :--- | :--- | :--- | :--- |\n"
        for p in sorted(data['open_queue'], key=lambda x: x['updated'], reverse=True):
            md += f"| [#{p['number']}]({p['url']}) | [#{p['issue_no']}](https://github.com/{TARGET_REPO}/issues/{p['issue_no']}) | {p['title']} | {p['status_label']} | `{p['updated']}` |\n"
        if not data['open_queue']: md += "| - | - | _No active reviews._ | - | - |\n"
        
        recent_closed = [p for p in data['history'] if parse_date(p['updated']+'T00:00:00Z') >= report_start]
        if recent_closed:
            md += "\n#### 🔴 Recently Closed (Since Monday)\n| PR | Issue | Title | Closed Date |\n| :--- | :--- | :--- | :--- |\n"
            for p in recent_closed:
                md += f"| [#{p['number']}]({p['url']}) | [#{p['issue_no']}](https://github.com/{TARGET_REPO}/issues/{p['issue_no']}) | {p['title']} | `{p['updated']}` |\n"

    md += "\n---\n*Report generated by automated triage script.*"
    with open("TEAM_STATS.md", "w") as f: f.write(md)
    print("Successfully generated TEAM_STATS.md (Simplified Summary).")

if __name__ == "__main__":
    main()
