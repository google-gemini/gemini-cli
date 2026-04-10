import subprocess
import json
import datetime
import os

# Target repository to query for issues
TARGET_REPO = 'google-gemini/gemini-cli'

# Search query
SEARCH_QUERY = f'repo:{TARGET_REPO} is:issue state:open label:area/core,area/extensions,area/site label:"help wanted" sort:updated-asc'

# Thresholds
STALE_ASSIGNMENT_DAYS = 14
STALE_BLOCKED_PR_DAYS = 14

# Common bots to exclude
BOT_BLACKLIST = {
    'gemini-code-assist', 'github-actions', 'google-allstar', 'renovate',
    'dependabot', 'google-gemini-bot', 'google-cla', 'googlebot'
}

# Teams that require specialized approval
ONCALLER_TEAMS = {
    'gemini-cli-prompt-approvers',
    'gemini-cli-askmode-approvers',
    'gemini-cli-docs'
}

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
        title
        url
        updatedAt
        assignees(first: 5) { 
          nodes { login }
        }
        timelineItems(itemTypes: CROSS_REFERENCED_EVENT, last: 10) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                ... on PullRequest {
                  number
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

PR_DETAILS_QUERY = """
query($repoOwner: String!, $repoName: String!, $prNumber: Int!) {
  repository(owner: $repoOwner, name: $repoName) {
    pullRequest(number: $prNumber) {
      number
      url
      title
      state
      updatedAt
      isDraft
      mergeable
      author { login }
      baseRepository { nameWithOwner }
      statusCheckRollup { state }
      closingIssuesReferences(first: 5) { nodes { number } }
      reviewThreads(first: 20) {
        nodes {
          isResolved
        }
      }
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
      timelineItems(last: 10, itemTypes: [REOPENED_EVENT, READY_FOR_REVIEW_EVENT, CONVERT_TO_DRAFT_EVENT]) {
        nodes {
          __typename
          ... on ReopenedEvent { createdAt }
          ... on ReadyForReviewEvent { createdAt }
          ... on ConvertToDraftEvent { createdAt }
        }
      }
    }
  }
}
"""

def gh_api_graphql(query, variables):
    cmd = ['gh', 'api', 'graphql']
    for k, v in variables.items():
        if v is not None:
            cmd.extend(['-F', f'{k}={v}'])
    cmd.extend(['-f', f'query={query}'])
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return None
    return json.loads(result.stdout)

def get_reviewer_info(pr):
    author = pr.get('author', {}).get('login')
    latest_reviewer_activity = ""
    human_reviewers = set()
    requested_special_teams = set()
    
    for req in pr.get('reviewRequests', {}).get('nodes', []):
        rr = req.get('requestedReviewer')
        if rr:
            if rr['__typename'] == 'User':
                login = rr.get('login')
                if login and login != author and login not in BOT_BLACKLIST:
                    human_reviewers.add(login)
            elif rr['__typename'] == 'Team':
                slug = rr.get('slug')
                if slug:
                    simple_slug = slug.split('/')[-1]
                    if simple_slug in ONCALLER_TEAMS:
                        requested_special_teams.add(simple_slug)
                
    reviews = pr.get('latestReviews', {}).get('nodes', [])
    for r in reviews:
        login = r.get('author', {}).get('login') if r.get('author') else None
        if login and login != author and login not in BOT_BLACKLIST:
            human_reviewers.add(login)
            latest_reviewer_activity = max(latest_reviewer_activity, r['updatedAt'])
            
    all_comments = pr.get('comments', {}).get('nodes', [])
    for c in all_comments:
        login = c.get('author', {}).get('login') if c.get('author') else None
        if login and login != author and login not in BOT_BLACKLIST:
            latest_reviewer_activity = max(latest_reviewer_activity, c['publishedAt'])
            
    commits = pr.get('commits', {}).get('nodes', [])
    for c_node in commits:
        commit_author = c_node.get('commit', {}).get('author', {}).get('user', {}).get('login') if c_node.get('commit', {}).get('author', {}).get('user') else None
        if commit_author and commit_author != author and commit_author not in BOT_BLACKLIST:
            latest_reviewer_activity = max(latest_reviewer_activity, c_node['commit']['committedDate'])
            
    return sorted(list(human_reviewers)), latest_reviewer_activity, sorted(list(requested_special_teams))

def get_author_activity(pr):
    author = pr.get('author', {}).get('login')
    latest = pr.get('createdAt', "")
    commits = pr.get('commits', {}).get('nodes', [])
    for c_node in commits:
        commit_author = c_node.get('commit', {}).get('author', {}).get('user', {}).get('login') if c_node.get('commit', {}).get('author', {}).get('user') else None
        if commit_author == author:
            latest = max(latest, c_node['commit']['committedDate'])
    for c in pr.get('comments', {}).get('nodes', []):
        if c.get('author', {}).get('login') == author:
            latest = max(latest, c['publishedAt'])
    for event in pr.get('timelineItems', {}).get('nodes', []):
        if 'createdAt' in event:
            latest = max(latest, event['createdAt'])
    return latest

def main():
    print("Fetching issues...")
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
    owner, name = TARGET_REPO.split('/')

    oncaller_attention = []
    initial_pickup = []
    followup_needed = []
    waiting_for_author = []
    available_pickup = []
    active_blocked_prs = []
    recently_assigned_no_pr = []
    stale_assignments = []
    blocked_stale_prs = []

    for issue in all_issues:
        issue_no = issue['number']
        issue_title = issue['title'].replace('\n', ' ').replace('\r', '')
        issue_url = issue['url']
        issue_updated_at = datetime.datetime.fromisoformat(issue['updatedAt'].replace('Z', '+00:00'))
        assignees = [a['login'] for a in issue['assignees']['nodes']]
        
        timeline_nodes = issue.get('timelineItems', {}).get('nodes', [])
        pr_numbers = [e['source']['number'] for e in timeline_nodes if e.get('source') and 'number' in e['source']]
        
        found_open_pr = False
        categorized = False
        
        for pr_no in reversed(pr_numbers):
            pr_data = gh_api_graphql(PR_DETAILS_QUERY, {"repoOwner": owner, "repoName": name, "prNumber": pr_no})
            if not pr_data: continue
            pr = pr_data['data']['repository']['pullRequest']
            
            if issue_no not in [n['number'] for n in pr['closingIssuesReferences']['nodes']]: continue
            if pr.get('baseRepository', {}).get('nameWithOwner') != TARGET_REPO: continue
            if pr.get('state') != 'OPEN': continue
            
            found_open_pr = True
            reviewers, latest_rev_act, special_teams = get_reviewer_info(pr)
            author_activity = get_author_activity(pr)
            pr_title = pr['title'].replace('\n', ' ').replace('\r', '')
            
            rollup = pr.get('statusCheckRollup')
            reason = ""
            if pr['mergeable'] == 'CONFLICTING': reason = "Merge Conflict"
            elif rollup and rollup.get('state') == 'FAILURE': reason = "Test Failure"
            
            if reason:
                if (now - datetime.datetime.fromisoformat(author_activity.replace('Z', '+00:00'))).days >= STALE_BLOCKED_PR_DAYS:
                    blocked_stale_prs.append({"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "pr_no": pr['number'], "pr_url": pr['url'], "pr_title": pr_title, "reason": reason, "author": pr['author']['login'], "days_stale": (now - datetime.datetime.fromisoformat(author_activity.replace('Z', '+00:00'))).days})
                else:
                    active_blocked_prs.append({"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "pr_no": pr['number'], "pr_url": pr['url'], "pr_title": pr_title, "reason": reason, "author": pr['author']['login'], "last_update": author_activity[:10]})
                categorized = True
                break

            if special_teams:
                oncaller_attention.append({
                    "issue_md": f"[#{issue_no} {issue_title}]({issue_url})",
                    "pr_no": pr['number'], "pr_url": pr['url'], "pr_title": pr_title,
                    "teams": special_teams, "reviewers": reviewers, "last_update": author_activity[:10],
                    "issue_no": issue_no
                })
                categorized = True
                break

            author_acted_last = not latest_rev_act or author_activity > latest_rev_act
            if author_acted_last:
                item = {"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "pr_no": pr['number'], "pr_url": pr['url'], "pr_title": pr_title, "updated_at": author_activity[:10]}
                if not reviewers:
                    initial_pickup.append(item)
                else:
                    item["reviewers"] = reviewers
                    item["status"] = "Review Requested" if not latest_rev_act else "Author Updated"
                    followup_needed.append(item)
                categorized = True
                break
            else:
                waiting_for_author.append({"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "pr_no": pr['number'], "pr_url": pr['url'], "pr_title": pr_title, "reviewers": reviewers, "last_action": latest_rev_act[:10]})
                categorized = True
                break

        if categorized: continue

        if not found_open_pr:
            days_idle = (now - issue_updated_at).days
            if not assignees:
                available_pickup.append({"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "days_idle": days_idle})
            else:
                if days_idle >= STALE_ASSIGNMENT_DAYS:
                    stale_assignments.append({"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "assignees": assignees, "days_stale": days_idle})
                else:
                    recently_assigned_no_pr.append({"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "assignees": assignees, "last_update": issue['updatedAt'][:10]})

    oncaller_attention.sort(key=lambda x: (", ".join(x['teams']), x['issue_no']))
    sum_categories = len(oncaller_attention) + len(initial_pickup) + len(followup_needed) + len(waiting_for_author) + len(available_pickup) + len(active_blocked_prs) + len(recently_assigned_no_pr) + len(stale_assignments) + len(blocked_stale_prs)
    
    ts = now.strftime("%Y-%m-%d %H:%M")
    md = f"# 🔎 Gemini CLI Triage Dashboard\n\n*Last Synchronized: {ts} (UTC)*\n\n"
    md += f"**Total Issues Tracked: {len(all_issues)}** | **Categorized: {sum_categories}**\n\n"
    
    md += f"## 🚨 Needs Oncaller Attention ({len(oncaller_attention)})\n**Action: Specialized approval required.**\n\n"
    md += "| Issue | Linked PR | Required Teams | Human Reviewers |\n| :--- | :--- | :--- | :--- |\n"
    for i in oncaller_attention:
        revs = ", ".join([f"@{r}" for r in i['reviewers']]) if i['reviewers'] else "_None_"
        teams = ", ".join([f"`{t}`" for t in i['teams']])
        md += f"| {i['issue_md']} | [#{i['pr_no']}]({i['pr_url']}) | {teams} | {revs} |\n"
    if not oncaller_attention: md += "| - | _None_ | - | - |\n"

    md += f"\n## 🚩 Stale Assignments ({len(stale_assignments)})\n**Action: Maintainers, please unassign.**\n\n"
    md += "| Issue | Assignee | Days Stale |\n| :--- | :--- | :--- |\n"
    for i in stale_assignments: md += f"| {i['issue_md']} | @{', @'.join(i['assignees'])} | {i['days_stale']} |\n"
    if not stale_assignments: md += "| - | _None_ |\n"

    md += f"\n## 🚧 Blocked & Stale PRs ({len(blocked_stale_prs)})\n**Action: Auto-cleanup.**\n\n"
    md += "| Issue | PR | Reason | Author | Days Stale |\n| :--- | :--- | :--- | :--- | :--- |\n"
    for i in blocked_stale_prs: md += f"| {i['issue_md']} | [#{i['pr_no']}]({i['pr_url']}) | {i['reason']} | @{i['author']} | {i['days_stale']} |\n"
    if not blocked_stale_prs: md += "| - | _None_ | - | - | - |\n"

    md += f"\n## 🆕 Awaiting Reviewer Pickup ({len(initial_pickup)})\n**Action: Pick up one of these new PRs.**\n\n"
    md += "| Issue | Linked PR | Last Update |\n| :--- | :--- | :--- |\n"
    for i in initial_pickup: md += f"| {i['issue_md']} | [#{i['pr_no']}]({i['pr_url']}) | `{i['updated_at']}` |\n"
    if not initial_pickup: md += "| - | _None_ | - |\n"

    md += f"\n## ⌛ Awaiting Reviewer Follow-up ({len(followup_needed)})\n**Action: Reviewers, please follow up.**\n\n"
    md += "| Issue | Linked PR | Reviewers | Status |\n| :--- | :--- | :--- | :--- |\n"
    for i in followup_needed:
        revs = ", ".join([f"@{r}" for r in i['reviewers']]) if i['reviewers'] else "_None (Team only)_"
        md += f"| {i['issue_md']} | [#{i['pr_no']}]({i['pr_url']}) | {revs} | {i['status']} |\n"
    if not followup_needed: md += "| - | _None_ | - | - |\n"

    md += f"\n## ✍️ Awaiting Author Action ({len(waiting_for_author)})\n**Status: Waiting for contributor.**\n\n"
    md += "| Issue | Linked PR | Reviewers | Last Feedback |\n| :--- | :--- | :--- | :--- |\n"
    for i in waiting_for_author:
        revs = ", ".join([f"@{r}" for r in i['reviewers']]) if i['reviewers'] else "_None (Team only)_"
        md += f"| {i['issue_md']} | [#{i['pr_no']}]({i['pr_url']}) | {revs} | `{i['last_action']}` |\n"
    if not waiting_for_author: md += "| - | _None_ | - | - |\n"

    md += f"\n## 🛠️ Active Development: Recently Assigned ({len(recently_assigned_no_pr)})\n**Status: Assigned < 14 days ago.**\n\n"
    md += "| Issue | Assignee | Last Update |\n| :--- | :--- | :--- |\n"
    for i in recently_assigned_no_pr: md += f"| {i['issue_md']} | @{', @'.join(i['assignees'])} | `{i['last_update']}` |\n"
    if not recently_assigned_no_pr: md += "| - | _None_ | - |\n"

    md += f"\n## 🛠️ Active Development: Blocked PRs ({len(active_blocked_prs)})\n**Status: Active work with blockers.**\n\n"
    md += "| Issue | Linked PR | Author | Reason | Last Update |\n| :--- | :--- | :--- | :--- | :--- |\n"
    for i in active_blocked_prs: md += f"| {i['issue_md']} | [#{i['pr_no']}]({i['pr_url']}) | @{i['author']} | {i['reason']} | `{i['last_update']}` |\n"
    if not active_blocked_prs: md += "| - | _None_ | - | - | - |\n"

    md += f"\n## 🌱 Available for Pickup ({len(available_pickup)})\n**Action: Open for contributors.**\n\n"
    md += "| Issue | Days Idle |\n| :--- | :--- |\n"
    for i in available_pickup: md += f"| {i['issue_md']} | {i['days_idle']} |\n"
    if not available_pickup: md += "| - | _None_ |\n"

    md += "\n---\n*Dashboard maintained by automated triage script.*"
    with open("REVIEWS.md", "w") as f: f.write(md)
    print(f"Total: {len(all_issues)}, Sum: {sum_categories}. Dashboard updated.")

if __name__ == "__main__":
    main()
