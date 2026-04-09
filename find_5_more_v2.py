import subprocess
import json
import sys

# Search for the next 100 issues
search_query = 'repo:google-gemini/gemini-cli is:issue state:open'

graphql_query = """
query($searchQuery: String!) {
  search(query: $searchQuery, type: ISSUE, first: 100, after: "Y3Vyc29yOjEwMA==") {
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
            
            # 2. PR is linked
            closing_issues = [n.get('number') for n in source.get('closingIssuesReferences', {}).get('nodes', [])]
            if issue_number not in closing_issues:
                continue
                
            # 3. PR is open
            if source.get('state') != 'OPEN':
                continue
                
            # 4. PR is ready for review
            if source.get('isDraft') is True:
                continue
                
            # 5. PR has no merge conflicts
            if source.get('mergeable') == 'CONFLICTING':
                continue
                
            # 6. PR status check must NOT be FAILURE or ERROR
            status_rollup = source.get('statusCheckRollup')
            if status_rollup and status_rollup.get('state') in ['FAILURE', 'ERROR']:
                continue
                
            # 7. PR has no unaddressed comments
            threads = source.get('reviewThreads', {}).get('nodes', [])
            has_unresolved = any(not thread.get('isResolved', False) for thread in threads)
            if has_unresolved:
                continue
                
            has_valid_pr = True
            break
            
        if has_valid_pr:
            valid_issues.append(issue)
            
    # Mentioned issues
    mentioned = [22929, 22920, 17235, 18727, 18751, 20675, 22591, 22616, 22351, 21635, 21370, 21036, 22321, 22611, 20500, 25039, 24982, 24838, 24815]
    filtered_new = [i for i in valid_issues if i['number'] not in mentioned]
    
    for issue in filtered_new[:5]:
        print(f"- #{issue['number']}: {issue['title']} ({issue['url']})")

if __name__ == "__main__":
    main()
