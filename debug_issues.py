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
    
    results = []
    for issue in issues:
        issue_number = issue.get('number')
        reasons = []
        
        # 1. Assigned
        if issue.get('assignees', {}).get('totalCount', 0) == 0:
            reasons.append("NOT ASSIGNED")
            
        has_valid_pr = False
        pr_info = []
        timeline_nodes = issue.get('timelineItems', {}).get('nodes', [])
        for event in timeline_nodes:
            source = event.get('source')
            if not source or 'url' not in source or 'state' not in source:
                continue
            
            pr_num = source.get('number')
            pr_reasons = []
            
            # 2. PR is officially linked
            closing_issues = [n.get('number') for n in source.get('closingIssuesReferences', {}).get('nodes', [])]
            if issue_number not in closing_issues:
                pr_reasons.append(f"PR #{pr_num} NOT OFFICIALLY LINKED")
                
            # 3. PR is open
            if source.get('state') != 'OPEN':
                pr_reasons.append(f"PR #{pr_num} NOT OPEN")
                
            # 4. PR is NOT a draft
            if source.get('isDraft') is True:
                pr_reasons.append(f"PR #{pr_num} IS DRAFT")
                
            # 5. PR mergeable
            if source.get('mergeable') == 'CONFLICTING':
                pr_reasons.append(f"PR #{pr_num} HAS CONFLICTS")
            
            # 6. Status check rollup
            status_rollup = source.get('statusCheckRollup')
            if not status_rollup or status_rollup.get('state') != 'SUCCESS':
                state = status_rollup.get('state') if status_rollup else 'NONE'
                pr_reasons.append(f"PR #{pr_num} STATUS: {state}")
                
            # 7. Review threads
            threads = source.get('reviewThreads', {}).get('nodes', [])
            has_unresolved = any(not thread.get('isResolved', False) for thread in threads)
            if has_unresolved:
                pr_reasons.append(f"PR #{pr_num} HAS UNRESOLVED COMMENTS")
            
            if not pr_reasons:
                has_valid_pr = True
                break
            else:
                pr_info.append("; ".join(pr_reasons))
        
        if not has_valid_pr:
            reasons.append("NO VALID PR: " + " | ".join(pr_info) if pr_info else "NO PR LINKED")
            
        if not reasons:
            results.append((issue, "VALID"))
        else:
            results.append((issue, "INVALID: " + ", ".join(reasons)))
            
    for issue, status in results:
        print(f"#{issue['number']}: {status}")

if __name__ == "__main__":
    main()
