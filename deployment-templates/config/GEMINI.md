# Project Context for Gemini CLI + Claude Code

This file provides context to Gemini CLI and Claude Code when working in this
repository. Edit this file to customize AI behavior for your project.

## Project Overview

<!-- Replace with your project description -->

**Project Name**: [Your Project Name] **Primary Language**: [e.g., TypeScript,
Python, Go] **Framework**: [e.g., React, Django, Express] **Purpose**: [Brief
description of what this project does]

## Architecture

<!-- Describe your project's architecture -->

### High-Level Structure

```
project-root/
├── src/           # Source code
├── tests/         # Test files
├── docs/          # Documentation
└── config/        # Configuration files
```

### Key Components

- **Component 1**: [Description and location]
- **Component 2**: [Description and location]
- **Component 3**: [Description and location]

### Tech Stack

- **Frontend**: [Technologies used]
- **Backend**: [Technologies used]
- **Database**: [Database type and ORM]
- **Infrastructure**: [Cloud provider, containers, etc.]

## Development Workflow

### Setup & Installation

```bash
# Clone and install
git clone [repo-url]
cd [project-name]
npm install  # or pip install -r requirements.txt, etc.
```

### Common Commands

```bash
# Development
npm start              # Start dev server
npm run dev            # Development mode

# Testing
npm test               # Run tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report

# Building
npm run build          # Production build
npm run lint           # Lint code
npm run format         # Format code

# Deployment
npm run deploy         # Deploy to production
```

### Branch Strategy

- `main` - Production-ready code
- `develop` - Integration branch
- `feature/*` - New features
- `fix/*` - Bug fixes
- `hotfix/*` - Urgent fixes

## Code Standards

### Language-Specific Guidelines

#### JavaScript/TypeScript

- Use functional components with hooks (React)
- Prefer `const` over `let`, avoid `var`
- Use TypeScript interfaces over types when possible
- Async/await over promises for readability
- Use destructuring for props and parameters

#### Python

- Follow PEP 8 style guide
- Use type hints for all function signatures
- Prefer comprehensions over loops when clear
- Use dataclasses for data structures
- Document with docstrings

#### Go

- Follow Go idioms and conventions
- Use `gofmt` for formatting
- Handle errors explicitly, don't ignore
- Prefer composition over inheritance
- Write table-driven tests

### General Principles

1. **DRY (Don't Repeat Yourself)**: Extract common patterns
2. **SOLID Principles**: Follow object-oriented design principles
3. **Clean Code**: Self-documenting code with meaningful names
4. **Small Functions**: Each function does one thing well
5. **Error Handling**: Always handle errors gracefully

### Testing Requirements

- Write tests for all new features
- Maintain > 80% code coverage
- Include unit tests for business logic
- Add integration tests for APIs
- Test edge cases and error conditions

### Documentation

- Comment complex logic and algorithms
- Document public APIs and interfaces
- Keep README up-to-date
- Add inline docs for exported functions
- Update changelog for notable changes

## Security Guidelines

- ✅ **DO**: Validate all user inputs
- ✅ **DO**: Use parameterized queries (prevent SQL injection)
- ✅ **DO**: Implement proper authentication/authorization
- ✅ **DO**: Keep dependencies up-to-date
- ✅ **DO**: Store secrets in environment variables
- ❌ **DON'T**: Commit credentials or API keys
- ❌ **DON'T**: Trust user input without validation
- ❌ **DON'T**: Use deprecated or insecure libraries
- ❌ **DON'T**: Expose sensitive data in logs

## Common Patterns

### File Naming

```
ComponentName.tsx      # React components (PascalCase)
componentName.test.tsx # Test files
utils/helperFunctions.ts # Utilities (camelCase)
types/UserTypes.ts     # Type definitions
```

### Code Organization

```typescript
// Imports (grouped by: external, internal, types)
import React from 'react';
import { useEffect, useState } from 'react';

import { fetchUser } from './api/users';
import { formatDate } from './utils/date';

import type { User } from './types/User';

// Types/Interfaces
interface Props {
  userId: string;
}

// Component/Function
export function UserProfile({ userId }: Props) {
  // Hooks
  const [user, setUser] = useState<User | null>(null);

  // Effects
  useEffect(() => {
    loadUser();
  }, [userId]);

  // Functions
  async function loadUser() {
    const data = await fetchUser(userId);
    setUser(data);
  }

  // Render/Return
  return <div>{user?.name}</div>;
}
```

## Project-Specific Context

### Domain Knowledge

<!-- Add domain-specific information -->

- **Key Concepts**: [Important concepts in your domain]
- **Business Logic**: [Critical business rules]
- **Constraints**: [Technical or business constraints]

### Known Issues

<!-- List any known issues or quirks -->

- [Issue 1]: [Workaround or status]
- [Issue 2]: [Workaround or status]

### Dependencies

<!-- Important dependencies and why they're used -->

- **[Library Name]**: [Why we use it]
- **[Framework Name]**: [Why we use it]

### Performance Considerations

- [Key performance metric]: [Target or guideline]
- [Optimization technique]: [When and how to apply]

## Working with AI Assistants

### For Code Reviews

When reviewing code, focus on:

1. Security vulnerabilities
2. Performance issues
3. Adherence to project standards
4. Test coverage
5. Documentation completeness

### For Implementations

When implementing features:

1. Read this GEMINI.md file first
2. Follow the code standards above
3. Write tests alongside code
4. Update documentation
5. Consider edge cases

### For Debugging

When investigating bugs:

1. Check recent changes (git log)
2. Review related tests
3. Search for similar issues
4. Test reproduction steps
5. Verify the fix doesn't break other functionality

## Useful Resources

### Documentation

- [Project Wiki](link-to-wiki)
- [API Documentation](link-to-api-docs)
- [Architecture Diagrams](link-to-diagrams)

### Tools

- **Linter**: [ESLint, Pylint, etc.]
- **Formatter**: [Prettier, Black, gofmt]
- **CI/CD**: [GitHub Actions, Jenkins, etc.]
- **Monitoring**: [Sentry, DataDog, etc.]

### External References

- [Framework Docs](link)
- [Library Docs](link)
- [Best Practices Guide](link)

---

## Metadata

**Last Updated**: [Date] **Maintained By**: [Team/Person] **Review Cycle**:
[Quarterly/Monthly]

---

_This file is automatically loaded by Gemini CLI when working in this
repository. Keep it up-to-date for best results!_
