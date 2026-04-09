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
        timelineItems(itemTypes: CROSS_REFERENCED_EVENT, first: 50) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                ... on PullRequest {
                  number
                  closingIssuesReferences(first: 5) { nodes { number } }
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
    return json.loads(result.stdout)

def main():
    data = run_query()
    issues = data.get('data', {}).get('search', {}).get('nodes', [])
    for issue in issues:
        if issue['number'] == 18895:
            print(f"PRs for #18895: {issue['timelineItems']['nodes']}")

if __name__ == "__main__":
    main()
