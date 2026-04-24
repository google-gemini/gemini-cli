# Objective

Check PR status and implement a fix if there are any issues.

# Implementation Steps

1. Exit Plan Mode.
2. Run `gh pr view` and `gh pr checks` to see if the PR is mergeable and if
   tests are passing.
3. If there are conflicts, fetch and merge upstream/main.
4. If there are failing tests, investigate and fix them.
