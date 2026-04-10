import subprocess
import json
import datetime
import os
import re

# Target repository
TARGET_REPO = 'google-gemini/gemini-cli'

# Maintainers list for TEAM_STATS
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

# Thresholds
STALE_ASSIGNMENT_DAYS = 14
STALE_BLOCKED_PR_DAYS = 14

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

# Broad search to include all open issues and recently closed ones for weekly history
SEARCH_QUERY = f'repo:{TARGET_REPO} is:issue label:area/core,area/extensions,area/site label:"help wanted" updated:>=2026-03-10 sort:updated-desc'

ISSUES_QUERY = """
query($searchQuery: String!, $cursor: String) {
  search(query: $searchQuery, type: ISSUE, first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on Issue {
        number title url updatedAt state
        assignees(first: 10) { nodes { login } }
        timelineItems(itemTypes: CROSS_REFERENCED_EVENT, last: 20) {
          nodes {
            ... on CrossReferencedEvent {
              source { ... on PullRequest { number } }
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
                reviewRequests(first: 10) {{ nodes {{ requestedReviewer {{ __typename ... on User {{ login }} ... on Team {{ slug }} }} }} }}
                latestReviews(last: 10) {{ nodes {{ author {{ login }} state updatedAt }} }}
                comments(last: 20) {{ nodes {{ author {{ login }} publishedAt }} }}
                commits(last: 10) {{ nodes {{ commit {{ committedDate author {{ user {{ login }} }} }} }} }}
                timelineItems(last: 10, itemTypes: [REOPENED_EVENT, READY_FOR_REVIEW_EVENT]) {{
                    nodes {{ __typename ... on ReopenedEvent {{ createdAt }} ... on ReadyForReviewEvent {{ createdAt }} }}
                }}
            }}
        """)
    return f"query {{ repository(owner: \"{owner}\", name: \"{repo}\") {{ {' '.join(fragments)} }} }}"

def gh_api_graphql(query, variables=None):
    cmd = ['gh', 'api', 'graphql']
    if variables:
        for k, v in variables.items():
            if v is not None: cmd.extend(['-F', f'{k}={v}'])
    cmd.extend(['-f', f'query={query}'])
    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout) if result.returncode == 0 else None

def parse_date(date_str):
    if not date_str: return None
    return datetime.datetime.fromisoformat(date_str.replace('Z', '+00:00'))

def sanitize(text):
    if not text: return ""
    return re.sub(r'[\s|]+', ' ', text).strip()

def get_author_activity(pr):
    author = pr.get('author', {}).get('login')
    latest = pr.get('createdAt', "")
    commits = pr.get('commits', {}).get('nodes', [])
    for c_node in commits:
        u = c_node.get('commit', {}).get('author', {}).get('user')
        login = u.get('login') if u else None
        if login == author: latest = max(latest, c_node['commit']['committedDate'])
    for c in pr.get('comments', {}).get('nodes', []):
        if c.get('author', {}).get('login') == author: latest = max(latest, c['publishedAt'])
    for e in pr.get('timelineItems', {}).get('nodes', []):
        if 'createdAt' in e: latest = max(latest, e['createdAt'])
    return latest

