# Gemini CLI Releases

## Release Cadence and Tags

We will follow https://semver.org/ as closely as possible but will call out when or if we have to deviate from it. Our weekly releases will be minor version increments and any bug or hotfixes between releases will go out as patch versions on the most recent release.

Each Tuesday ~2000 UTC new Stable and Preview releases will be cut. The promotion flow is:

- Code is committed to main and pushed each night to nightly
- After no more than 1 week on main, code is promoted to the `preview` channel
- After 1 week the most recent `preview` channel is promoted to `stable` channel
- Patch fixes will be produced against both `preview` and `stable` as needed, with the final 'patch' version number incrementing each time.

### Preview

These releases will not have been fully vetted and may contain regressions or other outstanding issues. Please help us test and install with `preview` tag.

```bash
npm install -g @google/gemini-cli@preview
```

### Stable

This will be the full promotion of last week's release + any bug fixes and validations. Use `latest` tag.

```bash
npm install -g @google/gemini-cli@latest
```

### Nightly

- New releases will be published each day at UTC 0000. This will be all changes from the main branch as represented at time of release. It should be assumed there are pending validations and issues. Use `nightly` tag.

```bash
npm install -g @google/gemini-cli@nightly
```

## Weekly Release Promotion

Each Tuesday, the on-call engineer will trigger the "Promote Release" workflow. This single action automates the entire weekly release process:

1.  **Promotes Preview to Stable:** The workflow identifies the latest `preview` release and promotes it to `stable`. This becomes the new `latest` version on npm.
2.  **Promotes Nightly to Preview:** The latest `nightly` release is then promoted to become the new `preview` version.
3.  **Prepares for next Nightly:** A pull request is automatically created and merged to bump the version in `main` in preparation for the next nightly release.

This process ensures a consistent and reliable release cadence with minimal manual intervention.

### Source of Truth for Versioning

To ensure the highest reliability, the release promotion process uses the **NPM registry as the single source of truth** for determining the current version of each release channel (`stable`, `preview`, and `nightly`).

1.  **Fetch from NPM:** The workflow begins by querying NPM's `dist-tags` (`latest`, `preview`, `nightly`) to get the exact version strings for the packages currently available to users.
2.  **Cross-Check for Integrity:** For each version retrieved from NPM, the workflow performs a critical integrity check:
    - It verifies that a corresponding **git tag** exists in the repository.
    - It verifies that a corresponding **GitHub Release** has been created.
3.  **Halt on Discrepancy:** If either the git tag or the GitHub Release is missing for a version listed on NPM, the workflow will immediately fail. This strict check prevents promotions from a broken or incomplete previous release and alerts the on-call engineer to a release state inconsistency that must be manually resolved.
4.  **Calculate Next Version:** Only after these checks pass does the workflow proceed to calculate the next semantic version based on the trusted version numbers retrieved from NPM.

This NPM-first approach, backed by integrity checks, makes the release process highly robust and prevents the kinds of versioning discrepancies that can arise from relying solely on git history or API outputs.

## Manual Releases

For situations requiring a release outside of the regular nightly and weekly promotion schedule, and NOT already covered by patching process, you can use the `Release: Manual` workflow. This workflow provides a direct way to publish a specific version from any branch, tag, or commit SHA.

### How to Create a Manual Release

1.  Navigate to the **Actions** tab of the repository.
2.  Select the **Release: Manual** workflow from the list.
3.  Click the **Run workflow** dropdown button.
4.  Fill in the required inputs:
    - **Version**: The exact version to release (e.g., `v0.6.1`). This must be a valid semantic version with a `v` prefix.
    - **Ref**: The branch, tag, or full commit SHA to release from.
    - **NPM Channel**: The npm channel to publish to. The options are `preview`, `nightly`, `latest` (for stable releases), and `dev`. The default is `dev`.
    - **Dry Run**: Leave as `true` to run all steps without publishing, or set to `false` to perform a live release.
    - **Force Skip Tests**: Set to `true` to skip the test suite. This is not recommended for production releases.
    - **Skip GitHub Release**: Set to `true` to skip creating a GitHub release and create an npm release only.
5.  Click **Run workflow**.

The workflow will then proceed to test (if not skipped), build, and publish the release. If the workflow fails during a non-dry run, it will automatically create a GitHub issue with the failure details.

## Rollback/Rollforward

In the event that a release has a critical regression, you can quickly roll back to a previous stable version or roll forward to a new patch by changing the npm `dist-tag`. The `Release: Change Tags` workflow provides a safe and controlled way to do this.

