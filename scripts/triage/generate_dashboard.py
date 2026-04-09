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
    
    # 1. Collect from requested reviewers
    for req in pr.get('reviewRequests', {}).get('nodes', []):
        rr = req.get('requestedReviewer')
        if rr:
            if rr['__typename'] == 'User':
                login = rr['login']
                if login and login != author and login not in BOT_BLACKLIST:
                    human_reviewers.add(login)
            elif rr['__typename'] == 'Team':
                slug = rr['slug']
                # Strip repo name if present in slug
                simple_slug = slug.split('/')[-1]
                if simple_slug in ONCALLER_TEAMS:
                    requested_special_teams.add(simple_slug)
                
    # 2. Collect from formal reviews
    reviews = pr.get('latestReviews', {}).get('nodes', [])
    for r in reviews:
        login = r.get('author', {}).get('login') if r.get('author') else None
        if login and login != author and login not in BOT_BLACKLIST:
            human_reviewers.add(login)
            latest_reviewer_activity = max(latest_reviewer_activity, r['updatedAt'])
            
    # 3. Track latest activity from ANYONE who isn't the author
    all_comments = pr.get('comments', {}).get('nodes', [])
    for c in all_comments:
        login = c.get('author', {}).get('login') if c.get('author') else None
        if login and login != author and login not in BOT_BLACKLIST:
            latest_reviewer_activity = max(latest_reviewer_activity, c['publishedAt'])
            
    return sorted(list(human_reviewers)), latest_reviewer_activity, sorted(list(requested_special_teams))

