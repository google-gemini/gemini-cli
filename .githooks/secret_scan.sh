#!/usr/bin/env bash
set -euo pipefail

# Secret-like pattern scanner for staged files.
# Fails commit if any staged file matches common secret patterns.

patterns='(API[_-]?KEY|SECRET|TOKEN|GOOGLE_APPLICATION_CREDENTIALS|PASSWORD|PASS|PRIVATE_KEY|ACCESS_KEY|sk-[A-Za-z0-9]{10,})'

status=0
# If no filenames are passed (pre-commit typically passes them), scan nothing.
if [ "$#" -eq 0 ]; then
  exit 0
fi

for file in "$@"; do
  # Only regular files
  [ -f "$file" ] || continue
  # Skip binary files
  if grep -Iq . "$file"; then
    if grep -IEn -- "$patterns" "$file" >/dev/null 2>&1; then
      echo "Potential secret-like content found in: $file" >&2
      status=1
    fi
  fi
done

if [ "$status" -ne 0 ]; then
  echo "Commit blocked: remove or scrub secrets before committing." >&2
fi

exit "$status"

