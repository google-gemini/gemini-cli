/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GitState, ToolUsagePattern, FrameworkInfo, LanguageInfo, ProjectTypeInfo } from './workContextDetector.js';

/**
 * Gets a dynamic prompt template based on the detected project type
 */
export function getProjectTypePrompt(projectType: string): string {
  const templates: Record<string, string> = {
    'web-application': `
You're working on a web application. Consider:
- Modern web development practices and accessibility
- Component-based architecture and reusability
- Bundle size optimization and performance
- Cross-browser compatibility and responsive design
- SEO optimization and semantic HTML
- Progressive enhancement and graceful degradation`,

    'node-library': `
You're working on a Node.js library. Focus on:
- Clean, well-documented public APIs
- Semantic versioning and backward compatibility
- Comprehensive unit testing and CI/CD
- Performance optimization for various use cases
- Proper error handling and edge cases
- TypeScript support and type definitions`,

    'cli-tool': `
You're working on a CLI tool. Prioritize:
- Intuitive command-line interface design
- Comprehensive help documentation and examples
- Proper error messages and user feedback
- Cross-platform compatibility (Windows, macOS, Linux)
- Configuration file support and environment variables
- Progress indicators for long-running operations`,

    'python-package': `
You're working on a Python package. Consider:
- PEP 8 compliance and Pythonic code style
- Comprehensive docstrings and type hints
- Proper package structure and __init__.py files
- Unit testing with pytest and coverage reporting
- Virtual environment compatibility
- Distribution via PyPI with proper metadata`,

    'python-application': `
You're working on a Python application. Focus on:
- Clean architecture and separation of concerns
- Configuration management and environment variables
- Logging and error handling best practices
- Dependencies management with requirements.txt or Pipfile
- Command-line argument parsing and validation
- Database integration and data persistence patterns`,

    'rust-application': `
You're working on a Rust application. Emphasize:
- Memory safety and zero-cost abstractions
- Proper error handling with Result types
- Idiomatic Rust patterns and borrowing
- Comprehensive unit and integration testing
- Documentation with rustdoc comments
- Performance optimization and benchmarking`,

    'rust-library': `
You're working on a Rust library. Focus on:
- Clean, composable API design
- Comprehensive documentation and examples
- Zero-cost abstractions and generic programming
- Proper trait implementations and bounds
- Integration with the Rust ecosystem (Cargo, docs.rs)
- Backward compatibility and semantic versioning`,

    'go-application': `
You're working on a Go application. Consider:
- Idiomatic Go code and naming conventions
- Proper error handling and context usage
- Goroutines and channel patterns for concurrency
- Structured logging and metrics collection
- Graceful shutdown and signal handling
- Configuration and dependency injection patterns`,

    'go-library': `
You're working on a Go library. Prioritize:
- Simple, intuitive API design
- Comprehensive unit testing and benchmarks
- Proper documentation with godoc comments
- Context-aware operations and cancellation
- Interface-based design for testability
- Backward compatibility and module versioning`,

    'java-application': `
You're working on a Java application. Focus on:
- Object-oriented design principles and patterns
- Proper exception handling and resource management
- Unit testing with JUnit and integration testing
- Dependency injection and inversion of control
- Logging with SLF4J and structured configuration
- Performance optimization and memory management`,

    'documentation': `
You're working on documentation. Emphasize:
- Clear, concise writing with proper structure
- Code examples that are tested and up-to-date
- Accessibility and inclusive language
- Search engine optimization for discoverability
- Cross-references and navigation aids
- Version control for documentation changes`,

    'configuration': `
You're working on configuration files. Consider:
- Infrastructure as Code (IaC) best practices
- Security scanning and secret management
- Environment-specific configurations
- Validation and schema enforcement
- Documentation and inline comments
- Version control and change tracking`,
  };

  return templates[projectType] || `
You're working on a ${projectType} project. Apply general software development best practices:
- Clean, readable, and maintainable code
- Comprehensive testing and documentation
- Proper error handling and edge cases
- Security considerations and best practices
- Performance optimization where applicable
- Code review and collaboration standards`;
}

/**
 * Gets a dynamic prompt template based on the dominant programming language
 */
