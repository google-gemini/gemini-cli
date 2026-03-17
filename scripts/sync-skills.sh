#!/bin/bash
# sync-skills.sh - Syncs custom skills from the repo to the user's global ~/.gemini/skills folder.
# It also creates a slash command for each skill to make them easily accessible.

SKILLS_DIR="${HOME}/.gemini/skills"
COMMANDS_DIR="${HOME}/.gemini/commands"
REPO_SKILLS_PATH="packages/core/src/skills/builtin"

mkdir -p "${SKILLS_DIR}"
mkdir -p "${COMMANDS_DIR}"

echo "Syncing skills and commands..."

# List of skills to sync
CUSTOM_SKILLS=("_ux_git-worktree" "_ux_finish-pr")

for SKILL in "${CUSTOM_SKILLS[@]}"; do
    if [[ -d "${REPO_SKILLS_PATH}/${SKILL}" ]]; then
        # Sync Skill
        cp -r "${REPO_SKILLS_PATH}/${SKILL}" "${SKILLS_DIR}/"
        echo "✅ Synced: ${SKILL}"

        # Create Slash Command
        COMMAND_FILE="${COMMANDS_DIR}/${SKILL}.toml"
        cat <<EOF > "${COMMAND_FILE}"
description = "Invoke the ${SKILL} skill"
prompt = "Activate the ${SKILL} skill and follow its instructions to: {{args}}"
EOF
        echo "✅ Created Command: /${SKILL}"
    else
        echo "❌ Error: Skill ${SKILL} not found in ${REPO_SKILLS_PATH}"
    fi
done

echo "Done. Run '/skills reload' and '/commands reload' in your Gemini session to apply changes."
