#!/bin/bash
# sync-skills.sh - Syncs custom skills from the repo to the user's global ~/.gemini/skills folder.

SKILLS_DIR="$HOME/.gemini/skills"
REPO_SKILLS_PATH="packages/core/src/skills/builtin"

mkdir -p "$SKILLS_DIR"

echo "Syncing skills to $SKILLS_DIR..."

# List of skills to sync
CUSTOM_SKILLS=("git-worktree" "review-pr" "ux-pr-finisher")

for SKILL in "${CUSTOM_SKILLS[@]}"; do
    if [ -d "$REPO_SKILLS_PATH/$SKILL" ]; then
        cp -r "$REPO_SKILLS_PATH/$SKILL" "$SKILLS_DIR/"
        echo "✅ Synced: $SKILL"
    else
        echo "❌ Error: Skill $SKILL not found in $REPO_SKILLS_PATH"
    fi
done

echo "Done. Run '/skills reload' in your Gemini session to apply changes."