export function getLanguagePrompt(language: string): string {
  const templates: Record<string, string> = {
    'TypeScript': `
Language-specific TypeScript guidance:
- Leverage strong typing with interfaces and type guards
- Use generics for reusable, type-safe components
- Configure strict TypeScript settings in tsconfig.json
- Prefer composition over inheritance
- Use utility types (Partial, Pick, Omit) effectively
- Handle async operations with proper Promise typing`,

    'JavaScript': `
Language-specific JavaScript guidance:
- Use modern ES6+ features (arrow functions, destructuring, modules)
- Implement proper error handling with try-catch blocks
- Use const/let appropriately, avoid var
- Leverage array methods (map, filter, reduce) functionally
- Handle asynchronous operations with async/await
- Consider adding TypeScript for type safety`,

    'Python': `
Language-specific Python guidance:
- Follow PEP 8 style guide and use type hints
- Use list comprehensions and generator expressions
- Implement proper exception handling with specific exception types
- Use context managers (with statements) for resource management
- Leverage Python's standard library effectively
- Write docstrings following PEP 257 conventions`,

    'Rust': `
Language-specific Rust guidance:
- Embrace ownership and borrowing patterns
- Use Result<T, E> for error handling, avoid unwrap() in production
- Implement traits for shared behavior
- Use pattern matching with match expressions
- Leverage iterators and functional programming patterns
- Write comprehensive unit tests with #[cfg(test)]`,

    'Go': `
Language-specific Go guidance:
- Follow Go conventions for naming and code organization
- Use interfaces for abstraction and testability
- Handle errors explicitly, don't ignore them
- Use goroutines and channels for concurrent programming
- Keep functions small and focused
- Write table-driven tests for comprehensive coverage`,

    'Java': `
Language-specific Java guidance:
- Follow Java naming conventions and coding standards
- Use appropriate access modifiers (private, protected, public)
- Implement equals() and hashCode() consistently
- Use try-with-resources for automatic resource management
- Leverage Java 8+ features (streams, lambda expressions)
- Write comprehensive unit tests with JUnit`,

    'C++': `
Language-specific C++ guidance:
- Use RAII (Resource Acquisition Is Initialization) patterns
- Prefer smart pointers over raw pointers
- Use const correctness throughout your code
- Implement move semantics for performance
- Use standard library containers and algorithms
- Follow modern C++ practices (C++11/14/17/20)`,

    'C#': `
Language-specific C# guidance:
- Follow C# naming conventions and coding standards
- Use properties instead of getter/setter methods
- Implement IDisposable for resource cleanup
- Use LINQ for data querying and manipulation
- Handle null references with nullable reference types
- Write unit tests with xUnit or NUnit`,

    'PHP': `
Language-specific PHP guidance:
- Use PHP 8+ features (typed properties, union types)
- Follow PSR standards for code style and structure
- Use dependency injection and avoid global state
- Implement proper error handling with exceptions
- Use Composer for dependency management
- Write tests with PHPUnit`,

    'Ruby': `
Language-specific Ruby guidance:
- Follow Ruby conventions and idiomatic patterns
- Use blocks and iterators effectively
- Implement proper metaprogramming when needed
- Use symbols for immutable identifiers
- Write expressive, readable code with method chaining
- Test with RSpec or Minitest`,
  };

  return templates[language] || `
Language-specific ${language} guidance:
- Follow established conventions and best practices for ${language}
- Use appropriate design patterns and idioms
- Implement proper testing strategies
- Handle errors gracefully and appropriately
- Optimize for readability and maintainability
- Stay current with language evolution and features`;
}

/**
 * Gets a dynamic prompt template based on detected frameworks
 */
