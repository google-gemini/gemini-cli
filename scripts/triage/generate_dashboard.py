import subprocess
import json
import datetime
import os

# Target repository to query for issues
TARGET_REPO = 'google-gemini/gemini-cli'

# Exact search query from original user request:
# is:issue state:open label:area/core,area/extensions,area/site label:"help wanted" sort:updated-asc
SEARCH_QUERY = f'repo:{TARGET_REPO} is:issue state:open label:area/core,area/extensions,area/site label:"help wanted" sort:updated-asc'

# Thresholds
STALE_ASSIGNMENT_DAYS = 14
STALE_BLOCKED_PR_DAYS = 14

# Common bots to exclude from the reviewer list
BOT_BLACKLIST = {
    'gemini-code-assist',
    'github-actions',
    'google-allstar',
    'renovate',
    'dependabot',
    'google-gemini-bot',
    'google-cla',
    'googlebot'
}

# Optimized query to avoid resource limits
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

def get_real_reviewers(pr):
    author = pr.get('author', {}).get('login')
    reviewers = set()
    for c in pr.get('comments', {}).get('nodes', []):
        login = c.get('author', {}).get('login') if c.get('author') else None
        if login and login != author and login not in BOT_BLACKLIST:
            reviewers.add(login)
    for r in pr.get('latestReviews', {}).get('nodes', []):
        login = r.get('author', {}).get('login') if r.get('author') else None
        if login and login != author and login not in BOT_BLACKLIST:
            reviewers.add(login)
    return sorted(list(reviewers))