def get_latest_activity(pr):
    author = pr.get('author', {}).get('login')
    latest = pr['commits']['nodes'][0]['commit']['committedDate']
    for c in pr.get('comments', {}).get('nodes', []):
        latest = max(latest, c['publishedAt'])
    for r in pr.get('latestReviews', {}).get('nodes', []):
        latest = max(latest, r['updatedAt'])
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

    # Lists
    oncaller_attention = []
    initial_pickup = []
    followup_needed = []
    waiting_for_author = []
    available_pickup = []
    active_development = []
    stale_assignments = []
    blocked_stale_prs = []

    for issue in all_issues:
        issue_no = issue['number']
        issue_title = issue['title']
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
            latest_pr_activity_iso = get_latest_activity(pr)
            latest_pr_activity = datetime.datetime.fromisoformat(latest_pr_activity_iso.replace('Z', '+00:00'))
            
            # Check for Blockers
            rollup = pr.get('statusCheckRollup')
            reason = ""
            if pr['mergeable'] == 'CONFLICTING': reason = "Merge Conflict"
            elif rollup and rollup.get('state') == 'FAILURE': reason = "Test Failure"
            
            if reason:
                if (now - latest_pr_activity).days >= STALE_BLOCKED_PR_DAYS:
                    blocked_stale_prs.append({"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "pr_no": pr['number'], "pr_url": pr['url'], "reason": reason, "author": pr['author']['login'], "days_stale": (now - latest_pr_activity).days})
                else:
                    active_development.append({"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "assignees": assignees if assignees else [pr['author']['login']], "last_update": latest_pr_activity_iso[:10], "status": f"Active PR ({reason})"})
                categorized = True
                break

            # 1. SPECIAL CASE: Needs Oncaller Attention
            if special_teams:
                oncaller_attention.append({
                    "issue_md": f"[#{issue_no} {issue_title}]({issue_url})",
                    "pr_no": pr['number'], "pr_url": pr['url'],
                    "teams": special_teams, "reviewers": reviewers, "last_update": latest_pr_activity_iso[:10]
                })
                categorized = True
                break

            # 2. Normal Review Flow
            author_acted_last = not latest_rev_act or latest_pr_activity_iso > latest_rev_act
            if author_acted_last:
                item = {"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "pr_no": pr['number'], "pr_url": pr['url'], "updated_at": latest_pr_activity_iso[:10]}
                if not reviewers:
                    initial_pickup.append(item)
                else:
                    item["reviewers"] = reviewers
                    item["status"] = "Review Requested" if not latest_rev_act else "Author Updated"
                    followup_needed.append(item)
                categorized = True
                break
            else:
                waiting_for_author.append({"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "pr_no": pr['number'], "pr_url": pr['url'], "reviewers": reviewers, "last_action": latest_rev_act[:10]})
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
                    active_development.append({"issue_md": f"[#{issue_no} {issue_title}]({issue_url})", "assignees": assignees, "last_update": issue['updatedAt'][:10], "status": "Assigned (No PR)"})

    sum_categories = len(oncaller_attention) + len(initial_pickup) + len(followup_needed) + len(waiting_for_author) + len(available_pickup) + len(active_development) + len(stale_assignments) + len(blocked_stale_prs)
    
    ts = now.strftime("%Y-%m-%d %H:%M")
    md = f"# 🔎 Gemini CLI Triage Dashboard\n\n*Last Synchronized: {ts} (UTC)*\n\n"
    md += f"**Total Issues Tracked: {len(all_issues)}** | **Categorized: {sum_categories}**\n\n"
    
    md += f"## 🚨 Needs Oncaller Attention ({len(oncaller_attention)})\n**Action: Specialized approval required.** These PRs are waiting for specific teams (e.g. Prompt Approvers).\n\n"
    md += "| Issue | Linked PR | Required Teams | Human Reviewers |\n| :--- | :--- | :--- | :--- |\n"
    for i in oncaller_attention:
        revs = ", ".join([f"@{r}" for r in i['reviewers']]) if i['reviewers'] else "_None_"
        teams = ", ".join([f"`{t}`" for t in i['teams']])
        md += f"| {i['issue_md']} | [#{i['pr_no']}]({i['pr_url']}) | {teams} | {revs} |\n"
    if not oncaller_attention: md += "| - | _None_ | - | - |\n"

    md += f"\n## 🆕 Awaiting Reviewer Pickup ({len(initial_pickup)})\n**Action: Pick up one of these new PRs.** All tests passing, no conflicts.\n\n"
    md += "| Issue | Linked PR | Last Update |\n| :--- | :--- | :--- |\n"
    for i in initial_pickup: md += f"| {i['issue_md']} | [#{i['pr_no']}]({i['pr_url']}) | `{i['updated_at']}` |\n"
    if not initial_pickup: md += "| - | _None_ | - |\n"

    md += f"\n## ⌛ Awaiting Reviewer Follow-up ({len(followup_needed)})\n**Action: Reviewers, please follow up.** Author has responded to feedback.\n\n"
    md += "| Issue | Linked PR | Reviewers | Status |\n| :--- | :--- | :--- | :--- |\n"
    for i in followup_needed: md += f"| {i['issue_md']} | [#{i['pr_no']}]({i['pr_url']}) | {', '.join(['@'+r for r in i['reviewers']])} | {i['status']} |\n"
    if not followup_needed: md += "| - | _None_ | - | - |\n"

    md += f"\n## ✍️ Awaiting Author Action ({len(waiting_for_author)})\n**Status: Waiting for contributor to address review comments.**\n\n"
    md += "| Issue | Linked PR | Reviewers | Last Feedback |\n| :--- | :--- | :--- | :--- |\n"
    for i in waiting_for_author: md += f"| {i['issue_md']} | [#{i['pr_no']}]({i['pr_url']}) | {', '.join(['@'+r for r in i['reviewers']])} | `{i['last_action']}` |\n"
    if not waiting_for_author: md += "| - | _None_ | - | - |\n"

    md += f"\n## 🌱 Available for Pickup ({len(available_pickup)})\n**Action: Open for new contributors.**\n\n"
    md += "| Issue | Days Idle |\n| :--- | :--- |\n"
    for i in available_pickup: md += f"| {i['issue_md']} | {i['days_idle']} |\n"
    if not available_pickup: md += "| - | _None_ |\n"

    md += f"\n## 🛠️ Active Development ({len(active_development)})\n**Status: Recent activity or active blocked PR.**\n\n"
    md += "| Issue | Assignee | Last Update | Status |\n| :--- | :--- | :--- | :--- |\n"
    for i in active_development: md += f"| {i['issue_md']} | @{', @'.join(i['assignees'])} | `{i['last_update']}` | {i['status']} |\n"
    if not active_development: md += "| - | _None_ | - | - |\n"

    md += f"\n## 🚩 Stale Assignments ({len(stale_assignments)})\n**Action: Consider unassigning.** Assigned for >14 days with no PR yet.\n\n"
    md += "| Issue | Assignee | Days Stale |\n| :--- | :--- | :--- |\n"
    for i in stale_assignments: md += f"| {i['issue_md']} | @{', @'.join(i['assignees'])} | {i['days_stale']} |\n"
    if not stale_assignments: md += "| - | _None_ |\n"

    md += f"\n## 🚧 Blocked & Stale PRs ({len(blocked_stale_prs)})\n**Action: Needs rebase or test fix.**\n\n"
    md += "| Issue | PR | Reason | Author | Days Stale |\n| :--- | :--- | :--- | :--- | :--- |\n"
    for i in blocked_stale_prs: md += f"| {i['issue_md']} | [#{i['pr_no']}]({i['pr_url']}) | {i['reason']} | @{i['author']} | {i['days_stale']} |\n"
    if not blocked_stale_prs: md += "| - | _None_ | - | - | - |\n"

    md += "\n---\n*Dashboard maintained by automated triage script.*"
    with open("REVIEWS.md", "w") as f: f.write(md)
    print(f"Total: {len(all_issues)}, Sum: {sum_categories}. Dashboard updated.")

if __name__ == "__main__":
    main()
