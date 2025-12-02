#!/bin/bash
# Check dati sensibili (stile Codex-Termux)

ERRORS=0

echo "🔍 Checking for sensitive data..."

# Pattern sensibili
PATTERNS=(
  "Davide"
  "Guglielmi"
  "dev@mmmbuto.com"
  "dag@"
  "cloud.alpacalibre.com"
  "mmmbuto.com"
  "192.168"
  "Claude Code"
  "Co-Authored-By: Claude"
  "ghp_"
  "npm_"
  "gho_"
)

FILES_TO_CHECK=(
  "README.md"
  "package.json"
  "docs/TERMUX.md"
  "esbuild.config.js"
)

for FILE in "${FILES_TO_CHECK[@]}"; do
  if [ -f "$FILE" ]; then
    for PATTERN in "${PATTERNS[@]}"; do
      if grep -qi "$PATTERN" "$FILE"; then
        echo "❌ Found '$PATTERN' in $FILE"
        grep -ni "$PATTERN" "$FILE" | head -3
        ERRORS=$((ERRORS + 1))
      fi
    done
  fi
done

if [ $ERRORS -eq 0 ]; then
  echo "✅ No sensitive data found in public files"
  exit 0
else
  echo "❌ Found $ERRORS sensitive data issues"
  echo "⚠️  Please remove sensitive data before pushing to public GitHub"
  exit 1
fi
