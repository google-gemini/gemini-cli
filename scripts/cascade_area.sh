#!/bin/bash

# ==========================================
# CONFIGURATION
# ==========================================
# Usage: ./cascade_area.sh <OWNER> <PROJECT_NUMBER> <ROOT_ISSUE_NUMBER> [FIELD_NAME]
# Example: ./cascade_area.sh google-gemini 33 14382

OWNER=$1
PROJECT_NUMBER=$2
ROOT_ISSUE_NUMBER=$3
FIELD_NAME=${4:-"Area"} 

if [ -z "$ROOT_ISSUE_NUMBER" ]; then
  echo "Usage: $0 <owner> <project_number> <root_issue_number> [field_name]"
  exit 1
fi

# Repositories to search in
REPOS=("gemini-cli" "maintainers-gemini-cli")

echo "--- 🚀 Initializing Cascade for Issue #$ROOT_ISSUE_NUMBER (Field: $FIELD_NAME) ---"

# 1. GET PROJECT NODE ID AND FIELD CONFIGURATION
echo "🔍 Fetching Project Schema..."

# Fetching all field types (not just SingleSelect) to find the built-in "Type" field
PROJECT_DATA=$(gh api graphql -f owner="$OWNER" -F number="$PROJECT_NUMBER" -f query='
  query($owner: String!, $number: Int!) {
    organization(login: $owner) {
      projectV2(number: $number) {
        id
        fields(first: 50) {
          nodes {
            __typename
            ... on ProjectV2Field { id name }
            ... on ProjectV2SingleSelectField {
              id name
              options { id name }
            }
          }
        }
      }
    }
  }
')

# If null, try User (in case it is a personal project)
if [ "$(echo "$PROJECT_DATA" | jq -r '.data.organization.projectV2 // empty')" == "" ]; then
  echo "   ...Project not found in Org, trying User..."
  PROJECT_DATA=$(gh api graphql -f owner="$OWNER" -F number="$PROJECT_NUMBER" -f query='
    query($owner: String!, $number: Int!) {
      user(login: $owner) {
        projectV2(number: $number) {
          id
          fields(first: 50) {
            nodes {
              __typename
              ... on ProjectV2Field { id name }
              ... on ProjectV2SingleSelectField {
                id name
                options { id name }
              }
            }
          }
        }
      }
    }
  ')
fi

echo "📋 Available Fields and Options:"
echo "$PROJECT_DATA" | jq -r '.. | .projectV2? // empty | .fields.nodes[]? | select(.name? != null) | "\(.name) (\(.__typename)): \([.options[]?.name] | join(", "))"' | sed 's/^/  - /'

PROJECT_ID=$(echo "$PROJECT_DATA" | jq -r '.. | .projectV2? // empty | .id' | head -n 1)
# Use select(.name?) and tostring to safely handle nulls and trim whitespace
FIELD_DATA=$(echo "$PROJECT_DATA" | jq -r --arg fname "$FIELD_NAME" '.. | .projectV2? // empty | .fields.nodes[]? | select(.name? and (.name | tostring | sub("^\\s+"; "") | sub("\\s+$"; "")) == ($fname | sub("^\\s+"; "") | sub("\\s+$"; "")))')
FIELD_ID=$(echo "$FIELD_DATA" | jq -r '.id // empty')

# Also fetch Status field info for "Ready"
STATUS_DATA=$(echo "$PROJECT_DATA" | jq -r '.. | .projectV2? // empty | .fields.nodes[]? | select(.name? == "Status")')
STATUS_FIELD_ID=$(echo "$STATUS_DATA" | jq -r '.id // empty')
READY_OPTION_ID=$(echo "$STATUS_DATA" | jq -r '.options[]? | select(.name == "Ready") | .id // empty')

# Fetch Type field info for "Task"
TYPE_DATA=$(echo "$PROJECT_DATA" | jq -r '.. | .projectV2? // empty | .fields.nodes[]? | select(.name? == "Type")')
TYPE_FIELD_ID=$(echo "$TYPE_DATA" | jq -r '.id // empty')
TASK_OPTION_ID=$(echo "$TYPE_DATA" | jq -r '.options[]? | select(.name == "Task") | .id // empty')

if [ -z "$TYPE_FIELD_ID" ]; then
  echo "DEBUG: 'Type' field data found: $TYPE_DATA"
fi

if [ -z "$FIELD_ID" ] || [ "$FIELD_ID" == "null" ] || [ "$FIELD_ID" == "" ]; then
  echo "❌ Error: Field '$FIELD_NAME' not found in Project #$PROJECT_NUMBER."
  echo "Available fields (trimmed):"
  echo "$PROJECT_DATA" | jq -r '.. | .projectV2? // empty | .fields.nodes[]?.name' | grep -v "null" | sed 's/^/  - /'
  exit 1
fi

echo "✅ Found Project ID: $PROJECT_ID"
echo "✅ Found Field ID: $FIELD_ID"
echo "✅ Found Status Field ID: $STATUS_FIELD_ID (Ready Option: $READY_OPTION_ID)"
echo "✅ Found Type Field ID: $TYPE_FIELD_ID (Task Option: $TASK_OPTION_ID)"

# 2. GET PARENT VALUE
echo "🔍 Checking Parent Issue #$ROOT_ISSUE_NUMBER across repositories..."

PARENT_DATA=""
FOUND_REPO=""

for REPO in "${REPOS[@]}"; do
  echo "   Searching in $REPO..."
  QUERY_DATA=$(gh api graphql -f owner="$OWNER" -f repo="$REPO" -F issueNumber="$ROOT_ISSUE_NUMBER" -f fieldName="$FIELD_NAME" -f query='
    query($owner: String!, $repo: String!, $issueNumber: Int!, $fieldName: String!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issueNumber) {
          id
          projectItems(first: 20) {
            nodes {
              project { id }
              fieldValueByName(name: $fieldName) {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  optionId
                  name
                }
              }
            }
          }
        }
      }
    }
  ')
  
  ISSUE_CHECK=$(echo "$QUERY_DATA" | jq -r '.data.repository.issue // empty')
  if [ -n "$ISSUE_CHECK" ]; then
    PARENT_DATA="$QUERY_DATA"
    FOUND_REPO="$REPO"
    break
  fi
