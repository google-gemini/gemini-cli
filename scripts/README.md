# Scripts Organization

This directory contains all build, deployment, and utility scripts for the Gemini CLI project, organized by purpose.

## Directory Structure

```
scripts/
├── build/        # Build and compilation scripts
├── deploy/       # Deployment and publishing scripts
├── dev/          # Development and debugging scripts
├── telemetry/    # Telemetry and monitoring scripts
└── utils/        # Utility and helper scripts
```

## Script Categories

### Build Scripts (`scripts/build/`)

Scripts responsible for building and compiling the project:

- **`build.js`** - Main build script that orchestrates the entire build process
- **`build_package.js`** - Builds individual packages (used by workspaces)
- **`build_sandbox.js`** - Builds the sandbox container for security
- **`copy_bundle_assets.js`** - Copies assets to the bundle directory
- **`copy_files.js`** - Generic file copying utility
- **`esbuild-banner.js`** - Adds license banners to built files

**Usage:**

```bash
npm run build              # Full build
npm run build:sandbox      # Build with sandbox
npm run build:packages     # Build individual packages
```

### Deployment Scripts (`scripts/deploy/`)

Scripts for publishing and releasing the project:

- **`publish-sandbox.js`** - Publishes the sandbox container
- **`prepare-cli-packagejson.js`** - Prepares package.json for CLI distribution

**Usage:**

```bash
npm run publish:sandbox    # Publish sandbox container
npm run publish:release    # Full release process
```

### Development Scripts (`scripts/dev/`)

Scripts for development workflow and debugging:

- **`start.js`** - Starts the development server
- **`setup-dev.js`** - Sets up the development environment
- **`check-build-status.js`** - Checks if build is up to date
- **`clean.js`** - Cleans build artifacts

**Usage:**

```bash
npm start                  # Start development server
npm run debug             # Start with debugging enabled
npm run clean             # Clean build artifacts
```

### Telemetry Scripts (`scripts/telemetry/`)

Scripts for monitoring and telemetry:

- **`telemetry.js`** - Main telemetry orchestrator
- **`telemetry_gcp.js`** - Google Cloud Platform telemetry
- **`local_telemetry.js`** - Local telemetry collection
- **`telemetry_utils.js`** - Telemetry utilities

**Usage:**

```bash
npm run telemetry         # Run telemetry collection
npm run start:gcp         # Start with GCP telemetry
```

### Utility Scripts (`scripts/utils/`)

General utility and helper scripts:

- **`generate-git-commit-info.js`** - Generates git commit information
- **`bind_package_dependencies.js`** - Binds package dependencies
- **`bind_package_version.js`** - Binds package versions
- **`sandbox.js`** - Sandbox management utilities
- **`sandbox_command.js`** - Sandbox command execution
- **`example-proxy.js`** - Example proxy server
- **`create_alias.sh`** - Creates shell aliases

**Usage:**

```bash
npm run generate          # Generate git commit info
npm run prerelease:dev    # Prepare for development release
```

## Script Dependencies

Some scripts reference other scripts. The paths have been updated to reflect the new organization:

- `build.js` → `scripts/utils/sandbox_command.js`
- `start.js` → `scripts/dev/check-build-status.js` and `scripts/utils/sandbox_command.js`
- `telemetry.js` → `scripts/telemetry/telemetry_gcp.js` or `scripts/telemetry/local_telemetry.js`

## Adding New Scripts

When adding new scripts, place them in the appropriate category:

1. **Build-related**: `scripts/build/`
2. **Deployment-related**: `scripts/deploy/`
3. **Development-related**: `scripts/dev/`
4. **Telemetry-related**: `scripts/telemetry/`
5. **General utilities**: `scripts/utils/`

## Migration Notes

This organization was migrated from a flat structure where all scripts were in the root `scripts/` directory. The new structure provides:

- **Better organization**: Scripts are grouped by purpose
- **Easier navigation**: Developers can quickly find relevant scripts
- **Clearer dependencies**: Related scripts are co-located
- **Improved maintainability**: Easier to understand and modify scripts
- **Scalability**: Easy to add new script categories as needed
