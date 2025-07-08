# Claude Code Project Memory

This document contains project-specific context and workflows for maintaining the custom gemini-code fork.

## Fork Maintenance Workflow

This is a custom fork of Google's gemini-cli with personal enhancements. The project uses a 2-branch strategy:

### Branch Structure

- **`main`** - Your stable custom version (default branch, what users see, contains custom changes)
- **`development`** - Your active development branch (also contains custom changes, used for testing upstream merges)

### Upstream Repository

- **Upstream**: `https://github.com/google-gemini/gemini-cli.git`

### Workflow for Upstream Updates (Example)

When Google's gemini-cli releases updates, follow this process:

```bash
# 1. Ensure upstream remote is configured
git remote add upstream https://github.com/google-gemini/gemini-cli.git

# 2. Fetch upstream changes
git fetch upstream

# 3. Update development branch with upstream changes
git checkout development
git merge upstream/main
# Resolve conflicts between upstream and your custom changes
# Test that everything works with: npm run build && npm run bundle

# 4. When stable, update main branch
git checkout main
git merge development
git push origin main

# 5. Tag and release new version
git tag v0.1.12-custom
git push origin v0.1.12-custom
```

### Custom Changes Overview

- Rebranded as "gemini-code" for development-focused use
- Improved tool schema validation
- Enhanced error messages
- Custom npm package: `@icarus603/gemini-code`

## CI/CD Strategy

### Recommended Approach: Hybrid Strategy

Keep automated npm publishing while simplifying testing to reduce maintenance overhead.

### What to Keep:

- **Automated npm publishing** - Enables `npm install -g @icarus603/gemini-code` workflow
- **Basic validation** - Linting, building, type checking to catch issues when merging upstream
- **Release workflow** - Handles automated npm publishing when tags are created

### What to Simplify:

- Remove complex integration tests that require API keys
- Remove Docker/sandbox testing (overkill for personal fork)
- Remove flaky E2E tests that don't add value for development workflow

### CI Workflow Goals:

1. Validate that upstream merges don't break custom changes
2. Automatically publish to npm when releases are tagged
3. Minimal maintenance overhead
4. Focus on development, not CI/CD complexity

## Release Process

### Publishing New Versions

When you want to release a new version (after merging upstream updates or adding features):

```bash
# 1. Ensure you're on main branch with latest changes
git checkout main
git pull origin main

# 2. Update version number if needed
npm version patch  # or minor/major

# 3. Build and test locally
npm run build && npm run bundle
node bundle/gemini.js --version

# 4. Create and push release tag
git tag vX.X.X-custom
git push origin vX.X.X-custom

# 5. Automated CI will handle npm publishing
```

### Manual npm Publishing (if automated CI is disabled)

```bash
# Build packages
npm run build:packages
npm run prepare:package

# Create bundle
npm run bundle

# Publish core package first
npm publish --workspace=@icarus603/gemini-code-core

# Update CLI to use latest core version
npm install @icarus603/gemini-code-core@latest --workspace=@icarus603/gemini-code --save-exact

# Publish CLI package
npm publish --workspace=@icarus603/gemini-code
```

## Development Workflow

### Local Development

- Use `npm start` for development
- Use `npm run build && npm run bundle` to test full build
- Test with `node bundle/gemini.js --version`

### Before Pushing Changes

- Run `npm run preflight` to validate all changes
- Test that the CLI still works locally
- Ensure no breaking changes to custom functionality
- **Remember to run npm run format locally every time before committing the changes.**

## Project Goals

This fork serves as:

1. **Personal development tool** - Enhanced gemini-cli for coding workflows
2. **Custom npm package** - Distributable via `npm install -g @icarus603/gemini-code`
3. **Upstream sync capability** - Easy to merge Google's updates while preserving customizations
4. **Simple maintenance** - Minimal CI/CD complexity, focus on development

## Key Files for Custom Changes

- `package.json` - Custom package name and version
- `README.md` - Custom documentation
- `packages/core/` - Core functionality enhancements
- `packages/cli/` - CLI interface customizations
- `.github/workflows/` - CI/CD configurations (keep minimal)