def get_reviewer_activity(pr):
    author = pr.get('author', {}).get('login')
    latest = ""
    for r in pr.get('latestReviews', {}).get('nodes', []):
        if r.get('author') and r['author']['login'] != author and r['author']['login'] not in BOT_BLACKLIST:
            latest = max(latest, r['updatedAt'])
    for c in pr.get('comments', {}).get('nodes', []):
        if c.get('author', {}).get('login') != author and c['author']['login'] not in BOT_BLACKLIST:
            latest = max(latest, c['publishedAt'])
    for c_node in pr.get('commits', {}).get('nodes', []):
        u = c_node.get('commit', {}).get('author', {}).get('user')
        login = u.get('login') if u else None
        if login and login != author and login not in BOT_BLACKLIST:
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
    return 2

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

    # Map issue info
    issue_to_info = {i['number']: i for i in all_issue_nodes}
    all_pr_numbers = set()
    issue_to_pr_nums = {}
    for i in all_issue_nodes:
        nums = [e['source']['number'] for e in i['timelineItems']['nodes'] if e.get('source') and 'number' in e['source']]
        all_pr_numbers.update(nums)
        issue_to_pr_nums[i['number']] = nums

    print(f"Fetching details for {len(all_pr_numbers)} PRs...")
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
    report_start = (now - datetime.timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)

    # Lists for REVIEWS.md
    oncaller_attention = []
    stale_assignments = []
    blocked_stale_prs = []
    initial_pickup = []
    followup_needed = []
    waiting_for_author = []
    active_development = []
    available_pickup = []

    # Member stats for TEAM_STATS.md
    member_stats = {login: {"name": name, "weekly_closed": 0, "open_queue": [], "history": []} for login, name in MAINTAINERS.items()}

    for issue_no, pr_nums in issue_to_pr_nums.items():
        issue = issue_to_info[issue_no]
        issue_title = sanitize(issue['title'])
        issue_url = issue['url']
        issue_updated_at = parse_date(issue['updatedAt'])
        assignees = [a['login'] for a in issue['assignees']['nodes']]
        
        found_open_pr = False
        has_active_work = False
        
        for pr_no in reversed(pr_nums):
            pr = pr_details.get(pr_no)
            if not pr or issue_no not in [n['number'] for n in pr['closingIssuesReferences']['nodes']]: continue
            if pr.get('baseRepository', {}).get('nameWithOwner') != TARGET_REPO: continue
            
            pr_title = sanitize(pr['title'])
            latest_author_act_iso = get_author_activity(pr)
            latest_rev_act_iso = get_reviewer_activity(pr)
            status_label = get_status_label(pr)
            
            # Identify human reviewers and special teams
            human_reviewers = set()
            special_teams = set()
            for req in pr.get('reviewRequests', {}).get('nodes', []):
                rr = req.get('requestedReviewer')
                if rr:
                    if rr['__typename'] == 'User':
                        if rr.get('login') != pr['author']['login']: human_reviewers.add(rr['login'])
                    elif rr['__typename'] == 'Team':
                        slug = rr.get('slug', '').split('/')[-1]
                        if slug in ONCALLER_TEAMS: special_teams.add(slug)
            for rev in pr.get('latestReviews', {}).get('nodes', []):
                if rev.get('author'):
                    login = rev['author']['login']
                    if login != pr['author']['login'] and login not in BOT_BLACKLIST: human_reviewers.add(login)

            if pr['state'] != 'OPEN':
                # Track history for TEAM_STATS
                updated_at = parse_date(pr['updatedAt'])
                for r_login in human_reviewers:
                    if r_login in member_stats and updated_at >= report_start:
                        member_stats[r_login]["weekly_closed"] += 1
                        member_stats[r_login]["history"].append({"number": pr['number'], "title": pr_title, "url": pr['url'], "state": pr['state'], "issue_no": issue_no, "updated": pr['updatedAt'][:10]})
                continue

            # --- Categorization for REVIEWS.md ---
            found_open_pr = True
            
            if special_teams:
                oncaller_attention.append({"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "pr_no": pr['number'], "pr_url": pr['url'], "pr_title": pr_title, "teams": sorted(list(special_teams)), "reviewers": sorted(list(human_reviewers)), "last_update": latest_author_act_iso[:10], "issue_no": issue_no})

            is_blocked = "Blocked" in status_label
            author_acted_last = not latest_rev_act_iso or latest_author_act_iso > latest_rev_act_iso
            
            if is_blocked:
                if (now - datetime.datetime.fromisoformat(latest_author_act_iso.replace('Z', '+00:00'))).days >= STALE_BLOCKED_PR_DAYS:
                    blocked_stale_prs.append({"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "pr_no": pr['number'], "pr_url": pr['url'], "pr_title": pr_title, "reason": status_label.split(': ')[1], "author": pr['author']['login'], "days_stale": (now - datetime.datetime.fromisoformat(latest_author_act_iso.replace('Z', '+00:00'))).days})
                else:
                    active_development.append({"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "assignees": assignees if assignees else [pr['author']['login']], "last_update": latest_author_act_iso[:10], "status": f"Active PR ({status_label})"})
                has_active_work = True
            elif author_acted_last:
                item = {"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "pr_no": pr['number'], "pr_url": pr['url'], "pr_title": pr_title, "updated_at": latest_author_act_iso[:10], "reviewers": sorted(list(human_reviewers))}
                if not human_reviewers and not special_teams:
                    initial_pickup.append(item)
                else:
                    item["status"] = "Review Requested" if not latest_rev_act_iso else "Author Updated"
                    followup_needed.append(item)
                has_active_work = True
            else:
                waiting_for_author.append({"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "pr_no": pr['number'], "pr_url": pr['url'], "pr_title": pr_title, "reviewers": sorted(list(human_reviewers)), "last_action": latest_rev_act_iso[:10]})
                has_active_work = True

            # --- Add to Individual Queues for TEAM_STATS ---
            for r_login in human_reviewers:
                if r_login in member_stats:
                    member_stats[r_login]["open_queue"].append({"number": pr['number'], "title": pr_title, "url": pr['url'], "state": pr['state'], "updated": latest_author_act_iso[:10], "issue_no": issue_no, "status_label": status_label, "priority": get_status_priority(status_label)})

        if has_active_work or issue['state'] != 'OPEN': continue
        if not found_open_pr:
            days_idle = (now - issue_updated_at).days
            if not assignees:
                available_pickup.append({"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "days_idle": days_idle})
            else:
                if days_idle >= STALE_ASSIGNMENT_DAYS:
                    stale_assignments.append({"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "assignees": assignees, "days_stale": days_idle})
                else:
                    active_development.append({"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "assignees": assignees, "last_update": issue['updatedAt'][:10], "status": "Assigned (No PR)"})

    # Sorting
    oncaller_attention.sort(key=lambda x: (", ".join(x['teams']), x['issue_no']))
    initial_pickup.sort(key=lambda x: x['updated_at'], reverse=True)

    # --- Write REVIEWS.md ---
    total_open_issues = len([i for i in all_issue_nodes if i['state'] == 'OPEN'])
    md_rev = f"# 🔎 Gemini CLI Triage Dashboard\n\n*Last Synchronized: {now.strftime('%Y-%m-%d %H:%M')} (UTC)*\n\n"
    md_rev += f"**Total Open 'Help Wanted' Issues: {total_open_issues}**\n\n"
    
    md_rev += f"## 🚨 Needs Oncaller Attention ({len(oncaller_attention)})\n**Action: Specialized approval required.**\n\n| Issue | Linked PR | Required Teams | Human Reviewers |\n| :--- | :--- | :--- | :--- |\n"
    for i in oncaller_attention: md_rev += f"| {i['issue_md']} | [#{i['pr_no']}]({i['pr_url']}) | {', '.join([f'`{t}`' for t in i['teams']])} | {', '.join(['@'+r for r in i['reviewers']]) if i['reviewers'] else '_None_'} |\n"
    if not oncaller_attention: md_rev += "| - | - | - | - |\n"

    md_rev += f"\n## 🚩 Stale Assignments ({len(stale_assignments)})\n**Action: Maintainers, please unassign.** Assigned for >14 days with no open PR.\n\n| Issue | Assignee | Days Stale |\n| :--- | :--- | :--- |\n"
    for i in stale_assignments: md_rev += f"| {i['issue_md']} | @{', @'.join(i['assignees'])} | {i['days_stale']} |\n"
    if not stale_assignments: md_rev += "| - | - | - |\n"

    md_rev += f"\n## 🚧 Blocked & Stale PRs ({len(blocked_stale_prs)})\n**Action: Auto-cleanup.** PRs with conflicts or failures untouched for >14 days.\n\n| Issue | PR | Reason | Author | Days Stale |\n| :--- | :--- | :--- | :--- | :--- |\n"
    for i in blocked_stale_prs: md_rev += f"| {i['issue_md']} | [#{i['pr_no']}]({i['pr_url']}) | {i['reason']} | @{i['author']} | {i['days_stale']} |\n"
    if not blocked_stale_prs: md_rev += "| - | - | - | - | - |\n"

    md_rev += f"\n## 🆕 Awaiting Reviewer Pickup ({len(initial_pickup)})\n**Action: Pick up one of these new PRs.** All tests passing, no conflicts.\n\n| Issue | Linked PR | Last Update |\n| :--- | :--- | :--- |\n"
    for i in initial_pickup: md_rev += f"| {i['issue_md']} | [#{i['pr_no']}]({i['pr_url']}) | `{i['updated_at']}` |\n"
    if not initial_pickup: md_rev += "| - | - | - |\n"

    md_rev += f"\n## ⌛ Awaiting Reviewer Follow-up ({len(followup_needed)})\n**Action: Reviewers, please follow up.** Author has responded.\n\n| Issue | Linked PR | Reviewers | Status |\n| :--- | :--- | :--- | :--- |\n"
    for i in followup_needed: md_rev += f"| {i['issue_md']} | [#{i['pr_no']}]({i['pr_url']}) | {', '.join(['@'+r for r in i['reviewers']])} | {i['status']} |\n"
    if not followup_needed: md_rev += "| - | - | - | - |\n"

    md_rev += f"\n## ✍️ Awaiting Author Action ({len(waiting_for_author)})\n**Status: Waiting for contributor to address feedback.**\n\n| Issue | Linked PR | Reviewers | Last Feedback |\n| :--- | :--- | :--- | :--- |\n"
    for i in waiting_for_author: md_rev += f"| {i['issue_md']} | [#{i['pr_no']}]({i['pr_url']}) | {', '.join(['@'+r for r in i['reviewers']]) if i['reviewers'] else '_None (Team only)_'} | `{i['last_action'][:10]}` |\n"
    if not waiting_for_author: md_rev += "| - | - | - | - |\n"

    md_rev += "\n---\n*Dashboard maintained by automated triage script.*"
    with open("REVIEWS.md", "w") as f: f.write(md_rev)

    # --- Write TEAM_STATS.md ---
    md_stats = f"# 📊 Gemini CLI Weekly Team Review Stats\n\n*Reporting Period: **Monday {report_start.strftime('%Y-%m-%d')}** to Today*\n*Last Updated: {now.strftime('%Y-%m-%d %H:%M')} (UTC)*\n\n"
    md_stats += "## 📈 Weekly Summary\n| Maintainer | Closed/Merged (Week) | Current Open Queue |\n| :--- | :--- | :--- |\n"
    for login, data in sorted(member_stats.items(), key=lambda x: x[1]['weekly_closed'], reverse=True):
        md_stats += f"| **{data['name']}** (@{login}) | **{data['weekly_closed']}** | {len(data['open_queue'])} |\n"

    md_stats += f"\n### 🆕 Awaiting Reviewer Pickup ({len(initial_pickup)})\n**Action: Pick up one of these new PRs.** All tests passing, no conflicts.\n\n| Issue | Linked PR | Last Update |\n| :--- | :--- | :--- |\n"
    for i in initial_pickup: md_stats += f"| {i['issue_md']} | [#{i['pr_no']}]({i['pr_url']}) | `{i['updated_at']}` |\n"
    if not initial_pickup: md_stats += "| - | - | - |\n"

    md_stats += "\n---\n## 👤 Individual Review Queues\n"
    for login, data in sorted(member_stats.items(), key=lambda x: x[1]['name']):
        md_stats += f"\n### {data['name']} (@{login})\n#### 🟢 Active Queue\n| PR | Issue | Title | Status & Next Step | Updated |\n| :--- | :--- | :--- | :--- | :--- |\n"
        for p in sorted(data['open_queue'], key=lambda x: (x['priority'], datetime.datetime.fromisoformat(x['updated']).timestamp() * -1)):
            md_stats += f"| [#{p['number']}]({p['url']}) | [#{p['issue_no']}](https://github.com/{TARGET_REPO}/issues/{p['issue_no']}) | {p['title']} | {p['status_label']} | `{p['updated']}` |\n"
        if not data['open_queue']: md_stats += "| - | - | _No active reviews._ | - | - |\n"
        if data['history']:
            md_stats += "\n#### 🔴 Recently Closed (Since Monday)\n| PR | Issue | Title | Status | Closed Date |\n| :--- | :--- | :--- | :--- | :--- |\n"
            for p in sorted(data['history'], key=lambda x: x['updated'], reverse=True):
                md_stats += f"| [#{p['number']}]({p['url']}) | [#{p['issue_no']}](https://github.com/{TARGET_REPO}/issues/{p['issue_no']}) | {p['title']} | `{p['state']}` | `{p['updated']}` |\n"

    md_stats += "\n---\n*Report generated by automated triage script.*"
    with open("TEAM_STATS.md", "w") as f: f.write(md_stats)
    print("Done. Generated REVIEWS.md and TEAM_STATS.md with perfect parity.")

if __name__ == "__main__":
    main()
