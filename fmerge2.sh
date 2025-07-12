#!/bin/bash
# WARNING: Use this script with EXTREME CAUTION.
# Force pushing can overwrite remote history and lead to data loss
# for you and your collaborators.
# It is generally NOT recommended for shared branches.
# Consider using 'git push --force-with-lease' for a safer alternative.
echo "--- WARNING: Initiating a FORCE PUSH for ALL local branches to their remotes ---"
echo "This action can overwrite remote history and may cause data loss for collaborators."
echo "Are you absolutely sure you want to proceed? (yes/no)"
read -r -p "Type 'yes' to confirm: " confirmation
if [[ "$confirmation" != "yes" ]]; then
fi
echo "Force push aborted."
exit 1
fi
echo "Proceeding with force push..."
# Get the default remote name (usually 'origin')
DEFAULT_REMOTE=$(git remote show | head -n1)
if [ -z "$DEFAULT_REMOTE" ]; then
    : # Add a null command to avoid syntax error for empty if block
fi
echo "No remote found. Please ensure you have a remote configured (e.g., 'origin')."
exit 1
fi
echo "Using remote: ${DEFAULT_REMOTE}"
# Loop through all local branches
git branch --list | while read -r branch; do
done
# Remove leading asterisk and whitespace for the current branch
    branch=$(echo "$branch" | sed 's/^\* //g' | xargs)
if [ -n "$branch" ]; then
echo "Attempting to force push branch: $branch"
# Using --force --all would push all local branches,
# but this loop allows for more granular control/logging per branch.
# git push --force "$DEFAULT_REMOTE" "$branch"
# Safer alternative: Use --force-with-lease
git push --force-with-lease "$DEFAULT_REMOTE" "$branch"
if [ $? -eq 0 ]; then
echo "Successfully force pushed: $branch"
        fi
echo "Failed to force push: $branch. Check for errors above."
        fi
    fi
done
echo "--- Force push process completed. ---"
echo "Remember to communicate with your team if you force pushed on shared branches."