This is the preferred method for both rollbacks and rollforwards, as it does not require a full release cycle.

### How to Change a Release Tag

1.  Navigate to the **Actions** tab of the repository.
2.  Select the **Release: Change Tags** workflow from the list.
3.  Click the **Run workflow** dropdown button.
4.  Fill in the required inputs:
    - **Version**: The existing package version that you want to point the tag to (e.g., `0.5.0-preview-2`). This version **must** already be published to the npm registry.
    - **Channel**: The npm `dist-tag` to apply (e.g., `preview`, `stable`).
    - **Dry Run**: Leave as `true` to log the action without making changes, or set to `false` to perform the live tag change.
5.  Click **Run workflow**.

The workflow will then run `npm dist-tag add` for both the `@google/gemini-cli` and `@google/gemini-cli-core` packages, pointing the specified channel to the specified version.

## Patching

If a critical bug that is already fixed on `main` needs to be patched on a `stable` or `preview` release, the process is now highly automated.

### How to Patch

#### 1. Create the Patch Pull Request

There are two ways to create a patch pull request:

**Option A: From a GitHub Comment (Recommended)**

After a pull request containing the fix has been merged, a maintainer can add a comment on that same PR with the following format:

`/patch [channel]`

- **channel** (optional):
  - _no channel_ - patches both stable and preview channels (default, recommended for most fixes)
  - `both` - patches both stable and preview channels (same as default)
  - `stable` - patches only the stable channel
  - `preview` - patches only the preview channel

Examples:

- `/patch` (patches both stable and preview - default)
- `/patch both` (patches both stable and preview - explicit)
- `/patch stable` (patches only stable)
- `/patch preview` (patches only preview)

The `Release: Patch from Comment` workflow will automatically find the merge commit SHA and trigger the `Release: Patch (1) Create PR` workflow. If the PR is not yet merged, it will post a comment indicating the failure.

**Option B: Manually Triggering the Workflow**

Navigate to the **Actions** tab and run the **Release: Patch (1) Create PR** workflow.

- **Commit**: The full SHA of the commit on `main` that you want to cherry-pick.
- **Channel**: The channel you want to patch (`stable` or `preview`).

This workflow will automatically:

1.  Find the latest release tag for the channel.
2.  Create a release branch from that tag if one doesn't exist (e.g., `release/v0.5.1-pr-12345`).
3.  Create a new hotfix branch from the release branch.
4.  Cherry-pick your specified commit into the hotfix branch.
5.  Create a pull request from the hotfix branch back to the release branch.

#### 2. Review and Merge

Review the automatically created pull request(s) to ensure the cherry-pick was successful and the changes are correct. Once approved, merge the pull request.

**Security Note:** The `release/*` branches are protected by branch protection rules. A pull request to one of these branches requires at least one review from a code owner before it can be merged. This ensures that no unauthorized code is released.

#### 2.5. Adding Multiple Commits to a Hotfix (Advanced)

If you need to include multiple fixes in a single patch release, you can add additional commits to the hotfix branch after the initial patch PR has been created:

1. **Start with the primary fix**: Use `/patch` (or `/patch both`) on the most important PR to create the initial hotfix branch and PR.

2. **Checkout the hotfix branch locally**:

   ```bash
   git fetch origin
   git checkout hotfix/v0.5.1/stable/cherry-pick-abc1234  # Use the actual branch name from the PR
   ```

3. **Cherry-pick additional commits**:

   ```bash
   git cherry-pick <commit-sha-1>
   git cherry-pick <commit-sha-2>
   # Add as many commits as needed
   ```

4. **Push the updated branch**:

   ```bash
   git push origin hotfix/v0.5.1/stable/cherry-pick-abc1234
   ```

5. **Test and review**: The existing patch PR will automatically update with your additional commits. Test thoroughly since you're now releasing multiple changes together.

6. **Update the PR description**: Consider updating the PR title and description to reflect that it includes multiple fixes.

This approach allows you to group related fixes into a single patch release while maintaining full control over what gets included and how conflicts are resolved.

#### 3. Automatic Release

Upon merging the pull request, the `Release: Patch (2) Trigger` workflow is automatically triggered. It will then start the `Release: Patch (3) Release` workflow, which will:

1.  Build and test the patched code.
2.  Publish the new patch version to npm.
3.  Create a new GitHub release with the patch notes.

This fully automated process ensures that patches are created and released consistently and reliably.

#### Troubleshooting: Older Branch Workflows

**Issue**: If the patch trigger workflow fails with errors like "Resource not accessible by integration" or references to non-existent workflow files (e.g., `patch-release.yml`), this indicates the hotfix branch contains an outdated version of the workflow files.

