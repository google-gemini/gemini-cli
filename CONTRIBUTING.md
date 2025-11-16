# How to Contribute

We would love to accept your patches and contributions to this project. This
document includes:

- **[Before you begin](#before-you-begin):** Essential steps to take before
  becoming a Gemini CLI contributor.
- **[Code contribution process](#code-contribution-process):** How to contribute
  code to Gemini CLI.
- **[Development setup and workflow](#development-setup-and-workflow):** How to
  set up your development environment and workflow.
- **[Documentation contribution process](#documentation-contribution-process):**
  How to contribute documentation to Gemini CLI.

We're looking forward to seeing your contributions!

## Before you begin

### Sign our Contributor License Agreement

Contributions to this project must be accompanied by a
[Contributor License Agreement](https://cla.developers.google.com/about) (CLA).
You (or your employer) retain the copyright to your contribution; this simply
gives us permission to use and redistribute your contributions as part of the
project.

If you or your current employer have already signed the Google CLA (even if it
was for a different project), you probably don't need to do it again.

Visit <https://cla.developers.google.com/> to see your current agreements or to
sign a new one.

### Review our Community Guidelines

This project follows
[Google's Open Source Community Guidelines](https://opensource.google/conduct/).

### Review our Code of Conduct

This project has a [Code of Conduct](./.github/CODE_OF_CONDUCT.md) that all
contributors are expected to follow. Please review it before contributing.

> [!NOTE] **For project maintainers:** Please update the
> `[INSERT CONTACT METHOD]` placeholder in the
> [Code of Conduct](./.github/CODE_OF_CONDUCT.md) with a private contact method
> for reporting violations.

## Code contribution process

### Get started

The process for contributing code is as follows:

1.  **Find an issue** that you want to work on.
2.  **Fork the repository** and create a new branch.
3.  **Make your changes** in the `packages/` directory.
4.  **Ensure all checks pass** by running `npm run preflight`.
5.  **Open a pull request** with your changes.

### Code reviews

All submissions, including submissions by project members, require review. We
use [GitHub pull requests](https://docs.github.com/articles/about-pull-requests)
for this purpose.

If your pull request involves changes to `packages/cli` (the frontend), we
recommend running our automated frontend review tool. **Note: This tool is
currently experimental.** It helps detect common React anti-patterns, testing
issues, and other frontend-specific best practices that are easy to miss.

To run the review tool, enter the following command from within Gemini CLI:

```text
/review-frontend <PR_NUMBER>
```

Replace `<PR_NUMBER>` with your pull request number. Authors are encouraged to
run this on their own PRs for self-review, and reviewers should use it to
augment their manual review process.

### Self assigning issues

If you're looking for an issue to work on, check out our list of issues that are
labeled
["help wanted"](https://github.com/google-gemini/gemini-cli/issues?q=is%3Aissue+state%3Aopen+label%3A%22help+wanted%22).

To assign an issue to yourself, simply add a comment with the text `/assign`.
The comment must contain only that text and nothing else. This command will
assign the issue to you, provided it is not already assigned.

Please note that you can have a maximum of 3 issues assigned to you at any given
time.

### Pull request guidelines

To help us review and merge your PRs quickly, please follow these guidelines.
PRs that do not meet these standards may be closed.

#### 1. Link to an existing issue

All PRs should be linked to an existing issue in our tracker. This ensures that
every change has been discussed and is aligned with the project's goals before
any code is written.

- **For bug fixes:** The PR should be linked to the bug report issue.
- **For features:** The PR should be linked to the feature request or proposal
  issue that has been approved by a maintainer.

If an issue for your change doesn't exist, please **open one first** and wait
for feedback before you start coding.

#### 2. Keep it small and focused

We favor small, atomic PRs that address a single issue or add a single,
self-contained feature.

- **Do:** Create a PR that fixes one specific bug or adds one specific feature.
- **Don't:** Bundle multiple unrelated changes (e.g., a bug fix, a new feature,
  and a refactor) into a single PR.

Large changes should be broken down into a series of smaller, logical PRs that
can be reviewed and merged independently.

#### 3. Use draft PRs for work in progress

If you'd like to get early feedback on your work, please use GitHub's **Draft
Pull Request** feature. This signals to the maintainers that the PR is not yet
ready for a formal review but is open for discussion and initial feedback.

#### 4. Ensure all checks pass

Before submitting your PR, ensure that all automated checks are passing by
running `npm run preflight`. This command runs all tests, linting, and other
style checks.

#### 5. Update documentation

If your PR introduces a user-facing change (e.g., a new command, a modified
flag, or a change in behavior), you must also update the relevant documentation
in the `/docs` directory.

See more about writing documentation:
[Documentation contribution process](#documentation-contribution-process).

#### 6. Write clear commit messages and a good PR description

Your PR should have a clear, descriptive title and a detailed description of the
changes. Follow the [Conventional Commits](https://www.conventionalcommits.org/)
standard for your commit messages.

- **Good PR title:** `feat(cli): Add --json flag to 'config get' command`
- **Bad PR title:** `Made some changes`

In the PR description, explain the "why" behind your changes and link to the
relevant issue (e.g., `Fixes #123`).

### Forking

If you are forking the repository you will be able to run the Build, Test and
Integration test workflows. However in order to make the integration tests run
you'll need to add a
[GitHub Repository Secret](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions#creating-secrets-for-a-repository)
with a value of `GEMINI_API_KEY` and set that to a valid API key that you have
available. Your key and secret are private to your repo; no one without access
can see your key and you cannot see any secrets related to this repo.

Additionally you will need to click on the `Actions` tab and enable workflows
for your repository, you'll find it's the large blue button in the center of the
screen.

### Development setup and workflow

This section guides contributors on how to build, modify, and understand the
development setup of this project.

### Setting up the development environment

**Prerequisites:**

1.  **Node.js**:
    - **Development:** Please use Node.js `~20.19.0`. This specific version is
      required due to an upstream development dependency issue. You can use a
      tool like [nvm](https://github.com/nvm-sh/nvm) to manage Node.js versions.
    - **Production:** For running the CLI in a production environment, any
      version of Node.js `>=20` is acceptable.
2.  **Git**

### Build process

To clone the repository:

```bash
git clone https://github.com/google-gemini/gemini-cli.git # Or your fork's URL
cd gemini-cli
```

To install dependencies defined in `package.json` as well as root dependencies:

```bash
npm install
```

To build the entire project (all packages):

```bash
npm run build
```

This command typically compiles TypeScript to JavaScript, bundles assets, and
prepares the packages for execution. Refer to `scripts/build.js` and
`package.json` scripts for more details on what happens during the build.

### Enabling sandboxing

[Sandboxing](#sandboxing) is highly recommended and requires, at a minimum,
setting `GEMINI_SANDBOX=true` in your `~/.env` and ensuring a sandboxing
provider (e.g. `macOS Seatbelt`, `docker`, or `podman`) is available. See
[Sandboxing](#sandboxing) for details.

To build both the `gemini` CLI utility and the sandbox container, run
`build:all` from the root directory:

```bash
npm run build:all
```

To skip building the sandbox container, you can use `npm run build` instead.

### Running the CLI

To start the Gemini CLI from the source code (after building), run the following
command from the root directory:

```bash
npm start
```

If you'd like to run the source build outside of the gemini-cli folder, you can
utilize `npm link path/to/gemini-cli/packages/cli` (see:
[docs](https://docs.npmjs.com/cli/v9/commands/npm-link)) or
`alias gemini="node path/to/gemini-cli/packages/cli"` to run with `gemini`

### Running tests

This project contains two types of tests: unit tests and integration tests.

#### Unit tests

To execute the unit test suite for the project:

```bash
npm run test
```

This will run tests located in the `packages/core` and `packages/cli`
directories. Ensure tests pass before submitting any changes. For a more
comprehensive check, it is recommended to run `npm run preflight`.

#### Integration tests

The integration tests are designed to validate the end-to-end functionality of
the Gemini CLI. They are not run as part of the default `npm run test` command.

To run the integration tests, use the following command:

```bash
npm run test:e2e
```

For more detailed information on the integration testing framework, please see
the [Integration Tests documentation](/docs/integration-tests.md).

### Linting and preflight checks

To ensure code quality and formatting consistency, run the preflight check:

```bash
npm run preflight
```

This command will run ESLint, Prettier, all tests, and other checks as defined
in the project's `package.json`.

_ProTip_

after cloning create a git precommit hook file to ensure your commits are always
clean.

```bash
echo "
# Run npm build and check for errors
if ! npm run preflight; then
  echo "npm build failed. Commit aborted."
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### Formatting

To separately format the code in this project by running the following command
from the root directory:

```bash
npm run format
```

This command uses Prettier to format the code according to the project's style
guidelines.

#### Linting

To separately lint the code in this project, run the following command from the
root directory:

```bash
npm run lint
```

### Coding conventions

- Please adhere to the coding style, patterns, and conventions used throughout
  the existing codebase.
- Consult
  [GEMINI.md](https://github.com/google-gemini/gemini-cli/blob/main/GEMINI.md)
  (typically found in the project root) for specific instructions related to
  AI-assisted development, including conventions for React, comments, and Git
  usage.
- **Imports:** Pay special attention to import paths. The project uses ESLint to
  enforce restrictions on relative imports between packages.

### Project structure

- `packages/`: Contains the individual sub-packages of the project.
  - `a2a-server`: A2A server implementation for the Gemini CLI. (Experimental)
  - `cli/`: The command-line interface.
  - `core/`: The core backend logic for the Gemini CLI.
  - `test-utils` Utilities for creating and cleaning temporary file systems for
    testing.
  - `vscode-ide-companion/`: The Gemini CLI Companion extension pairs with
    Gemini CLI.
- `docs/`: Contains all project documentation.
- `scripts/`: Utility scripts for building, testing, and development tasks.

For more detailed architecture, see `docs/architecture.md`.

### Debugging

#### VS Code

0.  Run the CLI to interactively debug in VS Code with `F5`
1.  Start the CLI in debug mode from the root directory:
    ```bash
    npm run debug
    ```
    This command runs `node --inspect-brk dist/gemini.js` within the
    `packages/cli` directory, pausing execution until a debugger attaches. You
    can then open `chrome://inspect` in your Chrome browser to connect to the
    debugger.
2.  In VS Code, use the "Attach" launch configuration (found in
    `.vscode/launch.json`).

Alternatively, you can use the "Launch Program" configuration in VS Code if you
prefer to launch the currently open file directly, but 'F5' is generally
recommended.

To hit a breakpoint inside the sandbox container run:

```bash
DEBUG=1 gemini
```

**Note:** If you have `DEBUG=true` in a project's `.env` file, it won't affect
gemini-cli due to automatic exclusion. Use `.gemini/.env` files for gemini-cli
specific debug settings.

### React DevTools

To debug the CLI's React-based UI, you can use React DevTools. Ink, the library
used for the CLI's interface, is compatible with React DevTools version 4.x.

1.  **Start the Gemini CLI in development mode:**

    ```bash
    DEV=true npm start
    ```

2.  **Install and run React DevTools version 4.28.5 (or the latest compatible
    4.x version):**

    You can either install it globally:

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    Or run it directly using npx:

    ```bash
    npx react-devtools@4.28.5
    ```

    Your running CLI application should then connect to React DevTools.
    ![](/docs/assets/connected_devtools.png)

### Sandboxing

#### macOS Seatbelt

On macOS, `gemini` uses Seatbelt (`sandbox-exec`) under a `permissive-open`
profile (see `packages/cli/src/utils/sandbox-macos-permissive-open.sb`) that
restricts writes to the project folder but otherwise allows all other operations
and outbound network traffic ("open") by default. You can switch to a
`restrictive-closed` profile (see
`packages/cli/src/utils/sandbox-macos-restrictive-closed.sb`) that declines all
operations and outbound network traffic ("closed") by default by setting
`SEATBELT_PROFILE=restrictive-closed` in your environment or `.env` file.
Available built-in profiles are `{permissive,restrictive}-{open,closed,proxied}`
(see below for proxied networking). You can also switch to a custom profile
`SEATBELT_PROFILE=<profile>` if you also create a file
`.gemini/sandbox-macos-<profile>.sb` under your project settings directory
`.gemini`.

#### Container-based sandboxing (all platforms)

For stronger container-based sandboxing on macOS or other platforms, you can set
`GEMINI_SANDBOX=true|docker|podman|<command>` in your environment or `.env`
file. The specified command (or if `true` then either `docker` or `podman`) must
be installed on the host machine. Once enabled, `npm run build:all` will build a
minimal container ("sandbox") image and `npm start` will launch inside a fresh
instance of that container. The first build can take 20-30s (mostly due to
downloading of the base image) but after that both build and start overhead
should be minimal. Default builds (`npm run build`) will not rebuild the
sandbox.

Container-based sandboxing mounts the project directory (and system temp
directory) with read-write access and is started/stopped/removed automatically
as you start/stop Gemini CLI. Files created within the sandbox should be
automatically mapped to your user/group on host machine. You can easily specify
additional mounts, ports, or environment variables by setting
`SANDBOX_{MOUNTS,PORTS,ENV}` as needed. You can also fully customize the sandbox
for your projects by creating the files `.gemini/sandbox.Dockerfile` and/or
`.gemini/sandbox.bashrc` under your project settings directory (`.gemini`) and
running `gemini` with `BUILD_SANDBOX=1` to trigger building of your custom
sandbox.

#### Proxied networking

All sandboxing methods, including macOS Seatbelt using `*-proxied` profiles,
support restricting outbound network traffic through a custom proxy server that
can be specified as `GEMINI_SANDBOX_PROXY_COMMAND=<command>`, where `<command>`
must start a proxy server that listens on `:::8877` for relevant requests. See
`docs/examples/proxy-script.md` for a minimal proxy that only allows `HTTPS`
connections to `example.com:443` (e.g. `curl https://example.com`) and declines
all other requests. The proxy is started and stopped automatically alongside the
sandbox.

### Manual publish

We publish an artifact for each commit to our internal registry. But if you need
to manually cut a local build, then run the following commands:

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```

## Documentation contribution process

Our documentation must be kept up-to-date with our code contributions. We want
our documentation to be clear, concise, and helpful to our users. We value:

- **Clarity:** Use simple and direct language. Avoid jargon where possible.
- **Accuracy:** Ensure all information is correct and up-to-date.
- **Completeness:** Cover all aspects of a feature or topic.
- **Examples:** Provide practical examples to help users understand how to use
  Gemini CLI.

### Getting started

The process for contributing to the documentation is similar to contributing
code.

1. **Fork the repository** and create a new branch.
2. **Make your changes** in the `/docs` directory.
3. **Preview your changes locally** in Markdown rendering.
4. **Lint and format your changes.** Our preflight check includes linting and
   formatting for documentation files.
   ```bash
   npm run preflight
   ```
5. **Open a pull request** with your changes.

### Documentation structure

Our documentation is organized using [sidebar.json](/docs/sidebar.json) as the
table of contents. When adding new documentation:

1. Create your markdown file **in the appropriate directory** under `/docs`.
2. Add an entry to `sidebar.json` in the relevant section.
3. Ensure all internal links use relative paths and point to existing files.

### Style guide

We follow the
[Google Developer Documentation Style Guide](https://developers.google.com/style).
Please refer to it for guidance on writing style, tone, and formatting.

#### Key style points

- Use sentence case for headings.
- Write in second person ("you") when addressing the reader.
- Use present tense.
- Keep paragraphs short and focused.
- Use code blocks with appropriate language tags for syntax highlighting.
- Include practical examples whenever possible.

### Linting and formatting

We use `prettier` to enforce a consistent style across our documentation. The
`npm run preflight` command will check for any linting issues.

You can also run the linter and formatter separately:

- `npm run lint` - Check for linting issues
- `npm run format` - Auto-format markdown files
- `npm run lint:fix` - Auto-fix linting issues where possible

Please make sure your contributions are free of linting errors before submitting
a pull request.

### Before you submit

Before submitting your documentation pull request, please:

1. Run `npm run preflight` to ensure all checks pass.
2. Review your changes for clarity and accuracy.
3. Check that all links work correctly.
4. Ensure any code examples are tested and functional.
5. Sign the
   [Contributor License Agreement (CLA)](https://cla.developers.google.com/) if
   you haven't already.

### Need help?

If you have questions about contributing documentation:

- Check our [FAQ](/docs/faq.md).
- Review existing documentation for examples.
- Open [an issue](https://github.com/google-gemini/gemini-cli/issues) to discuss
  your proposed changes.
- Reach out to the maintainers.

We appreciate your contributions to making Gemini CLI documentation better!
