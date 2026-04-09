import subprocess
import json
import sys

# The search query from the URL provided, scoped to the gemini-cli repository
search_query = 'repo:google-gemini/gemini-cli is:issue state:open label:area/core,area/extensions,area/site label:"help wanted" sort:updated-desc'

graphql_query = """
query($searchQuery: String!) {
  search(query: $searchQuery, type: ISSUE, first: 100) {
    nodes {
      ... on Issue {
        number
        title
        url
        assignees(first: 1) {
          totalCount
        }
        timelineItems(itemTypes: CROSS_REFERENCED_EVENT, first: 50) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                ... on PullRequest {
                  number
                  url
                  state
                  isDraft
                  mergeable
                  statusCheckRollup {
                    state
                  }
                  closingIssuesReferences(first: 50) {
                    nodes {
                      number
                    }
                  }
                  reviewThreads(first: 50) {
                    nodes {
                      isResolved
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

def run_query():
    cmd = ['gh', 'api', 'graphql', '-F', f'searchQuery={search_query}', '-f', f'query={graphql_query}']
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("Error running gh api:", result.stderr)
        sys.exit(1)
    return json.loads(result.stdout)

def main():
    data = run_query()
    issues = data.get('data', {}).get('search', {}).get('nodes', [])
    
    valid_issues = []
    for issue in issues:
        issue_number = issue.get('number')
        # 1. Issue is assigned
        if issue.get('assignees', {}).get('totalCount', 0) == 0:
            continue
            
        has_valid_pr = False
        timeline_nodes = issue.get('timelineItems', {}).get('nodes', [])
        for event in timeline_nodes:
            source = event.get('source')
            if not source or 'url' not in source or 'state' not in source:
                continue
            
            # 2. PR is officially linked to THIS issue (e.g. "Closes #number")
            closing_issues = [n.get('number') for n in source.get('closingIssuesReferences', {}).get('nodes', [])]
            if issue_number not in closing_issues:
                continue
                
            # 3. PR is open
            if source.get('state') != 'OPEN':
                continue
                
            # 4. PR is ready for review (not a draft)
            if source.get('isDraft') is True:
                continue
                
            # 5. PR has no merge conflicts (we reject CONFLICTING, allowing MERGEABLE or UNKNOWN)
            if source.get('mergeable') == 'CONFLICTING':
                continue
            
            # 6. PR status check must be SUCCESS
            status_rollup = source.get('statusCheckRollup')
            if not status_rollup or status_rollup.get('state') != 'SUCCESS':
                continue
                
            # 7. PR has no unaddressed comments (all review threads must be resolved)
            threads = source.get('reviewThreads', {}).get('nodes', [])
            has_unresolved = any(not thread.get('isResolved', False) for thread in threads)
            if has_unresolved:
                continue
                
            has_valid_pr = True
            break
            
        if has_valid_pr:
            valid_issues.append(issue)
            
    print(f"Found {len(valid_issues)} valid issues matching the criteria.\\n")
    print("Here are up to 5 issues:")
    for issue in valid_issues[:5]:
        print(f"- #{issue['number']}: {issue['title']} ({issue['url']})")

if __name__ == "__main__":
    main()
