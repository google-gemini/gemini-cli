# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **gemini-copilot**, a fork of Google's Gemini CLI (https://github.com/google-gemini/gemini-cli) that integrates GitHub Copilot as the default LLM provider via VSCode's Language Model API.

## Setup Instructions

### Initial Fork Setup
1. Fork https://github.com/google-gemini/gemini-cli
2. Clone the forked repository
3. Update package.json name to `@your-org/gemini-copilot`
4. Update all "gemini" references to "gemini-copilot" in documentation

### Development Setup
```bash
# Clone the forked repository
git clone [your-fork-url] gemini-copilot
cd gemini-copilot

# Install dependencies
npm install

# Build the original project
npm run build

# Run tests to verify fork works
npm run test
```

## Key Commands

### From Original Gemini CLI
- `npm install` - Install dependencies
- `npm run build` - Build the project
- `npm run test` - Run test suite
- `npm run lint` - Run linter
- `npm run typecheck` - Run type checking

### VSCode Extension Development
```bash
# Navigate to VSCode bridge directory (after creating it)
cd packages/vscode-bridge
yo code  # Initialize VSCode extension
```

## Architecture Modifications

### Files to Modify in Forked Repository

1. **Provider Abstraction Layer** - Create new files:
   - `packages/core/src/providers/types.ts` - IModelProvider interface
   - `packages/core/src/providers/factory.ts` - Provider factory
   - `packages/core/src/providers/copilot-provider.ts` - Copilot implementation
   - `packages/core/src/providers/gemini-provider.ts` - Refactored Gemini code

2. **VSCode Bridge Extension** - New package:
   - `packages/vscode-bridge/` - VSCode extension directory
   - Bridge server runs on localhost:7337
   - Uses VSCode Language Model API

3. **CLI Configuration Updates**:
   - Modify default configuration to use Copilot
   - Add `--provider` flag support
   - Update authentication flow

### Key Integration Points

1. **Preserve Original Structure**: Work within the existing Gemini CLI monorepo structure
2. **Backward Compatibility**: Ensure all original Gemini functionality remains intact
3. **Provider Selection**: Allow runtime switching between Copilot and Gemini

## Legal Requirements

### Copyright Headers for Modified Files
```typescript
// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 [Your Organization]
// Licensed under Apache 2.0
```

### Required Documentation
- Keep original LICENSE file
- Add LEGAL.md with modifications list
- Update README.md with fork disclaimer
- Clear attribution to Google's original project

## Development Workflow

1. **Before Making Changes**:
   - Understand existing Gemini CLI architecture
   - Check which files import Gemini-specific code
   - Plan provider abstraction carefully

2. **When Adding Copilot Support**:
   - Don't break existing Gemini functionality
   - Test both providers after changes
   - Ensure graceful fallback behavior

3. **Testing Strategy**:
   - Run original test suite first
   - Add new tests for Copilot provider
   - Test provider switching
   - Verify VSCode bridge connectivity

## Important Files to Review

- `packages/cli/src/` - CLI entry points and commands
- `packages/core/src/` - Core functionality to abstract
- `package.json` - Root workspace configuration
- `.github/workflows/` - CI/CD pipeline to update

## Notes

- This is a fork that builds on top of existing Gemini CLI code
- Maintain compatibility with original project structure
- Focus on minimal changes to achieve Copilot integration
- Respect original code patterns and conventions