# Git Hooks Configuration

This directory contains Git hooks that automatically run code quality checks before commits and pushes.

## Available Hooks

### 🔍 pre-commit

Runs before each commit to ensure code quality:

- **Format**: Automatically formats staged files with Prettier
- **Lint**: Fixes ESLint issues and enforces zero warnings
- **TypeScript**: Type checks TypeScript files (only if .ts/.tsx files are staged)
- **Tests**: Runs tests (only if non-documentation files are changed)

### 🚀 pre-push

Runs before pushing to remote repository:

- **Preflight**: Runs the complete preflight check (clean, install, format, lint, build, typecheck, test)

### 📝 commit-msg

Validates commit messages:

- **Length**: Ensures minimum 10 characters
- **Format**: Suggests conventional commit format (optional)

## Manual Commands

You can run these checks manually at any time:

```bash
# Run pre-commit checks on staged files
npm run pre-commit

# Check formatting without fixing
npm run format:check

# Run all validation checks
npm run validate

# Run complete preflight check
npm run preflight

# Test lint-staged configuration
npx lint-staged
```

## Configuration

### lint-staged (package.json)

- **TypeScript files**: Format → Lint → Type check
- **JavaScript files**: Format → Lint
- **Documentation files**: Format only
- **Package files**: Format only

### ESLint Configuration

- Zero warnings policy in pre-commit hooks
- Automatic fixing where possible
- Workspace-aware for monorepo structure

### Prettier Configuration

- Consistent code formatting
- Applied to all supported file types
- Respects .prettierrc.json settings

## Bypassing Hooks

⚠️ **Use sparingly and only when necessary:**

```bash
# Skip pre-commit hooks
git commit --no-verify -m "commit message"

# Skip pre-push hooks
git push --no-verify
```

## Troubleshooting

### Hook not executing

```bash
# Ensure hooks are executable
chmod +x .husky/*

# Reinstall hooks
npm run prepare
```

### Lint-staged issues

```bash
# Test configuration
npx lint-staged --allow-empty

# Debug mode
npx lint-staged --verbose
```

### TypeScript errors

```bash
# Run type checking manually
npm run typecheck

# Type check specific workspace
npm run typecheck --workspace packages/core
```

## Benefits

✅ **Consistent Code Quality**: Automated formatting and linting  
✅ **Early Error Detection**: Catch issues before they reach the repository  
✅ **Zero Configuration**: Works out of the box for all team members  
✅ **Fast Execution**: Only processes staged files and relevant checks  
✅ **Monorepo Aware**: Respects workspace structure and configurations
