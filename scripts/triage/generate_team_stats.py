import subprocess
import json
import datetime
import sys
import re

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
    'dependabot', 'google-gemini-bot', 'google-cla', 'googlebot', 'gemini-cli'
}

# Teams that require specialized approval
ONCALLER_TEAMS = {
    'gemini-cli-prompt-approvers',
    'gemini-cli-askmode-approvers',
    'gemini-cli-docs'
}

SEARCH_QUERY = f'repo:{TARGET_REPO} is:issue label:area/core,area/extensions,area/site label:"help wanted" updated:>=2026-03-10 sort:updated-desc'

# Step 1: Lightweight query to get issues and PR numbers
ISSUES_QUERY = """
query($searchQuery: String!, $cursor: String) {
  search(query: $searchQuery, type: ISSUE, first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on Issue {
        number
        title
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

# Step 2: Query for PR details
PR_DETAILS_QUERY = """
query($repoOwner: String!, $repoName: String!, $prNumber: Int!) {
  repository(owner: $repoOwner, name: $repoName) {
    pullRequest(number: $prNumber) {
      number
      url
      title
      state
      createdAt
      updatedAt
      mergedAt
      author { login }
      mergeable
      statusCheckRollup { state }
      closingIssuesReferences(first: 5) { nodes { number } }
      reviewRequests(first: 10) {
        nodes {
          requestedReviewer {
            __typename
            ... on User { login }
            ... on Team { slug }
          }
        }
      }
      latestReviews(last: 10) {
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
      commits(last: 10) {
        nodes {
          commit {
            committedDate
            author { user { login } }
          }
        }
      }
      timelineItems(last: 5, itemTypes: [REOPENED_EVENT, READY_FOR_REVIEW_EVENT]) {
        nodes { __typename ... on ReopenedEvent { createdAt } ... on ReadyForReviewEvent { createdAt } }
      }
    }
  }
}
"""

def gh_api_graphql(query, variables=None):
    cmd = ['gh', 'api', 'graphql']
    if variables:
        for k, v in variables.items():
            if v is not None:
                cmd.extend(['-F', f'{k}={v}'])
    cmd.extend(['-f', f'query={query}'])
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return None
    return json.loads(result.stdout)

def parse_date(date_str):
    if not date_str: return None
    return datetime.datetime.fromisoformat(date_str.replace('Z', '+00:00'))

def sanitize(text):
    if not text: return ""
    # Replace all whitespace (newlines, tabs, etc) and pipe characters with a single space
    return re.sub(r'[\s|]+', ' ', text).strip()

def get_author_activity(pr):
    author = pr.get('author', {}).get('login')
    latest = pr.get('createdAt', "")
    commits = pr.get('commits', {}).get('nodes', [])
    for c_node in commits:
        auth_data = c_node.get('commit', {}).get('author', {})
        user_data = auth_data.get('user') if auth_data else None
        commit_author = user_data.get('login') if user_data else None
        if commit_author == author:
            latest = max(latest, c_node['commit']['committedDate'])
    for c in pr.get('comments', {}).get('nodes', []):
        if c.get('author', {}).get('login') == author:
            latest = max(latest, c['publishedAt'])
    for event in pr.get('timelineItems', {}).get('nodes', []):
        if 'createdAt' in event:
            latest = max(latest, event['createdAt'])
    return latest

def get_reviewer_activity(pr):
    author = pr.get('author', {}).get('login')
    latest = ""
    for r in pr.get('latestReviews', {}).get('nodes', []):
        login = r.get('author', {}).get('login') if r.get('author') else None
        if login and login != author and login not in BOT_BLACKLIST:
            latest = max(latest, r['updatedAt'])
    for c in pr.get('comments', {}).get('nodes', []):
        login = c.get('author', {}).get('login') if c.get('author') else None
        if login and login != author and login not in BOT_BLACKLIST:
            latest = max(latest, c['publishedAt'])
    commits = pr.get('commits', {}).get('nodes', [])
    for c_node in commits:
        auth_data = c_node.get('commit', {}).get('author', {})
        user_data = auth_data.get('user') if auth_data else None
        commit_author = user_data.get('login') if user_data else None
        if commit_author and commit_author != author and commit_author not in BOT_BLACKLIST:
            latest = max(latest, c_node['commit']['committedDate'])
    return latest

def get_status_label(pr):
    latest_author_act = get_author_activity(pr)
    latest_rev_act = get_reviewer_activity(pr)
    rollup = pr.get('statusCheckRollup')
    if pr['mergeable'] == 'CONFLICTING': return "🔴 Blocked: Merge Conflict"
    if rollup and rollup.get('state') in ['FAILURE', 'ERROR']: return "🔴 Blocked: Test Failure"
    if not latest_rev_act or latest_author_act > latest_rev_act: return "🟢 Awaiting Reviewer"
    return "✍️ Awaiting Author"

def get_status_priority(label):
    if "Awaiting Reviewer" in label: return 0
    if "Awaiting Author" in label: return 1
    if "Blocked" in label: return 2
    return 3

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
                reviewRequests(first: 10) {{ nodes {{ requestedReviewer {{ __typename ... on User {{ login }} ... on Team {{ slug }} }} }} }}
                latestReviews(last: 10) {{ nodes {{ author {{ login }} state updatedAt }} }}
                comments(last: 20) {{ nodes {{ author {{ login }} publishedAt }} }}
                commits(last: 10) {{ nodes {{ commit {{ committedDate author {{ user {{ login }} }} }} }} }}
                timelineItems(last: 5, itemTypes: [REOPENED_EVENT, READY_FOR_REVIEW_EVENT]) {{
                    nodes {{ __typename ... on ReopenedEvent {{ createdAt }} ... on ReadyForReviewEvent {{ createdAt }} }}
                }}
            }}
        """)
    return f"query {{ repository(owner: \"{owner}\", name: \"{repo}\") {{ {' '.join(fragments)} }} }}"

