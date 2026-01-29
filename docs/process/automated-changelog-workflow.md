# Automated Changelog Update Workflow

## 1. Objective

To automate the process of updating the changelog documents
(`docs/changelogs/index.md` and `docs/changelogs/latest.md`) upon the creation
of a new "preview" or "stable" release on GitHub.

## 2. Triggering Mechanism

The automation will be triggered by the `release` event in a GitHub Actions
workflow. We can configure the workflow to run only when a release is
`published`, and we can further filter by the release tag (`v*.*.*` for stable,
`v*.*.*-preview.*` for preview) or by the pre-release field.

## 3. Automation Approach: GitHub Actions vs. Custom Workflow Scripts

When implementing this automation, we have two main approaches: a single,
self-contained GitHub Action, or a GitHub Action that calls a separate,
dedicated script.

### 3.1. Self-Contained GitHub Action

In this approach, all the logic is contained within the `.yml` file for the
GitHub Action.

**Pros:**

- **Simplicity:** All logic is in one place, making it easy to find and
  understand the workflow.
- **Lower Maintenance:** No need to maintain a separate script file.
- **Good for Simple Logic:** Ideal for straightforward tasks that don't require
  complex scripting.

**Cons:**

- **Less Reusable:** The logic is tied to the GitHub Actions ecosystem.
- **Harder to Test:** Testing the logic requires triggering the action on
  GitHub.
- **Can Become Complex:** For complex logic, the `.yml` file can become long and
  difficult to read.

### 3.2. GitHub Action with a Custom Script

In this approach, the GitHub Action is a lightweight wrapper that calls a script
(e.g., a Bash or Node.js script) to perform the main logic.

**Pros:**

- **Modularity and Reusability:** The script can be run locally for testing and
  can be reused in other contexts.
- **Easier to Test:** The script can be tested independently of the GitHub
  Action.
- **Better for Complex Logic:** Complex logic is easier to write and maintain in
  a dedicated script file.

**Recommendation:** For this use case, a **GitHub Action with a custom Node.js
script** is recommended. This approach is more scalable and testable, and aligns
well with the project's existing technology stack.

## 4. Implementation Details

### 4.1. GitHub Action Workflow (`.github/workflows/changelog-automation.yml`)

```yaml
name: Automated Changelog Update

on:
  release:
    types: [published]

jobs:
  update-changelog:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Run changelog update script
        run: node ./scripts/update-changelog.js
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          RELEASE_TAG: ${{ github.event.release.tag_name }}
          RELEASE_DATE: ${{ github.event.release.published_at }}
          RELEASE_BODY: ${{ github.event.release.body }}

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          commit-message:
            'docs(changelog): Automated update for release ${{
            github.event.release.tag_name }}'
          title:
            'docs(changelog): Automated update for release ${{
            github.event.release.tag_name }}'
          body:
            'Automated changelog update based on release ${{
            github.event.release.tag_name }}.'
          branch: 'docs/changelog-update-${{ github.event.release.tag_name }}'
          base: 'main'
```

### 4.2. Custom Script (`scripts/update-changelog.js`)

This Node.js script would be responsible for:

1.  Reading the environment variables (`RELEASE_TAG`, `RELEASE_DATE`,
    `RELEASE_BODY`).
2.  Constructing the headless Gemini CLI command.
3.  Executing the command.

### 4.3. Example Gemini CLI Command

The script would construct and execute a command similar to this:

```bash
gemini "Update the changelog for version ${process.env.RELEASE_TAG}, released on ${process.env.RELEASE_DATE}. Use the following changelog body as the raw changelog data:

${process.env.RELEASE_BODY}

Follow the instructions in the SOP document at 'docs/process/changelog-update-sop.md' to perform this task." --headless
```

## 5. Security Considerations

The `GITHUB_TOKEN` is required for the `create-pull-request` action to create a
pull request on behalf of the user or a bot. The default permissions for the
`GITHUB_TOKEN` should be sufficient for this action.
