# Gemini CLI Releases

## Release Cadence and Tags

We will follow https://semver.org/ as closely as possible but will call out when or if we have to deviate from it. Our weekly releases will be minor version increments and any bug or hotfixes btween releases will go out as patch versions on the most recent release.

### Preview

New preview releases will be published each week at UTC 2359 on Tuesdays. These releases will not have been fully vetted and may contain regressions or other outstanding issues. Please help us test and install with `preview` tag.

```bash
npm install -g @google/gemini-cli@preview
```

### Stable

- New stable releases will be published each week at UTC 2000 on Tuesdays, this will be the full promotion of last week's release + any bug fixes and validations. Use `latest` tag.

```bash
npm install -g @google/gemini-cli@latest
```

### Nightly

- New releases will be published each week at UTC 0000 each day, This will be all changes from the main branch as represted at time of release. It should be assumed there are pending validations and issues. Use `nightly` tag.

```bash
npm install -g @google/gemini-cli@nightly
```

# Release Process.

Where `x.y.z` is the next version to be released. In most all cases for the weekly release this will be an increment on `y`, aka minor version update. Major version updates `x` will need broader coordination and communication. For patches `z` see below. When possible we will do our best to adher to https://semver.org/

Our release cadence is new releases are sent to a preview channel for a week and then promoted to stable after a week. Version numbers will follow SemVer with weekly releases incrementing the minor version. Patches and bug fixes to both preview and stable releases will increment the patch version.

## Nightly Release

Each night at UTC 0000 we will auto deploy a nightly release from `main`. This will be a version of the next production release, x.y.z, with the nightly tag.

## Create Preview Release

Each Tuesday at UTC 2359 we will auto deploy a preview release of the next production release x.y.z.

- This will happen as a scheduled instance of the ‘release’ action. It will be cut off of Main.
- This will create a branch `release/x.y.z-preview.n`
- We will run evals and smoke testing against this branch and the npm package. For now this should be manual smoke testing, we don't have a dedicated matrix or specific detailed process. There is work coming soon to make this more formalized and automatic see https://github.com/google-gemini/gemini-cli/issues/3788
- Users installing `@preview` will get this release as well

## Promote Stable Release

After one week (On the following Tuesday) with all signals a go, we will manually release at 2000 UTC via the current on-call person.

- The release action will be used with the source branch as `release/x.y.z-preview.n`
- The version will be x.y.z
- The releaser will create and merge a pr into main with the version changes.
- Smoke tests and manual validation will be run. For now this should be manual smoke testing, we don't have a dedicated matrix or specific detailed process. There is work coming soon to make this more formalized and automatic see https://github.com/google-gemini/gemini-cli/issues/3788

## Patching releases

If a bug or feature fix is found and needed before the next weekly release is out.

- Create a new branch from the appropriate source
  - For a patch release of a preview, start with the release/x.y.z-preview.n branch and create a new branch off of that.
  - For a patch release of an existing version, we'll utilize the git TAG that is automatically created with each release to ensure we pull the exact commit. The format is `v.x.y.z`. Run `git checkout vx.x.x -b &lt;hotfix branch name ideally an issue number>` to pull the tag and create a branch local.
- Verify the issue, then fix the issue, push your changes
- Do a release per the instructions above, using your branch as the base and incrementing the patch version as appropriate.
- After the release merge back to main
  - For a stable release merge via PR the `release/x.y.z` branch back to main to keep version number current.
  - For a preview relase, merge the `relase/x.y.z-preview.n` branch back to the `release/x.y.z-preview.n` branch to make the preview version number current. Then also cherry pick your feature commit back to main.

## Release Schedule

<table>
  <tr>
   <td>Date
   </td>
   <td>Stable UTC 2000
   </td>
   <td>Preview UTC 2359
   </td>
  </tr>
  <tr>
   <td>Aug 19th, 2025
   </td>
   <td>N/A
   </td>
   <td>0.2.0-preview.0
   </td>
  </tr>
  <tr>
   <td>Aug 26th, 2025
   </td>
   <td>0.2.0
   </td>
   <td>0.3.0-preview.0
   </td>
  </tr>
  <tr>
   <td>Sep 2nd, 2025
   </td>
   <td>0.3.0
   </td>
   <td>0.4.0-preview.0
   </td>
  </tr>
  <tr>
   <td>Sep 9th, 2025
   </td>
   <td>0.4.0
   </td>
   <td>0.5.0-preview.0
   </td>
  </tr>
  <tr>
   <td>Sep 16th, 2025
   </td>
   <td>0.5.0
   </td>
   <td>0.6.0-preview.0
   </td>
  </tr>
  <tr>
   <td>Sep 23rd, 2025
   </td>
   <td>0.6.0
   </td>
   <td>0.7.0-preview.0
   </td>
  </tr>
</table>

## How To Release