export function getFrameworkPrompt(framework: string): string {
  const templates: Record<string, string> = {
    'react': `
React-specific development guidance:
- Use functional components with hooks over class components
- Implement proper state management (useState, useReducer, context)
- Optimize performance with useMemo, useCallback, and React.memo
- Follow component composition patterns over inheritance
- Use proper key props for list rendering
- Implement error boundaries for production robustness`,

    'vue': `
Vue.js-specific development guidance:
- Use the Composition API for better TypeScript support
- Implement reactive data binding effectively
- Use computed properties for derived state
- Organize components with single-file components (SFC)
- Leverage Vue Router for navigation and Vuex/Pinia for state
- Follow Vue style guide and naming conventions`,

    'angular': `
Angular-specific development guidance:
- Use Angular CLI for project scaffolding and generation
- Implement dependency injection and services properly
- Use RxJS observables for async operations
- Follow Angular style guide and component architecture
- Implement lazy loading for performance optimization
- Use Angular testing utilities for unit and integration tests`,

    'next.js': `
Next.js-specific development guidance:
- Leverage static generation (SSG) and server-side rendering (SSR)
- Use Next.js routing and dynamic imports for code splitting
- Optimize images with next/image component
- Implement API routes for backend functionality
- Use built-in performance optimizations and monitoring
- Follow Next.js best practices for SEO and accessibility`,

    'express': `
Express.js-specific development guidance:
- Structure applications with proper middleware organization
- Implement error handling middleware and async error catching
- Use route parameters and query string parsing effectively
- Secure applications with helmet and other security middleware
- Implement proper logging and monitoring
- Use environment variables for configuration management`,

    'fastapi': `
FastAPI-specific development guidance:
- Leverage automatic API documentation with OpenAPI/Swagger
- Use Pydantic models for request/response validation
- Implement dependency injection for shared logic
- Use async/await for I/O-bound operations
- Implement proper error handling and HTTP status codes
- Use FastAPI testing utilities for comprehensive testing`,

    'django': `
Django-specific development guidance:
- Follow Django's model-view-template (MVT) architecture
- Use Django ORM effectively with proper query optimization
- Implement proper authentication and authorization
- Use Django forms for input validation and processing
- Leverage Django admin for content management
- Follow Django security best practices`,

    'flask': `
Flask-specific development guidance:
- Keep applications lightweight and modular
- Use blueprints for organizing larger applications
- Implement proper error handling and logging
- Use Flask extensions for common functionality
- Implement proper session management and security
- Use application factories for configuration management`,

    'spring': `
Spring Boot-specific development guidance:
- Leverage Spring's dependency injection and inversion of control
- Use Spring Boot auto-configuration effectively
- Implement proper exception handling with @ControllerAdvice
- Use Spring Data for database operations
- Follow Spring Security best practices
- Use Spring Boot testing annotations for comprehensive testing`,
  };

  return templates[framework] || `
Framework-specific ${framework} guidance:
- Follow framework conventions and best practices
- Use framework-specific patterns and idioms
- Leverage framework features for common tasks
- Implement proper error handling within the framework
- Use framework testing utilities and patterns
- Stay current with framework updates and migrations`;
}

/**
 * Gets a dynamic prompt template based on Git repository state
 */
export function getGitWorkflowPrompt(gitState: GitState): string {
  if (!gitState.isRepository) {
    return `
Version control guidance:
- Consider initializing a Git repository for version control
- Set up a .gitignore file appropriate for your project type
- Plan for proper commit message conventions
- Consider branching strategy for collaborative development`;
  }

  let prompt = `
Git workflow guidance for ${gitState.currentBranch || 'current'} branch:`;

  if (gitState.isDirty) {
    prompt += `
- You have uncommitted changes - consider creating meaningful commits
- Review changes before committing to ensure quality
- Use descriptive commit messages following conventional commits`;
  }

  if (gitState.aheadCount && gitState.aheadCount > 0) {
    prompt += `
- You have ${gitState.aheadCount} commit(s) ahead of remote - consider pushing changes
- Ensure tests pass before pushing to shared branches`;
  }

  if (gitState.behindCount && gitState.behindCount > 0) {
    prompt += `
- You are ${gitState.behindCount} commit(s) behind remote - consider pulling latest changes
- Be prepared to resolve any merge conflicts`;
  }

  prompt += `
- Use feature branches for new development
- Consider pull/merge request workflows for code review
- Keep commits atomic and focused on single changes
- Write clear, descriptive commit messages`;

  return prompt;
}

/**
 * Gets a dynamic prompt template based on recent tool usage patterns
 */
export function getToolUsagePrompt(toolPatterns: ToolUsagePattern[]): string {
  if (toolPatterns.length === 0) {
    return `
Development workflow guidance:
- Use appropriate tools for file operations and code analysis
- Leverage search and analysis tools for codebase understanding
- Implement proper testing and building workflows
- Consider automation for repetitive tasks`;
  }

  const dominantPattern = toolPatterns[0];
  let prompt = `
Based on your recent tool usage (${dominantPattern.category}: ${dominantPattern.percentage.toFixed(1)}%):`;

  switch (dominantPattern.category) {
    case 'file-operations':
      prompt += `
- You're actively working with files - ensure proper backup and version control
- Consider using batch operations for multiple file changes
- Review file permissions and accessibility
- Use appropriate tools for file format conversion and validation`;
      break;
    
    case 'development':
      prompt += `
- You're in active development mode - maintain good testing practices
- Use development tools effectively for debugging and profiling
- Consider code quality tools (linters, formatters, static analysis)
- Implement proper build and deployment pipelines`;
      break;
    
    case 'search-analysis':
      prompt += `
- You're analyzing code and searching for patterns
- Document your findings for future reference
- Consider creating architectural documentation
- Use analysis results to guide refactoring decisions`;
      break;
    
    case 'testing-building':
      prompt += `
- You're focused on testing and building - maintain test coverage
- Use continuous integration for automated testing
- Consider performance testing and benchmarking
- Implement proper build optimization and caching`;
      break;
    
    default:
      prompt += `
- Your tool usage suggests varied development activities
- Maintain consistency in your development workflow
- Consider automation for repetitive tasks
- Document your processes for team collaboration`;
  }

  return prompt;
}

