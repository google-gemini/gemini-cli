#!/bin/bash
# sync-skills.sh - Syncs custom skills from the repo to the user's global ~/.gemini/skills folder
# and creates corresponding slash commands.

SKILLS_DIR="$HOME/.gemini/skills"
COMMANDS_DIR="$HOME/.gemini/commands"
REPO_SKILLS_PATH="packages/core/src/skills/builtin"

mkdir -p "$SKILLS_DIR"
mkdir -p "$COMMANDS_DIR"

echo "Syncing skills and commands..."

# List of skills to sync
# Format: "skill_name:command_name"
CUSTOM_SKILLS=("_ux_git-worktree:ux_git-worktree" "_ux_finish-pr:ux_finish-pr")

for ENTRY in "${CUSTOM_SKILLS[@]}"; do
    SKILL="${ENTRY%%:*}"
    COMMAND="${ENTRY##*:}"
    
    if [ -d "$REPO_SKILLS_PATH/$SKILL" ]; then
        # Sync Skill
        cp -r "$REPO_SKILLS_PATH/$SKILL" "$SKILLS_DIR/"
        echo "✅ Synced Skill: $SKILL"

        # Create Slash Command with a slightly different name to avoid conflict with the skill name
        # We remove the leading underscore for the command name to avoid collision with the skill itself
        COMMAND_FILE="$COMMANDS_DIR/$COMMAND.toml"
        cat <<EOF > "$COMMAND_FILE"
description = "Invoke the $SKILL skill"
prompt = "Activate the $SKILL skill and follow its instructions to: {{args}}"
EOF
        echo "✅ Created Command: /$COMMAND"
    else
        echo "❌ Error: Skill $SKILL not found in $REPO_SKILLS_PATH"
    fi
done

echo "Done. Run '/skills reload' and '/commands reload' in your Gemini session to apply changes."
