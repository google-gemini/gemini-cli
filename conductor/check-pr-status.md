# Objective

Check PR status and implement a fix if there are any issues.

# Implementation steps

1. Exit **Plan Mode** with `Shift+Tab`.
2. Verify the PR is mergeable with `gh pr view`. If there are conflicts, fetch
   and merge upstream/main.
3. Verify the tests are passing with `gh pr checks` and resolve and investigate
   any failing checks.