Releases are managed through the [release.yml](https://github.com/google-gemini/gemini-cli/actions/workflows/release.yml) GitHub Actions workflow. To perform a manual release for a patch or hotfix:

1.  Navigate to the **Actions** tab of the repository.
2.  Select the **Release** workflow from the list.
3.  Click the **Run workflow** dropdown button.
4.  Fill in the required inputs:
    - **Version**: The exact version to release (e.g., `v0.2.1`).
    - **Ref**: The branch or commit SHA to release from (defaults to `main`).
    - **Dry Run**: Leave as `true` to test the workflow without publishing, or set to `false` to perform a live release.
5.  Click **Run workflow**.

### TLDR

Each release, wether automated or manual performs the following steps:

1.  Checks out the latest code from the `main` branch.
1.  Installs all dependencies.
1.  Runs the full suite of `preflight` checks and integration tests.
1.  If all tests succeed, it calculates the next version number based on the inputs.
1.  It creates a branch name `release/${VERSION}`.
1.  It creates a tag name `v${VERSION}`.
1.  It then builds and publishes the packages to npm with the provided version number.
1.  Finally, it creates a GitHub Release for the version.

### Failure Handling

If any step in the workflow fails, it will automatically create a new issue in the repository with the labels `bug` and `relase-failure`. The issue will contain a link to the failed workflow run for easy debugging.

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

1.  Go to the [Actions tab](https://github.com/google-gemini/gemini-cli/actions/workflows/release.yml) of the repository.
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

The main goal of the release process is to take the source code from the packages/ directory, build it, and assemble a
clean, self-contained package in a temporary `bundle` directory at the root of the project. This `bundle` directory is what
actually gets published to NPM.

Here are the key stages:

Stage 1: Pre-Release Sanity Checks and Versioning

- What happens: Before any files are moved, the process ensures the project is in a good state. This involves running tests,
  linting, and type-checking (npm run preflight). The version number in the root package.json and packages/cli/package.json
  is updated to the new release version.
- Why: This guarantees that only high-quality, working code is released. Versioning is the first step to signify a new
  release.

Stage 2: Building the Source Code

- What happens: The TypeScript source code in packages/core/src and packages/cli/src is compiled into JavaScript.
- File movement:
  - packages/core/src/\*_/_.ts -> compiled to -> packages/core/dist/
  - packages/cli/src/\*_/_.ts -> compiled to -> packages/cli/dist/
- Why: The TypeScript code written during development needs to be converted into plain JavaScript that can be run by
  Node.js. The core package is built first as the cli package depends on it.

Stage 3: Assembling the Final Publishable Package

This is the most critical stage where files are moved and transformed into their final state for publishing. A temporary
`bundle` folder is created at the project root to house the final package contents.

1.  The `package.json` is Transformed:
    - What happens: The package.json from packages/cli/ is read, modified, and written into the root `bundle`/ directory.
    - File movement: packages/cli/package.json -> (in-memory transformation) -> `bundle`/package.json
    - Why: The final package.json must be different from the one used in development. Key changes include:
      - Removing devDependencies.
      - Removing workspace-specific "dependencies": { "@gemini-cli/core": "workspace:\*" } and ensuring the core code is
        bundled directly into the final JavaScript file.
      - Ensuring the bin, main, and files fields point to the correct locations within the final package structure.

2.  The JavaScript Bundle is Created:
    - What happens: The built JavaScript from both packages/core/dist and packages/cli/dist are bundled into a single,
      executable JavaScript file.
    - File movement: packages/cli/dist/index.js + packages/core/dist/index.js -> (bundled by esbuild) -> `bundle`/gemini.js (or a
      similar name).
    - Why: This creates a single, optimized file that contains all the necessary application code. It simplifies the package
      by removing the need for the core package to be a separate dependency on NPM, as its code is now included directly.

3.  Static and Supporting Files are Copied:
    - What happens: Essential files that are not part of the source code but are required for the package to work correctly
      or be well-described are copied into the `bundle` directory.
    - File movement:
      - README.md -> `bundle`/README.md
      - LICENSE -> `bundle`/LICENSE
      - packages/cli/src/utils/\*.sb (sandbox profiles) -> `bundle`/
    - Why:
      - The README.md and LICENSE are standard files that should be included in any NPM package.
      - The sandbox profiles (.sb files) are critical runtime assets required for the CLI's sandboxing feature to
        function. They must be located next to the final executable.

Stage 4: Publishing to NPM

- What happens: The npm publish command is run from inside the root `bundle` directory.
- Why: By running npm publish from within the `bundle` directory, only the files we carefully assembled in Stage 3 are uploaded
  to the NPM registry. This prevents any source code, test files, or development configurations from being accidentally
  published, resulting in a clean and minimal package for users.

Summary of File Flow

```mermaid
graph TD
    subgraph "Source Files"
        A["packages/core/src/*.ts<br/>packages/cli/src/*.ts"]
        B["packages/cli/package.json"]
        C["README.md<br/>LICENSE<br/>packages/cli/src/utils/*.sb"]
    end

    subgraph "Process"
        D(Build)
        E(Transform)
        F(Assemble)
        G(Publish)
    end

    subgraph "Artifacts"
        H["Bundled JS"]
        I["Final package.json"]
        J["bundle/"]
    end

    subgraph "Destination"
        K["NPM Registry"]
    end

    A --> D --> H
    B --> E --> I
    C --> F
    H --> F
    I --> F
    F --> J
    J --> G --> K
```

This process ensures that the final published artifact is a purpose-built, clean, and efficient representation of the
project, rather than a direct copy of the development workspace.