/**
 * Creates a comprehensive prompt template by combining multiple context types
 */
export function createContextualPrompt(
  projectType: ProjectTypeInfo,
  dominantLanguages: LanguageInfo[],
  frameworks: FrameworkInfo[],
  gitState: GitState,
  toolPatterns: ToolUsagePattern[]
): string {
  const sections: string[] = [];

  // Project type guidance
  if (projectType.confidence > 0.3) {
    sections.push(getProjectTypePrompt(projectType.primary));
  }

  // Language-specific guidance (top 2 languages)
  const topLanguages = dominantLanguages.slice(0, 2);
  for (const lang of topLanguages) {
    if (lang.percentage > 10) {
      sections.push(getLanguagePrompt(lang.language));
    }
  }

  // Framework-specific guidance (top 3 frameworks)
  const topFrameworks = frameworks.slice(0, 3);
  for (const framework of topFrameworks) {
    if (framework.confidence > 0.4) {
      sections.push(getFrameworkPrompt(framework.name));
    }
  }

  // Git workflow guidance
  sections.push(getGitWorkflowPrompt(gitState));

  // Tool usage guidance
  sections.push(getToolUsagePrompt(toolPatterns));

  return sections.join('\n\n');
}

/**
 * Specific template for React/TypeScript web applications
 */
export function getReactTypeScriptTemplate(): string {
  return `
React + TypeScript Web Application Best Practices:

Component Development:
- Use functional components with TypeScript interfaces for props
- Implement proper state management with useState/useReducer
- Use custom hooks for reusable logic
- Apply React.memo for performance optimization when needed
- Use proper key props for dynamic lists

Type Safety:
- Define strict TypeScript interfaces for all props and state
- Use discriminated unions for complex state shapes
- Implement proper event handler typing
- Use generic components when appropriate
- Leverage utility types for API responses

Testing Strategy:
- Use React Testing Library for component tests
- Mock external dependencies and API calls
- Test user interactions and accessibility
- Implement snapshot testing judiciously
- Use MSW for API mocking in tests

Performance Optimization:
- Implement code splitting with React.lazy and Suspense
- Use useMemo and useCallback appropriately
- Optimize bundle size with tree shaking
- Implement proper caching strategies
- Use React DevTools for performance profiling

Build and Deployment:
- Configure TypeScript strict mode
- Use ESLint and Prettier for code consistency
- Implement proper CI/CD pipelines
- Use environment variables for configuration
- Optimize build for different environments`;
}

/**
 * Specific template for Node.js/Express API development
 */
export function getNodeExpressTemplate(): string {
  return `
Node.js + Express API Development Best Practices:

API Design:
- Follow RESTful principles and HTTP status codes
- Implement proper request validation with Joi or similar
- Use consistent response formats (JSON API spec)
- Version your APIs for backward compatibility
- Document APIs with OpenAPI/Swagger

Security Implementation:
- Use helmet for security headers
- Implement rate limiting and CORS properly
- Validate and sanitize all user inputs
- Use JWT tokens with proper expiration
- Implement proper authentication middleware
- Never expose sensitive information in error messages

Error Handling:
- Use centralized error handling middleware
- Implement proper logging with structured formats
- Use appropriate HTTP status codes
- Handle async errors with proper try-catch
- Implement graceful degradation for external services

Database Integration:
- Use connection pooling for database connections
- Implement proper transaction handling
- Use parameterized queries to prevent SQL injection
- Cache frequently accessed data appropriately
- Monitor database performance and queries

Testing and Monitoring:
- Write unit tests for business logic
- Implement integration tests for API endpoints
- Use supertest for HTTP endpoint testing
- Monitor API performance and error rates
- Implement health check endpoints`;
}

/**
 * Specific template for Python data science projects
 */
