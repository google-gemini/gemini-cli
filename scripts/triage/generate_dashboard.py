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

ISSUES_QUERY = """
query($searchQuery: String!) {
  search(query: $searchQuery, type: ISSUE, first: 50) {
    nodes {
      ... on Issue {
        number
        title
        url
        updatedAt
        assignees(first: 5) { 
          totalCount 
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
            ... on User { login }
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
        cmd.extend(['-F', f'{k}={v}'])
    cmd.extend(['-f', f'query={query}'])
    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout) if result.returncode == 0 else None

def get_reviewer_info(pr):
    author = pr.get('author', {}).get('login')
    latest_reviewer_activity = ""
    official_reviewers = set()
    
    # 1. Collect official reviewers from requested reviewers
    for req in pr.get('reviewRequests', {}).get('nodes', []):
        rr = req.get('requestedReviewer')
        if rr and 'login' in rr:
            login = rr['login']
            if login and login != author and login not in BOT_BLACKLIST:
                official_reviewers.add(login)
                
    # 2. Collect official reviewers from formal reviews
    reviews = pr.get('latestReviews', {}).get('nodes', [])
    for r in reviews:
        login = r.get('author', {}).get('login') if r.get('author') else None
        if login and login != author and login not in BOT_BLACKLIST:
            official_reviewers.add(login)
            # Track latest formal review activity
            latest_reviewer_activity = max(latest_reviewer_activity, r['updatedAt'])
            
    # 3. Track latest activity from ANYONE who isn't the author (including comments)
    all_comments = pr.get('comments', {}).get('nodes', [])
    for c in all_comments:
        login = c.get('author', {}).get('login') if c.get('author') else None
        if login and login != author and login not in BOT_BLACKLIST:
            latest_reviewer_activity = max(latest_reviewer_activity, c['publishedAt'])
            
    return sorted(list(official_reviewers)), latest_reviewer_activity

def get_author_activity(pr):
    author = pr.get('author', {}).get('login')
    # Start with latest commit
    latest = pr['commits']['nodes'][0]['commit']['committedDate']
    
    # Check for latest comment from author
    for c in pr.get('comments', {}).get('nodes', []):
        if c.get('author', {}).get('login') == author:
            latest = max(latest, c['publishedAt'])
            
    return latest

def main():
    print("Fetching data...")
    data = gh_api_graphql(ISSUES_QUERY, {"searchQuery": SEARCH_QUERY})
    if not data: return

    issues = data['data']['search']['nodes']
    now = datetime.datetime.now(datetime.timezone.utc)
    owner, name = TARGET_REPO.split('/')

    ready_list = []
    stale_assignments = []
    blocked_prs = []
    waiting_reviewer_list = []

    for issue in issues:
        assignees = [a['login'] for a in issue['assignees']['nodes']]
        if not assignees: continue
        
        issue_no = issue['number']
        updated_at = datetime.datetime.fromisoformat(issue['updatedAt'].replace('Z', '+00:00'))
        
        timeline_nodes = issue.get('timelineItems', {}).get('nodes', [])
        pr_numbers = [e['source']['number'] for e in timeline_nodes if e.get('source') and 'number' in e['source']]
        
        found_open_pr = False
        valid_pr = None
        
        for pr_no in reversed(pr_numbers):
            pr_data = gh_api_graphql(PR_DETAILS_QUERY, {"repoOwner": owner, "repoName": name, "prNumber": pr_no})
            if not pr_data: continue
            pr = pr_data['data']['repository']['pullRequest']
            
            if issue_no not in [n['number'] for n in pr['closingIssuesReferences']['nodes']]: continue
            if pr.get('baseRepository', {}).get('nameWithOwner') != TARGET_REPO: continue
            if pr.get('state') != 'OPEN': continue
            
            found_open_pr = True
            reviewers, latest_reviewer_activity = get_reviewer_info(pr)
            author_activity = get_author_activity(pr)
            
            # Categories
            # 1. Ready for Review (Author updated AFTER any reviewer/other activity)
            is_ready = (not latest_reviewer_activity or author_activity > latest_reviewer_activity)
            if is_ready:
                threads = pr.get('reviewThreads', {}).get('nodes', [])
                all_resolved = all(thread['isResolved'] for thread in threads)
                not_conflicting = pr['mergeable'] != 'CONFLICTING'
                status_ok = pr.get('statusCheckRollup', {}).get('state') not in ['FAILURE', 'ERROR']
                if all_resolved and not_conflicting and status_ok:
                    valid_pr = pr
                    ready_list.append({
                        "issue_no": issue_no, "title": issue['title'], "issue_url": issue['url'],
                        "pr_no": pr['number'], "pr_url": pr['url'],
                        "reviewers": reviewers, "updated_at": issue['updatedAt'][:10]
                    })
                    break
            
            # 2. Waiting for Reviewer (Reviewer has acted before, author has updated since, but no follow up)
            # Only track this if there are actually official reviewers
            if reviewers and latest_reviewer_activity and author_activity > latest_reviewer_activity:
                waiting_reviewer_list.append({
                    "issue_no": issue_no, "issue_url": issue['url'], "pr_no": pr['number'], "pr_url": pr['url'],
                    "author": pr['author']['login'], "reviewers": reviewers,
                    "author_updated": author_activity[:10]
                })

            pr_updated_at = datetime.datetime.fromisoformat(pr['updatedAt'].replace('Z', '+00:00'))
            if (now - pr_updated_at).days > STALE_BLOCKED_PR_DAYS:
                reason = ""
                if pr['mergeable'] == 'CONFLICTING': reason = "Merge Conflict"
                elif pr.get('statusCheckRollup', {}).get('state') == 'FAILURE': reason = "Test Failure"
                if reason:
                    blocked_prs.append({
                        "issue_no": issue_no, "issue_url": issue['url'], "pr_no": pr['number'], "pr_url": pr['url'],
                        "reason": reason, "author": pr['author']['login'], "days_stale": (now - pr_updated_at).days
                    })

        if not valid_pr and not found_open_pr and (now - updated_at).days > STALE_ASSIGNMENT_DAYS:
            stale_assignments.append({
                "issue_no": issue_no, "title": issue['title'], "url": issue['url'],
                "assignees": assignees, "days_stale": (now - updated_at).days
            })

    # Generate Markdown
    ts = now.strftime("%Y-%m-%d %H:%M")
    md = f"# 🔎 Gemini CLI Triage Dashboard\n\n*Last Synchronized: {ts} (UTC)*\n\n"
    
    md += "## ✅ Ready for Review\nAssigned, officially linked, no conflicts, tests passing, and author has responded to all feedback.\n\n"
    md += "| # | Issue Title | Linked PR | Reviewers | Ready Since |\n| :--- | :--- | :--- | :--- | :--- |\n"
    for i in ready_list:
        revs = ", ".join([f"@{r}" for r in i['reviewers']]) if i['reviewers'] else "_None_"
        md += f"| [#{i['issue_no']}]({i['issue_url']}) | [{i['title']}]({i['issue_url']}) | [#{i['pr_no']}]({i['pr_url']}) | {revs} | `{i['updated_at']}` |\n"
    if not ready_list: md += "| - | _No issues ready._ | - | - | - |\n"

    md += "\n## ⌛ Waiting for Reviewer Follow-up\nReviewer provided feedback, the author updated the PR, but the reviewer has not responded yet.\n\n"
    md += "| Issue | PR | Author | Reviewers | Author Updated |\n| :--- | :--- | :--- | :--- | :--- |\n"
    for i in waiting_reviewer_list:
        revs = ", ".join([f"@{r}" for r in i['reviewers']])
        md += f"| [#{i['issue_no']}]({i['issue_url']}) | [#{i['pr_no']}]({i['pr_url']}) | @{i['author']} | {revs} | `{i['author_updated']}` |\n"
    if not waiting_reviewer_list: md += "| - | _No pending follow-ups._ | - | - | - |\n"

    md += "\n## 🚩 Stale Assignments (No PR)\nAssigned for >{STALE_ASSIGNMENT_DAYS} days with no open Pull Request. Consider unassigning.\n\n"
    md += "| Issue | Assignee | Days Stale |\n| :--- | :--- | :--- |\n"
    for i in stale_assignments:
        md += f"| [#{i['issue_no']} {i['title']}]({i['url']}) | @{', @'.join(i['assignees'])} | {i['days_stale']} |\n"
    if not stale_assignments: md += "| - | _No stale assignments._ | - |\n"

    md += "\n## 🚧 Blocked & Stale PRs\nPRs with conflicts or failures untouched for >{STALE_BLOCKED_PR_DAYS} days.\n\n"
    md += "| Issue | PR | Reason | Author | Days Stale |\n| :--- | :--- | :--- | :--- | :--- |\n"
    for i in blocked_prs:
        md += f"| [#{i['issue_no']}]({i['issue_url']}) | [#{i['pr_no']}]({i['pr_url']}) | {i['reason']} | @{i['author']} | {i['days_stale']} |\n"
    if not blocked_prs: md += "| - | _No stale blocked PRs._ | - | - | - |\n"

    md += "\n---\n*Dashboard maintained by automated triage script.*"
    with open("REVIEWS.md", "w") as f: f.write(md)
    print(f"Generated dashboard: {len(ready_list)} ready, {len(waiting_reviewer_list)} waiting reviewers.")

if __name__ == "__main__":
    main()