**Root Cause**: When a PR is merged, GitHub Actions runs the workflow definition from the **source branch** (the hotfix branch), not from the target branch (the release branch). If the hotfix branch was created from an older release branch that predates workflow improvements, it will use the old workflow logic.

**Solutions**:

**Option 1: Manual Trigger (Quick Fix)**
Manually trigger the updated workflow from the branch with the latest workflow code:

```bash
# For a preview channel patch with tests skipped
gh workflow run release-patch-2-trigger.yml --ref <branch-with-updated-workflow> \
  --field ref="hotfix/v0.6.0-preview.2/preview/cherry-pick-abc1234" \
  --field workflow_ref=<branch-with-updated-workflow> \
  --field dry_run=false \
  --field force_skip_tests=true

# For a stable channel patch
gh workflow run release-patch-2-trigger.yml --ref <branch-with-updated-workflow> \
  --field ref="hotfix/v0.5.1/stable/cherry-pick-abc1234" \
  --field workflow_ref=<branch-with-updated-workflow> \
  --field dry_run=false \
  --field force_skip_tests=false

# Example using main branch (most common case)
gh workflow run release-patch-2-trigger.yml --ref main \
  --field ref="hotfix/v0.6.0-preview.2/preview/cherry-pick-abc1234" \
  --field workflow_ref=main \
  --field dry_run=false \
  --field force_skip_tests=true
```

**Note**: Replace `<branch-with-updated-workflow>` with the branch containing the latest workflow improvements (usually `main`, but could be a feature branch if testing updates).

**Option 2: Update the Hotfix Branch**
Merge the latest main branch into your hotfix branch to get the updated workflows:

```bash
git checkout hotfix/v0.6.0-preview.2/preview/cherry-pick-abc1234
git merge main
git push
```

Then close and reopen the PR to retrigger the workflow with the updated version.

**Option 3: Direct Release Trigger**
Skip the trigger workflow entirely and directly run the release workflow:

```bash
# Replace channel and release_ref with appropriate values
gh workflow run release-patch-3-release.yml --ref main \
  --field type="preview" \
  --field dry_run=false \
  --field force_skip_tests=true \
  --field release_ref="release/v0.6.0-preview.2"
```

### Docker

We also run a Google cloud build called [release-docker.yml](../.gcp/release-docker.yml). Which publishes the sandbox docker to match your release. This will also be moved to GH and combined with the main release file once service account permissions are sorted out.

## Release Validation

After pushing a new release smoke testing should be performed to ensure that the packages are working as expected. This can be done by installing the packages locally and running a set of tests to ensure that they are functioning correctly.

- `npx -y @google/gemini-cli@latest --version` to validate the push worked as expected if you were not doing a rc or dev tag
- `npx -y @google/gemini-cli@<release tag> --version` to validate the tag pushed appropriately
- _This is destructive locally_ `npm uninstall @google/gemini-cli && npm uninstall -g @google/gemini-cli && npm cache clean --force &&  npm install @google/gemini-cli@<version>`
- Smoke testing a basic run through of exercising a few llm commands and tools is recommended to ensure that the packages are working as expected. We'll codify this more in the future.

## Local Testing and Validation: Changes to the Packaging and Publishing Process

If you need to test the release process without actually publishing to NPM or creating a public GitHub release, you can trigger the workflow manually from the GitHub UI.