export function getPythonDataScienceTemplate(): string {
  return `
Python Data Science Project Best Practices:

Data Management:
- Use pandas for data manipulation and analysis
- Implement proper data validation and cleaning
- Use appropriate data storage formats (Parquet, HDF5)
- Document data sources and transformations
- Implement data versioning strategies

Analysis and Modeling:
- Use Jupyter notebooks for exploratory analysis
- Implement reproducible analysis with version control
- Use scikit-learn for machine learning workflows
- Apply proper train/validation/test splits
- Document model assumptions and limitations

Visualization:
- Use matplotlib/seaborn for statistical plots
- Create interactive visualizations with plotly
- Follow data visualization best practices
- Ensure accessibility in charts and graphs
- Export visualizations in appropriate formats

Code Organization:
- Structure projects with clear directory hierarchies
- Use virtual environments (venv, conda)
- Implement proper configuration management
- Create reusable functions and classes
- Use type hints for better code documentation

Deployment and Sharing:
- Create requirements.txt or environment.yml files
- Use Docker for containerized deployments
- Implement model serving with appropriate frameworks
- Create clear documentation and examples
- Consider computational reproducibility`;
}

/**
 * Specific template for CLI tool development
 */
export function getCLIToolTemplate(): string {
  return `
CLI Tool Development Best Practices:

User Interface Design:
- Design intuitive command structures and subcommands
- Provide comprehensive help documentation
- Use consistent naming conventions
- Implement progressive disclosure of complexity
- Support both interactive and non-interactive modes

Argument Handling:
- Use robust argument parsing libraries
- Support both short and long option formats
- Implement proper input validation
- Provide meaningful error messages
- Support configuration files and environment variables

Cross-Platform Compatibility:
- Handle path separators correctly
- Support different terminal capabilities
- Test on multiple operating systems
- Handle different file systems appropriately
- Consider Unicode and internationalization

Error Handling and Feedback:
- Provide clear, actionable error messages
- Use appropriate exit codes
- Implement progress indicators for long operations
- Support different verbosity levels
- Handle interruption gracefully (Ctrl+C)

Testing and Distribution:
- Write comprehensive unit tests
- Test on different platforms and environments
- Use automated testing in CI/CD pipelines
- Package appropriately for different platforms
- Provide installation instructions and documentation`;
}

/**
 * Specific template for library/package development
 */
export function getLibraryPackageTemplate(): string {
  return `
Library/Package Development Best Practices:

API Design:
- Design clean, intuitive public APIs
- Follow semantic versioning strictly
- Maintain backward compatibility when possible
- Document breaking changes clearly
- Use proper deprecation strategies

Code Quality:
- Write comprehensive unit tests with high coverage
- Use static analysis tools and linters
- Implement proper error handling
- Follow language-specific conventions
- Use continuous integration for quality gates

Documentation:
- Write clear API documentation with examples
- Create getting started guides and tutorials
- Document installation and configuration
- Provide migration guides for version updates
- Include contributing guidelines

Distribution:
- Use appropriate package registries (npm, PyPI, etc.)
- Provide multiple installation methods
- Support different environments and platforms
- Include proper metadata and licensing
- Implement automated publishing workflows

Maintenance:
- Monitor usage and gather feedback
- Respond to issues and security vulnerabilities
- Keep dependencies updated
- Provide community support channels
- Plan for long-term maintenance`;
}

/**
 * Fallback template for unknown or mixed contexts
 */
export function getFallbackTemplate(): string {
  return `
General Software Development Best Practices:

Code Quality:
- Write clean, readable, and maintainable code
- Follow established conventions and style guides
- Use meaningful variable and function names
- Keep functions small and focused
- Avoid code duplication through proper abstraction

Testing:
- Write comprehensive unit tests
- Implement integration testing where appropriate
- Use test-driven development (TDD) practices
- Maintain good test coverage
- Mock external dependencies appropriately

Documentation:
- Document complex business logic
- Write clear API documentation
- Keep documentation up-to-date with code changes
- Include examples and usage patterns
- Document architecture and design decisions

Version Control:
- Use meaningful commit messages
- Create focused, atomic commits
- Use branching strategies appropriate for your team
- Review code changes before merging
- Tag releases appropriately

Security:
- Validate all user inputs
- Use secure coding practices
- Keep dependencies updated
- Handle sensitive data appropriately
- Implement proper authentication and authorization

Performance:
- Profile and optimize critical paths
- Use appropriate data structures and algorithms
- Cache frequently accessed data
- Monitor performance metrics
- Optimize for the target environment`;
}