def main():
    print("Fetching issue list...")
    all_issue_nodes = []
    cursor = None
    while True:
        data = gh_api_graphql(ISSUES_QUERY, {"searchQuery": SEARCH_QUERY, "cursor": cursor})
        if not data: break
        search_data = data['data']['search']
        all_issue_nodes.extend(search_data['nodes'])
        if not search_data['pageInfo']['hasNextPage']: break
        cursor = search_data['pageInfo']['endCursor']

    # Map issue info correctly
    issue_to_info = {i['number']: {"title": sanitize(i['title']), "url": i['url']} for i in all_issue_nodes}
    issue_to_prs = {}
    all_pr_numbers = set()
    for issue in all_issue_nodes:
        nums = [e['source']['number'] for e in issue['timelineItems']['nodes'] if e.get('source') and 'number' in e['source']]
        issue_to_prs[issue['number']] = nums
        all_pr_numbers.update(nums)

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
    pickup_list = []
    processed_prs_for_history = set()
    
    for issue_no, pr_nums in issue_to_prs.items():
        for pr_no in pr_nums:
            pr = pr_details.get(pr_no)
            if not pr: continue
            if issue_no not in [n['number'] for n in pr['closingIssuesReferences']['nodes']]: continue
            if pr.get('baseRepository', {}).get('nameWithOwner', TARGET_REPO) != TARGET_REPO: continue
            
            pr_title = sanitize(pr['title'])
            
            if pr.get('state') != 'OPEN':
                if pr_no not in processed_prs_for_history:
                    updated_at = parse_date(pr['updatedAt'])
                    revs = set()
                    for req in pr.get('reviewRequests', {}).get('nodes', []):
                        rr = req.get('requestedReviewer')
                        if rr and rr.get('__typename') == 'User':
                            login = rr.get('login')
                            if login not in BOT_BLACKLIST: revs.add(login)
                    for r in pr.get('latestReviews', {}).get('nodes', []):
                        if r.get('author'):
                            login = r['author']['login']
                            if login not in BOT_BLACKLIST: revs.add(login)
                    
                    for r_login in revs:
                        if r_login in stats and updated_at and updated_at >= report_start:
                            stats[r_login]["weekly_closed"] += 1
                            stats[r_login]["history"].append({
                                "number": pr['number'], "title": pr_title, "url": pr['url'],
                                "state": pr['state'],
                                "issue_no": issue_no, "updated": pr['updatedAt'][:10]
                            })
                    processed_prs_for_history.add(pr_no)
                continue

            # OPEN PRs
            human_reviewers = set()
            requested_special_teams = False
            author = pr['author']['login']
            
            for req in pr.get('reviewRequests', {}).get('nodes', []):
                rr = req.get('requestedReviewer')
                if rr:
                    if rr['__typename'] == 'User':
                        login = rr.get('login')
                        if login and login != author and login not in BOT_BLACKLIST:
                            human_reviewers.add(login)
                    elif rr['__typename'] == 'Team':
                        slug = rr.get('slug', '').split('/')[-1]
                        if slug in ONCALLER_TEAMS: requested_special_teams = True
            
            for rev in pr.get('latestReviews', {}).get('nodes', []):
                if rev.get('author'):
                    login = rev['author']['login']
                    if login != author and login not in BOT_BLACKLIST:
                        human_reviewers.add(login)
            
            latest_author_act = get_author_activity(pr)
            latest_rev_act = get_reviewer_activity(pr)
            status_label = get_status_label(pr)
            
            # Pickup logic
            if not human_reviewers and not requested_special_teams and "Blocked" not in status_label and (not latest_rev_act or latest_author_act > latest_rev_act):
                if pr_no not in [p['number'] for p in pickup_list]:
                    pickup_list.append({
                        "number": pr['number'], "url": pr['url'], "title": pr_title,
                        "issue_no": issue_no, "issue_url": issue_to_info[issue_no]['url'],
                        "issue_title": issue_to_info[issue_no]['title'],
                        "updated": pr['updatedAt'][:10]
                    })

            for reviewer in human_reviewers:
                if reviewer in stats:
                    stats[reviewer]["open_queue"].append({
                        "number": pr['number'], "title": pr_title, "url": pr['url'],
                        "state": pr['state'], "updated": pr['updatedAt'][:10], "issue_no": issue_no,
                        "status_label": status_label,
                        "priority": get_status_priority(status_label)
                    })

    # Generate Markdown
    ts = now.strftime("%Y-%m-%d %H:%M")
    md = f"# 📊 Gemini CLI Weekly Team Review Stats\n\n"
    md += f"*Reporting Period: **Monday {report_start.strftime('%Y-%m-%d')}** to Today*\n"
    md += f"*Last Updated: {ts} (UTC)*\n\n"
    
    md += "## 📈 Weekly Summary\n"
    md += "| Maintainer | Closed/Merged (Week) | Current Open Queue |\n| :--- | :--- | :--- |\n"
    for login, data in sorted(stats.items(), key=lambda x: x[1]['weekly_closed'], reverse=True):
        md += f"| **{data['name']}** (@{login}) | **{data['weekly_closed']}** | {len(data['open_queue'])} |\n"

    md += f"\n### 🆕 Awaiting Reviewer Pickup ({len(pickup_list)})\n"
    md += "**Action: Pick up one of these new PRs.** These have no human reviewers assigned yet, but **all tests are passing and there are no conflicts.**\n\n"
    md += "| Issue | Linked PR | Last Update |\n| :--- | :--- | :--- |\n"
    for i in sorted(pickup_list, key=lambda x: x['updated'], reverse=True):
        md += f"| [#{i['issue_no']} {i['issue_title']}]({i['issue_url']}) | [#{i['number']}]({i['url']}) | `{i['updated']}` |\n"
    if not pickup_list: md += "| - | - | - |\\n"

    md += "\n---\n## 👤 Individual Review Queues\n"
    for login, data in sorted(stats.items(), key=lambda x: x[1]['name']):
        md += f"\n### {data['name']} (@{login})\n"
        md += "#### 🟢 Active Queue\n| PR | Issue | Title | Status & Next Step | Updated |\n| :--- | :--- | :--- | :--- | :--- |\n"
        sorted_queue = sorted(data['open_queue'], key=lambda x: (x['priority'], datetime.datetime.fromisoformat(x['updated']).timestamp() * -1))
        for p in sorted_queue:
            md += f"| [#{p['number']}]({p['url']}) | [#{p['issue_no']}](https://github.com/{TARGET_REPO}/issues/{p['issue_no']}) | {p['title']} | {p['status_label']} | `{p['updated']}` |\n"
        if not data['open_queue']: md += "| - | - | _No active reviews._ | - | - |\n"

        if data['history']:
            md += "\n#### 🔴 Recently Closed (Since Monday)\n| PR | Issue | Title | Status | Closed Date |\n| :--- | :--- | :--- | :--- | :--- |\n"
            for p in sorted(data['history'], key=lambda x: x['updated'], reverse=True):
                md += f"| [#{p['number']}]({p['url']}) | [#{p['issue_no']}](https://github.com/{TARGET_REPO}/issues/{p['issue_no']}) | {p['title']} | `{p['state']}` | `{p['updated']}` |\n"

    md += "\n---\n*Report generated by automated triage script.*"
    with open("TEAM_STATS.md", "w") as f: f.write(md)
    print("Successfully generated TEAM_STATS.md (Sanitized and Formatted).")

if __name__ == "__main__":
    main()
