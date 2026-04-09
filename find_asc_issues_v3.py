import subprocess
import json
import sys

search_query = 'repo:google-gemini/gemini-cli is:issue state:open label:area/core,area/extensions,area/site label:"help wanted" sort:updated-asc'

graphql_query = """
query($searchQuery: String!) {
  search(query: $searchQuery, type: ISSUE, first: 100) {
    nodes {
      ... on Issue {
        number
        title
        url
        updatedAt
        assignees(first: 1) {
          totalCount
        }
        labels(first: 20) {
          nodes {
            name
          }
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
                  baseRepository {
                    nameWithOwner
                  }
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
        issue_num = issue.get('number')
        # 1. Issue is assigned
        if issue.get('assignees', {}).get('totalCount', 0) == 0:
            continue
            
        has_valid_pr = False
        timeline_nodes = issue.get('timelineItems', {}).get('nodes', [])
        for event in timeline_nodes:
            source = event.get('source')
            if not source or 'url' not in source or 'state' not in source:
                continue
            
            # 2. PR must target the main repo
            base_repo = source.get('baseRepository', {}).get('nameWithOwner')
            if base_repo != 'google-gemini/gemini-cli':
                continue
            
            # 3. PR is officially linked
            closing_issues = [n.get('number') for n in source.get('closingIssuesReferences', {}).get('nodes', [])]
            if issue_num not in closing_issues:
                continue
                
            # 4. PR is open
            if source.get('state') != 'OPEN':
                continue
                
            # 5. PR is ready for review
            if source.get('isDraft') is True:
                continue
                
            # 6. PR has no merge conflicts
            if source.get('mergeable') == 'CONFLICTING':
                continue
                
            # 7. PR status check
            status_rollup = source.get('statusCheckRollup')
            if status_rollup and status_rollup.get('state') in ['FAILURE', 'ERROR']:
                continue
                
            # 8. Unaddressed comments
            threads = source.get('reviewThreads', {}).get('nodes', [])
            has_unresolved = any(not thread.get('isResolved', False) for thread in threads)
            if has_unresolved:
                continue
                
            has_valid_pr = True
            break
            
        if has_valid_pr:
            valid_issues.append(issue)
        elif issue_num == 12878:
            print(f"DEBUG #12878: has_valid_pr is False. PRs found: {[e.get('source', {}).get('number') for e in timeline_nodes if e.get('source')]}")
            
    print(f"Found {len(valid_issues)} valid issues matching the criteria.\\n")
    for issue in valid_issues:
        print(f"- #{issue['number']}: {issue['title']} ({issue['url']})")

if __name__ == "__main__":
    main()
