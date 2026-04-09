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
            __typename
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
    human_reviewers = set()
    
    # 1. Collect only HUMAN requested reviewers
    for req in pr.get('reviewRequests', {}).get('nodes', []):
        rr = req.get('requestedReviewer')
        if rr and rr.get('__typename') == 'User':
            login = rr.get('login')
            if login and login != author and login not in BOT_BLACKLIST:
                human_reviewers.add(login)
                
    # 2. Collect from formal reviews (Even if body is empty)
    reviews = pr.get('latestReviews', {}).get('nodes', [])
    for r in reviews:
        login = r.get('author', {}).get('login') if r.get('author') else None
        if login and login != author and login not in BOT_BLACKLIST:
            human_reviewers.add(login)
            # Track latest formal review activity
            latest_reviewer_activity = max(latest_reviewer_activity, r['updatedAt'])
            
    # 3. Track latest activity from ANYONE who isn't the author
    all_comments = pr.get('comments', {}).get('nodes', [])
    for c in all_comments:
        login = c.get('author', {}).get('login') if c.get('author') else None
        if login and login != author and login not in BOT_BLACKLIST:
            latest_reviewer_activity = max(latest_reviewer_activity, c['publishedAt'])
            
    return sorted(list(human_reviewers)), latest_reviewer_activity

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

    review_needed_list = []
    stale_assignments = []
    blocked_prs = []

    for issue in issues:
        assignees = [a['login'] for a in issue['assignees']['nodes']]
        if not assignees: continue
        
        issue_no = issue['number']
        issue_title = issue['title']
        issue_url = issue['url']
        updated_at = datetime.datetime.fromisoformat(issue['updatedAt'].replace('Z', '+00:00'))
        
        timeline_nodes = issue.get('timelineItems', {}).get('nodes', [])
        pr_numbers = [e['source']['number'] for e in timeline_nodes if e.get('source') and 'number' in e['source']]
        
        found_open_pr = False
        valid_pr_found = False
        
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
            if not latest_reviewer_activity or author_activity > latest_reviewer_activity:
                # Check for Blockers
                rollup = pr.get('statusCheckRollup')
                is_conflicting = pr['mergeable'] == 'CONFLICTING'
                is_failing = rollup and rollup.get('state') in ['FAILURE', 'ERROR']
                
                if not is_conflicting and not is_failing:
                    # CONCISE STATUS & ACTION
                    if not latest_reviewer_activity:
                        if reviewers:
                            status_action = "Review Requested. **Waiting for Reviewer.**"
                        else:
                            status_action = "New PR. **Reviewer Needed.**"
                    else:
                        status_action = "Updated. **Reviewer Follow-up.**"
                        
                    review_needed_list.append({
                        "issue_md": f"[#{issue_no} {issue_title}]({issue_url})",
                        "pr_no": pr['number'], "pr_url": pr['url'],
                        "reviewers": reviewers, "updated_at": issue['updatedAt'][:10],
                        "status_action": status_action
                    })
                    valid_pr_found = True
                    break
            
            pr_updated_at = datetime.datetime.fromisoformat(pr['updatedAt'].replace('Z', '+00:00'))
            if (now - pr_updated_at).days > STALE_BLOCKED_PR_DAYS:
                reason = ""
                if pr['mergeable'] == 'CONFLICTING': reason = "Merge Conflict"
                elif pr.get('statusCheckRollup', {}).get('state') == 'FAILURE': reason = "Test Failure"
                if reason:
                    blocked_prs.append({
                        "issue_md": f"[#{issue_no} {issue_title}]({issue_url})",
                        "pr_no": pr['number'], "pr_url": pr['url'],
                        "reason": reason, "author": pr['author']['login'], "days_stale": (now - pr_updated_at).days
                    })

    if not valid_pr_found and not found_open_pr and (now - updated_at).days > STALE_ASSIGNMENT_DAYS:
        stale_assignments.append({
            "issue_md": f"[#{issue_no} {issue_title}]({issue_url})",
            "assignees": assignees, "days_stale": (now - updated_at).days
        })

    # Generate Markdown
    ts = now.strftime("%Y-%m-%d %H:%M")
    md = f"# 🔎 Gemini CLI Triage Dashboard\n\n*Last Synchronized: {ts} (UTC)*\n\n"
    
    md += "## ✅ Needs Review\nPull Requests that are passing tests, have no conflicts, and are waiting for reviewer action.\n\n"
    md += "| Issue | Linked PR | Reviewers | Status & Action |\n| :--- | :--- | :--- | :--- |\n"
    for i in review_needed_list:
        revs = ", ".join([f"@{r}" for r in i['reviewers']]) if i['reviewers'] else "_None_"
        md += f"| {i['issue_md']} | [#{i['pr_no']}]({i['pr_url']}) | {revs} | {i['status_action']} |\n"
    if not review_needed_list: md += "| - | _No issues needing review found._ | - | - |\n"

    md += "\n## 🚩 Stale Assignments (No PR)\nAssigned for >{STALE_ASSIGNMENT_DAYS} days with no open Pull Request.\n\n"
    md += "| Issue | Assignee | Days Stale |\n| :--- | :--- | :--- |\n"
    for i in stale_assignments:
        md += f"| {i['issue_md']} | @{', @'.join(i['assignees'])} | {i['days_stale']} |\n"
    if not stale_assignments: md += "| - | _No stale assignments._ | - |\n"

    md += "\n## 🚧 Blocked & Stale PRs\nPRs with conflicts or failures untouched for >{STALE_BLOCKED_PR_DAYS} days.\n\n"
    md += "| Issue | PR | Reason | Author | Days Stale |\n| :--- | :--- | :--- | :--- | :--- |\n"
    for i in blocked_prs:
        md += f"| {i['issue_md']} | [#{i['pr_no']}]({i['pr_url']}) | {i['reason']} | @{i['author']} | {i['days_stale']} |\n"
    if not blocked_prs: md += "| - | _No stale blocked PRs._ | - | - | - |\n"

    md += "\n---\n*Dashboard maintained by automated triage script.*"
    with open("REVIEWS.md", "w") as f: f.write(md)
    print("Generated dashboard with refined reviewer logic.")

if __name__ == "__main__":
    main()
