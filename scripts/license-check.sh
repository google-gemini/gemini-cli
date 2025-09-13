#!/usr/bin/env bash
set -euo pipefail

# Comprehensive license and attribution compliance check
# This script ensures all source files have proper license headers and attribution

echo "🔍 Running license and attribution compliance check..."

BASE="${GITHUB_BASE_REF:-origin/${GITHUB_BASE_REF:-main}}"
HEAD="${GITHUB_SHA:-HEAD}"

# Get changed files, fallback to all tracked files if diff fails
if git diff --name-only "$BASE"..."$HEAD" >/dev/null 2>&1; then
    CHANGED_FILES=$(git diff --name-only "$BASE"..."$HEAD")
elif git diff --name-only HEAD~1..HEAD >/dev/null 2>&1; then
    CHANGED_FILES=$(git diff --name-only HEAD~1..HEAD)
else
    # Fallback: check all source files if we can't determine changes
    CHANGED_FILES=$(find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.go" -o -name "*.py" -o -name "*.java" \) \
                   ! -path "./node_modules/*" ! -path "./dist/*" ! -path "./build/*" ! -path "./.git/*" | head -50)
fi

FAIL=0
MISSING_HEADERS=()
PROHIBITED_LICENSES=()

# Check each source file for proper license headers
while IFS= read -r file; do
    [ -z "$file" ] && continue
    [ ! -f "$file" ] && continue

    # Skip certain directories and files
    [[ "$file" =~ ^\./(node_modules|dist|build|\.git)/ ]] && continue
    [[ "$file" =~ \.(test|spec|config)\.(ts|js)$ ]] && continue

    # Check for license/copyright headers
    if ! head -n 10 "$file" | grep -qiE "(copyright|license|spdx)"; then
        MISSING_HEADERS+=("$file")
        FAIL=1
    fi

    # Check for prohibited licenses
    if grep -qi "GPL-3.0\|GPL-2.0\|LGPL" "$file"; then
        PROHIBITED_LICENSES+=("$file")
        FAIL=1
    fi

done <<< "$CHANGED_FILES"

# Report results
if [ ${#MISSING_HEADERS[@]} -gt 0 ]; then
    echo "❌ Missing license headers in the following files:"
    printf '%s\n' "${MISSING_HEADERS[@]}"
    echo ""
fi

if [ ${#PROHIBITED_LICENSES[@]} -gt 0 ]; then
    echo "❌ Prohibited licenses detected in the following files:"
    printf '%s\n' "${PROHIBITED_LICENSES[@]}"
    echo ""
fi

if [ $FAIL -eq 0 ]; then
    echo "✅ All license and attribution checks passed!"
else
    echo "❌ License compliance check failed. Please fix the issues above."
    echo ""
    echo "📋 Remediation steps:"
    echo "1. Add Apache 2.0 or BSD-3 license headers to missing files:"
    echo '   /*'
    echo '    * @license'
    echo '    * Copyright 2025 Google LLC'
    echo '    * SPDX-License-Identifier: Apache-2.0'
    echo '    */'
    echo ""
    echo "2. Replace any GPL/LGPL references with Apache 2.0 compatible licenses"
    echo ""
    echo "3. Ensure proper attribution for any third-party code"
fi

exit $FAIL