done

if [ -z "$FOUND_REPO" ]; then
  echo "❌ Error: Could not find Issue #$ROOT_ISSUE_NUMBER in repositories: ${REPOS[*]}"
  exit 1
fi

# ... (after found_repo is determined) ...

echo "✅ Found Issue #$ROOT_ISSUE_NUMBER in $FOUND_REPO"

# Fetch Issue Type ID for "Task" in the found repository
ISSUE_TYPE_DATA=$(gh api graphql -f owner="$OWNER" -f name="$FOUND_REPO" -f query='
  query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      issueTypes(first: 20) {
        nodes { id name }
      }
    }
  }
')
TASK_TYPE_ID=$(echo "$ISSUE_TYPE_DATA" | jq -r '.data.repository.issueTypes.nodes[]? | select(.name == "Task") | .id // empty')
echo "✅ Found 'Task' Issue Type ID: $TASK_TYPE_ID"

PARENT_OPTION_ID=$(echo "$PARENT_DATA" | jq -r --arg pid "$PROJECT_ID" '.data.repository.issue.projectItems.nodes[]? | select(.project.id == $pid) | .fieldValueByName.optionId // empty')
PARENT_OPTION_NAME=$(echo "$PARENT_DATA" | jq -r --arg pid "$PROJECT_ID" '.data.repository.issue.projectItems.nodes[]? | select(.project.id == $pid) | .fieldValueByName.name // empty')

echo "🎯 Parent is set to: \"$PARENT_OPTION_NAME\""

if [ -z "$PARENT_OPTION_ID" ] || [ "$PARENT_OPTION_ID" == "null" ]; then
  echo "DEBUG: Raw PARENT_DATA response below:"
  echo "$PARENT_DATA" | jq .
  echo "❌ Parent issue has no value set for '$FIELD_NAME'."
  exit 1
fi

echo "🎯 Parent is set to: \"$PARENT_OPTION_NAME\""

# 3. FIND ALL DESCENDANTS (RECURSIVE BFS)
echo "🌳 Walking the issue tree to find descendants..."

ROOT_NODE_ID=$(echo "$PARENT_DATA" | jq -r '.data.repository.issue.id')
QUEUE=("$ROOT_NODE_ID")
DESCENDANTS=()
SEEN=("$ROOT_NODE_ID")