def is_ready_for_review(pr):
    if not pr: return False
    author = pr.get('author', {}).get('login')
    if pr.get('state') != 'OPEN' or pr.get('isDraft'): return False
    if pr['mergeable'] == 'CONFLICTING': return False
    
    status_state = pr.get('statusCheckRollup', {}).get('state')
    if status_state in ['FAILURE', 'ERROR']: return False
    
    threads = pr.get('reviewThreads', {}).get('nodes', [])
    if any(not thread['isResolved'] for thread in threads): return False
    
    # Recency Check
    latest_author_activity = pr['commits']['nodes'][0]['commit']['committedDate']
    all_comments = pr.get('comments', {}).get('nodes', [])
    author_comments = [c['publishedAt'] for c in all_comments if c['author'] and c['author']['login'] == author]
    if author_comments:
        latest_author_activity = max(latest_author_activity, max(author_comments))
        
    latest_reviewer_activity = ""
    reviewer_comments = [c['publishedAt'] for c in all_comments if c['author'] and c['author']['login'] != author]
    if reviewer_comments:
        latest_reviewer_activity = max(reviewer_comments)
        
    reviews = pr.get('latestReviews', {}).get('nodes', [])
    reviewer_reviews = [r['updatedAt'] for r in reviews if r['author'] and r['author']['login'] != author]
    if reviewer_reviews:
        latest_reviewer_activity = max(latest_reviewer_activity, max(reviewer_reviews))
        
    if latest_reviewer_activity and latest_reviewer_activity > latest_author_activity:
        return False
    return True

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

    for issue in issues:
        assignees = [a['login'] for a in issue['assignees']['nodes']]
        if not assignees: continue
        
        issue_no = issue['number']
        updated_at = datetime.datetime.fromisoformat(issue['updatedAt'].replace('Z', '+00:00'))
        days_since_update = (now - updated_at).days
        
        timeline_nodes = issue.get('timelineItems', {}).get('nodes', [])
        pr_numbers = [e['source']['number'] for e in timeline_nodes if e.get('source') and 'number' in e['source']]
        
        # Check PRs
        found_open_pr = False
        valid_pr = None
        
        for pr_no in reversed(pr_numbers):
            pr_data = gh_api_graphql(PR_DETAILS_QUERY, {"repoOwner": owner, "repoName": name, "prNumber": pr_no})
            if not pr_data: continue
            pr = pr_data['data']['repository']['pullRequest']
            
            # Verify official link and target
            if issue_no not in [n['number'] for n in pr['closingIssuesReferences']['nodes']]: continue
            if pr.get('baseRepository', {}).get('nameWithOwner') != TARGET_REPO: continue
            if pr.get('state') != 'OPEN': continue
            
            found_open_pr = True
            
            # Category 1: Ready for Review
            if is_ready_for_review(pr):
                valid_pr = pr
                break
            
            # Category 2: Blocked & Stale
            pr_updated_at = datetime.datetime.fromisoformat(pr['updatedAt'].replace('Z', '+00:00'))
            pr_days_stale = (now - pr_updated_at).days
            
            reason = ""
            if pr['mergeable'] == 'CONFLICTING': reason = "Merge Conflict"
            elif pr.get('statusCheckRollup', {}).get('state') == 'FAILURE': reason = "Test Failure"
            
            if reason and pr_days_stale > STALE_BLOCKED_PR_DAYS:
                blocked_prs.append({
                    "issue_no": issue_no, "pr_no": pr['number'], "reason": reason,
                    "author": pr['author']['login'] if pr['author'] else "unknown",
                    "days_stale": pr_days_stale
                })

        if valid_pr:
            ready_list.append({
                "issue_no": issue_no, "title": issue['title'], "issue_url": issue['url'],
                "pr_no": valid_pr['number'], "pr_url": valid_pr['url'],
                "reviewers": get_real_reviewers(valid_pr),
                "updated_at": issue['updatedAt'][:10]
            })
        elif not found_open_pr and days_since_update > STALE_ASSIGNMENT_DAYS:
            # Category 3: Stale Assignment
            stale_assignments.append({
                "issue_no": issue_no, "title": issue['title'], "url": issue['url'],
                "assignees": assignees, "days_stale": days_since_update
            })

    # Generate Markdown
    ts = now.strftime("%Y-%m-%d %H:%M")
    md = f"# 🔎 Gemini CLI Triage Dashboard\n\n"
    md += f"*Last Synchronized: {ts} (UTC)*\n\n"
    
    md += "## ✅ Ready for Review\n"
    md += "Assigned, officially linked, no conflicts, tests passing, and author has responded to all feedback.\n\n"
    md += "| # | Issue Title | Linked PR | Reviewers | Ready Since |\n"
    md += "| :--- | :--- | :--- | :--- | :--- |\n"
    for i in ready_list:
        revs = ", ".join([f"@{r}" for r in i['reviewers']]) if i['reviewers'] else "_None_"
        md += f"| {i['issue_no']} | [{i['title']}]({i['issue_url']}) | [#{i['pr_no']}]({i['pr_url']}) | {revs} | `{i['updated_at']}` |\n"
    if not ready_list: md += "| - | _No issues ready._ | - | - | - |\n"

    md += "\n## 🚩 Stale Assignments (No PR)\n"
    md += f"Assigned for >{STALE_ASSIGNMENT_DAYS} days with no open Pull Request. Consider unassigning.\n\n"
    md += "| Issue | Assignee | Days Stale |\n"
    md += "| :--- | :--- | :--- |\n"
    for i in stale_assignments:
        md += f"| [#{i['issue_no']} {i['title']}]({i['url']}) | @{', @'.join(i['assignees'])} | {i['days_stale']} |\n"
    if not stale_assignments: md += "| - | _No stale assignments._ | - |\n"

    md += "\n## 🚧 Blocked & Stale PRs\n"
    md += f"PRs with conflicts or failures untouched for >{STALE_BLOCKED_PR_DAYS} days.\n\n"
    md += "| Issue | PR | Reason | Author | Days Stale |\n"
    md += "| :--- | :--- | :--- | :--- | :--- |\n"
    for i in blocked_prs:
        md += f"| #{i['issue_no']} | #{i['pr_no']} | {i['reason']} | @{i['author']} | {i['days_stale']} |\n"
    if not blocked_prs: md += "| - | _No stale blocked PRs._ | - | - | - |\n"

    md += "\n---\n*Dashboard maintained by automated triage script.*"
    
    with open("REVIEWS.md", "w") as f:
        f.write(md)
    print(f"Generated dashboard with {len(ready_list)} ready, {len(stale_assignments)} stale assignments, {len(blocked_prs)} blocked PRs.")

if __name__ == "__main__":
    main()