1.  Go to the [Actions tab](https://github.com/google-gemini/gemini-cli/actions/workflows/release-manual.yml) of the repository.
2.  Click on the "Run workflow" dropdown.
3.  Leave the `dry_run` option checked (`true`).
4.  Click the "Run workflow" button.

This will run the entire release process but will skip the `npm publish` and `gh release create` steps. You can inspect the workflow logs to ensure everything is working as expected.

It is crucial to test any changes to the packaging and publishing process locally before committing them. This ensures that the packages will be published correctly and that they will work as expected when installed by a user.

To validate your changes, you can perform a dry run of the publishing process. This will simulate the publishing process without actually publishing the packages to the npm registry.

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

This command will do the following:

1.  Build all the packages.
2.  Run all the prepublish scripts.
3.  Create the package tarballs that would be published to npm.
4.  Print a summary of the packages that would be published.

You can then inspect the generated tarballs to ensure that they contain the correct files and that the `package.json` files have been updated correctly. The tarballs will be created in the root of each package's directory (e.g., `packages/cli/google-gemini-cli-0.1.6.tgz`).

By performing a dry run, you can be confident that your changes to the packaging process are correct and that the packages will be published successfully.

## Release Deep Dive

The release process creates two distinct types of artifacts for different distribution channels: standard packages for the NPM registry and a single, self-contained executable for GitHub Releases.

Here are the key stages:

**Stage 1: Pre-Release Sanity Checks and Versioning**

- **What happens:** Before any files are moved, the process ensures the project is in a good state. This involves running tests, linting, and type-checking (`npm run preflight`). The version number in the root `package.json` and `packages/cli/package.json` is updated to the new release version.

**Stage 2: Building the Source Code for NPM**

- **What happens:** The TypeScript source code in `packages/core/src` and `packages/cli/src` is compiled into standard JavaScript.
- **File movement:**
  - `packages/core/src/**/*.ts` -> compiled to -> `packages/core/dist/`
  - `packages/cli/src/**/*.ts` -> compiled to -> `packages/cli/dist/`
- **Why:** The TypeScript code written during development needs to be converted into plain JavaScript that can be run by Node.js. The `core` package is built first as the `cli` package depends on it.

**Stage 3: Publishing Standard Packages to NPM**

- **What happens:** The `npm publish` command is run for the `@google/gemini-cli-core` and `@google/gemini-cli` packages.
- **Why:** This publishes them as standard Node.js packages. Users installing via `npm install -g @google/gemini-cli` will download these packages, and `npm` will handle installing the `@google/gemini-cli-core` dependency automatically. The code in these packages is not bundled into a single file.

**Stage 4: Assembling and Creating the GitHub Release Asset**

This stage happens _after_ the NPM publish and creates the single-file executable that enables `npx` usage directly from the GitHub repository.

1.  **The JavaScript Bundle is Created:**
    - **What happens:** The built JavaScript from both `packages/core/dist` and `packages/cli/dist`, along with all third-party JavaScript dependencies, are bundled by `esbuild` into a single, executable JavaScript file (e.g., `gemini.js`). The `node-pty` library is excluded from this bundle as it contains native binaries.
    - **Why:** This creates a single, optimized file that contains all the necessary application code. It simplifies execution for users who want to run the CLI without a full `npm install`, as all dependencies (including the `core` package) are included directly.

2.  **The `bundle` Directory is Assembled:**
    - **What happens:** A temporary `bundle` folder is created at the project root. The single `gemini.js` executable is placed inside it, along with other essential files.
    - **File movement:**
      - `gemini.js` (from esbuild) -> `bundle/gemini.js`
      - `README.md` -> `bundle/README.md`
      - `LICENSE` -> `bundle/LICENSE`
      - `packages/cli/src/utils/*.sb` (sandbox profiles) -> `bundle/`
    - **Why:** This creates a clean, self-contained directory with everything needed to run the CLI and understand its license and usage.

3.  **The GitHub Release is Created:**
    - **What happens:** The contents of the `bundle` directory, including the `gemini.js` executable, are attached as assets to a new GitHub Release.
    - **Why:** This makes the single-file version of the CLI available for direct download and enables the `npx https://github.com/google-gemini/gemini-cli` command, which downloads and runs this specific bundled asset.

**Summary of Artifacts**

- **NPM:** Publishes standard, un-bundled Node.js packages. The primary artifact is the code in `packages/cli/dist`, which depends on `@google/gemini-cli-core`.
- **GitHub Release:** Publishes a single, bundled `gemini.js` file that contains all dependencies, for easy execution via `npx`.

This dual-artifact process ensures that both traditional `npm` users and those who prefer the convenience of `npx` have an optimized experience.

## Notifications

Failing release workflows will automatically create an issue with the label
`release-failure`.

A notification will be posted to the maintainer's chat channel when issues with
this type are created.

### Modifying chat notifications

Notifications use [GitHub for Google Chat](https://workspace.google.com/marketplace/app/github_for_google_chat/536184076190). To modify the notifications, use `/github-settings` within the chat space.

> [!WARNING]
> The following instructions describe a fragile workaround that depends on the internal structure of the chat application's UI. It is likely to break with future updates.

The list of available labels is not currently populated correctly. If you want to add a label that does not appear alphabetically in the first 30 labels in the repo, you must use your browser's developer tools to manually modify the UI:

1. Open your browser's developer tools (e.g., Chrome DevTools).
2. In the `/github-settings` dialog, inspect the list of labels.
3. Locate one of the `<li>` elements representing a label.
4. In the HTML, modify the `data-option-value` attribute of that `<li>` element to the desired label name (e.g., `release-failure`).
5. Click on your modified label in the UI to select it, then save your settings.