while [ ${#QUEUE[@]} -gt 0 ]; do
  CURRENT_ID=${QUEUE[0]}
  QUEUE=("${QUEUE[@]:1}") # Shift

  # Fetch children of current node (supporting both trackedIssues and subIssues)
  CHILDREN_JSON=$(gh api graphql -f nodeId="$CURRENT_ID" -f query='
    query($nodeId: ID!) {
      node(id: $nodeId) {
        ... on Issue {
          trackedIssues(first: 50) {
            nodes {
              id
              number
            }
          }
          subIssues(first: 50) {
            nodes {
              id
              number
            }
          }
        }
      }
    }
  ')

  # Extract IDs and Numbers from both fields
  CHILD_IDS=$(echo "$CHILDREN_JSON" | jq -r '(.data.node.trackedIssues.nodes[]?.id // empty), (.data.node.subIssues.nodes[]?.id // empty)')
  
  for child in $CHILD_IDS; do
    if [ -z "$child" ] || [ "$child" == "null" ]; then continue; fi
    # Check if seen (simple duplicate check)
    if [[ ! " ${SEEN[@]} " =~ " ${child} " ]]; then
      SEEN+=("$child")
      QUEUE+=("$child")
      DESCENDANTS+=("$child")
      # Extract number just for logging
      CHILD_NUM=$(echo "$CHILDREN_JSON" | jq -r --arg cid "$child" '((.data.node.trackedIssues.nodes[]? | select(.id == $cid) | .number) // (.data.node.subIssues.nodes[]? | select(.id == $cid) | .number))')
      echo "   Found descendant: #$CHILD_NUM"
    fi
  done
done

echo "✅ Found ${#DESCENDANTS[@]} descendants to update."

# 4. UPDATE DESCENDANTS
for ISSUE_ID in "${DESCENDANTS[@]}"; do
  # We need the Project Item ID for this specific issue, and check its Type
  ITEM_DATA=$(gh api graphql -f issueId="$ISSUE_ID" -f query='
    query($issueId: ID!) {
      node(id: $issueId) {
        ... on Issue {
          number
          projectItems(first: 10) {
            nodes {
              id
              project { id }
              fieldValueByName(name: "Type") {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                }
              }
            }
          }
        }
      }
    }
  ')
  
  ITEM_ID=$(echo "$ITEM_DATA" | jq -r --arg pid "$PROJECT_ID" '.data.node.projectItems.nodes[]? | select(.project.id == $pid) | .id // empty')
  ISSUE_NUM=$(echo "$ITEM_DATA" | jq -r '.data.node.number')
  
  # Check if Type (Issue Type) is already set
  # We check the issueType field on the issue
  CURRENT_ISSUE_TYPE=$(gh api graphql -f issueId="$ISSUE_ID" -f query='
    query($issueId: ID!) {
      node(id: $issueId) {
        ... on Issue {
          issueType { name }
        }
      }
    }
  ')
  HAS_TASK_TYPE=$(echo "$CURRENT_ISSUE_TYPE" | jq -r '.data.node.issueType.name // empty')

  if [ -z "$ITEM_ID" ]; then
    echo "➕ Adding Issue #$ISSUE_NUM to project board..."
    ADD_ITEM_DATA=$(gh api graphql -f projectId="$PROJECT_ID" -f contentId="$ISSUE_ID" -f query='
      mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
          item { id }
        }
      }
    ')
    ITEM_ID=$(echo "$ADD_ITEM_DATA" | jq -r '.data.addProjectV2ItemById.item.id // empty')
  fi

  if [ -n "$ITEM_ID" ]; then
    echo "✏️  Updating Issue #$ISSUE_NUM (Item: $ITEM_ID)..."
    
    # Update Area
    gh api graphql -f projectId="$PROJECT_ID" -f itemId="$ITEM_ID" -f fieldId="$FIELD_ID" -f optionId="$PARENT_OPTION_ID" -f query='
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: { singleSelectOptionId: $optionId }
        }) { clientMutationId }
      }
    ' > /dev/null

    # Update Status to Ready if we found the IDs
    if [ -n "$STATUS_FIELD_ID" ] && [ -n "$READY_OPTION_ID" ]; then
      echo "   └─ Setting Status to Ready..."
      gh api graphql -f projectId="$PROJECT_ID" -f itemId="$ITEM_ID" -f fieldId="$STATUS_FIELD_ID" -f optionId="$READY_OPTION_ID" -f query='
        mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
          updateProjectV2ItemFieldValue(input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { singleSelectOptionId: $optionId }
          }) { clientMutationId }
        }
      ' > /dev/null
    fi

    # Update Issue Type to Task if empty
    if [ -n "$TASK_TYPE_ID" ] && [ -z "$HAS_TASK_TYPE" ]; then
      echo "   └─ Setting Issue Type to 'Task'..."
      gh api graphql -f issueId="$ISSUE_ID" -f issueTypeId="$TASK_TYPE_ID" -f query='
        mutation($issueId: ID!, $issueTypeId: ID!) {
          updateIssue(input: {id: $issueId, issueTypeId: $issueTypeId}) {
            issue { issueType { name } }
          }
        }
      ' > /dev/null
    fi
  else
    echo "❌ Failed to add/find Issue #$ISSUE_NUM on the project board."
  fi
done

echo "🎉 Done!"