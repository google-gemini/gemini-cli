#!/bin/bash
# sync-skills.sh - Syncs custom skills from the repo to the user's global ~/.gemini/skills folder.

SKILLS_DIR="${HOME}/.gemini/skills"
COMMANDS_DIR="${HOME}/.gemini/commands"
REPO_SKILLS_PATH="packages/core/src/skills/builtin"

mkdir -p "${SKILLS_DIR}"

echo "Syncing skills..."

# List of skills to sync
CUSTOM_SKILLS=("_ux_git-worktree" "_ux_finish-pr" "_ux_designer")

for SKILL in "${CUSTOM_SKILLS[@]}"; do
    if [[ -d "${REPO_SKILLS_PATH}/${SKILL}" ]]; then
        # Sync Skill
        cp -r "${REPO_SKILLS_PATH}/${SKILL}" "${SKILLS_DIR}/"
        echo "✅ Synced: ${SKILL}"

        # Clean up legacy explicit command files if they exist to prevent conflicts.
        # Gemini CLI automatically registers a slash command for each skill based on its name.
        COMMAND_FILE="${COMMANDS_DIR}/${SKILL}.toml"
        if [[ -f "${COMMAND_FILE}" ]]; then
            rm -f "${COMMAND_FILE}"
            echo "🧹 Cleaned up redundant command file: ${COMMAND_FILE}"
        fi
    else
        echo "❌ Error: Skill ${SKILL} not found in ${REPO_SKILLS_PATH}"
    fi
done

echo "Done. Run '/skills reload' in your Gemini session to apply changes."
