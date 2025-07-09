#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

# === CONFIG ===
PROMPT_FILE="${HOME}/jules_prompt.json"
JULES_API_SCRIPT="${HOME}/bin/ai-v4.0.sh" # Adjust if needed
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo $PWD)"

# === STYLE ===
cyan="\033[1;36m"
green="\033[1;32m"
red="\033[1;31m"
reset="\033[0m"

echo -e "${cyan} Google Jules AI - Autonomous Codebase Auditor${reset}"
echo -e "${green}→ Project Root: ${PROJECT_ROOT}${reset}"

# --- Checks ---
[[ -f "$PROMPT_FILE" ]] || { echo -e "${red}✖ Prompt file not found: $PROMPT_FILE${reset}"; exit 1; }
[[ -x "$JULES_API_SCRIPT" ]] || { echo -e "${red}✖ Gemini API script not executable: $JULES_API_SCRIPT${reset}"; exit 1; }

# --- Build code payload ---
echo -e "${cyan} Building input payload...${reset}"
CODE_PAYLOAD=$(find "$PROJECT_ROOT" \
 -type f \
 -not -path './.git/*' \
 -not -path './node_modules/*' \
 -not -path './venv/*' \
 -not -path './dist/*' \
 -not -path './pycache/*' \
 -exec echo -e "\n### {} ###\n" \; \
 -exec cat {} \; | awk '{ printf "%s\n", $0 }' | sed 's/"/\\"/g')

# --- Final JSON ---
FINAL_PAYLOAD=$(jq -n --argjson prompt "$(cat "$PROMPT_FILE")" --arg code "$CODE_PAYLOAD" '{prompt: $prompt, source_code: $code}')

# --- Send to Gemini ---
echo -e "${green} Auditing with Jules...${reset}"
echo "$FINAL_PAYLOAD" | "$JULES_API_SCRIPT" --json --model gemini-pro

echo -e "${green}✅ Audit complete.${reset}"
