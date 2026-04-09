import subprocess
import json
import datetime
import os

TARGET_REPO = 'google-gemini/gemini-cli'
SEARCH_QUERY = f'repo:{TARGET_REPO} is:issue state:open label:area/core,area/extensions,area/site label:"help wanted" sort:updated-asc'

# Common bots to exclude from the reviewer list
BOT_BLACKLIST = {
    'gemini-code-assist',
    'github-actions',
    'google-allstar',
    'renovate',
    'dependabot',
    'google-gemini-bot'
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
        assignees(first: 1) { totalCount }
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
      latestReviews(last: 20) {
        nodes {
          author { login }
          state
          updatedAt
        }
      }
      comments(last: 30) {
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
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout)
    except:
        return None

def get_real_reviewers(pr):
    author = pr.get('author', {}).get('login')
    reviewers = set()
    
    # 1. From comments
    for c in pr.get('comments', {}).get('nodes', []):
        login = c.get('author', {}).get('login') if c.get('author') else None
        if login and login != author and login not in BOT_BLACKLIST:
            reviewers.add(login)
            
    # 2. From formal reviews
    for r in pr.get('latestReviews', {}).get('nodes', []):
        login = r.get('author', {}).get('login') if r.get('author') else None
        if login and login != author and login not in BOT_BLACKLIST:
            reviewers.add(login)
            
    return sorted(list(reviewers))

def is_ready_for_review(pr):
    if not pr: return False
    author = pr.get('author', {}).get('login')
    
    # Basics
    if pr.get('state') != 'OPEN' or pr.get('isDraft'): return False
    if pr['mergeable'] == 'CONFLICTING': return False
    
    status_state = pr.get('statusCheckRollup', {}).get('state')
    if status_state in ['FAILURE', 'ERROR']: return False
    
    # Threads
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
    print("Fetching issues...")
    data = gh_api_graphql(ISSUES_QUERY, {"searchQuery": SEARCH_QUERY})
    if not data or 'data' not in data:
        print("Failed to fetch issues.")
        return

    issues = data['data']['search']['nodes']
    ready_list = []
    
    owner, name = TARGET_REPO.split('/')
    
    for issue in issues:
        if issue['assignees']['totalCount'] == 0: continue
        
        issue_no = issue['number']
        timeline_nodes = issue.get('timelineItems', {}).get('nodes', [])
        
        pr_numbers = []
        for event in timeline_nodes:
            if event.get('source') and 'number' in event['source']:
                pr_numbers.append(event['source']['number'])
        
        valid_pr = None
        for pr_no in reversed(pr_numbers):
            pr_data = gh_api_graphql(PR_DETAILS_QUERY, {
                "repoOwner": owner, "repoName": name, "prNumber": pr_no
            })
            if not pr_data or 'data' not in pr_data: continue
            
            pr = pr_data['data']['repository']['pullRequest']
            if issue_no not in [n['number'] for n in pr['closingIssuesReferences']['nodes']]: continue
            if pr.get('baseRepository', {}).get('nameWithOwner') != TARGET_REPO: continue
            
            if is_ready_for_review(pr):
                valid_pr = pr
                break
                
        if valid_pr:
            ready_list.append({
                "issue_no": issue_no,
                "title": issue['title'],
                "issue_url": issue['url'],
                "pr_no": valid_pr['number'],
                "pr_url": valid_pr['url'],
                "reviewers": get_real_reviewers(valid_pr),
                "updated_at": issue['updatedAt'][:10]
            })

    # Generate Markdown
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    md = f"# 🔎 Gemini CLI Review Dashboard\n\n"
    md += f"*Last Synchronized: {now} (UTC)*\n\n"
    md += "### Criteria for Inclusion\n"
    md += "- Issue is **assigned**.\n"
    md += "- PR is **officially linked**, targeting the main repo.\n"
    md += "- PR is **open** and **not a draft**.\n"
    md += "- PR has **no merge conflicts** and **tests are not failing**.\n"
    md += "- PR has **all formal review threads resolved**.\n"
    md += "- **Author Activity:** The latest action (commit or comment) is from the **author**, not a reviewer.\n\n"
    
    md += "| # | Issue Title | Linked PR | Reviewers | Ready Since |\n"
    md += "| :--- | :--- | :--- | :--- | :--- |\n"
    
    for item in ready_list:
        reviewers_str = ", ".join([f"@{r}" for r in item['reviewers']]) if item['reviewers'] else "_None_"
        md += f"| {item['issue_no']} | [{item['title']}]({item['issue_url']}) | [#{item['pr_no']}]({item['pr_url']}) | {reviewers_str} | `{item['updated_at']}` |\n"
        
    if not ready_list:
        md += "| - | _No issues matching criteria found._ | - | - | - |\n"
        
    md += "\n---\n*Dashboard maintained by automated triage script.*"
    
    with open("REVIEWS.md", "w") as f:
        f.write(md)
    print(f"Successfully generated REVIEWS.md with {len(ready_list)} issues.")

if __name__ == "__main__":
    main()
