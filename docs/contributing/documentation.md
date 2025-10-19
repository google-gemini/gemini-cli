# Documentation Contribution Guide

Thank you for your interest in improving the Gemini CLI documentation. This guide will help you get started.

## Our Documentation Philosophy

We want our documentation to be clear, concise, and helpful to our users. We value:

- **Clarity:** Use simple and direct language. Avoid jargon where possible.
- **Accuracy:** Ensure all information is correct and up-to-date.
- **Completeness:** Cover all aspects of a feature or topic.
- **Examples:** Provide practical examples to help users understand how to use Gemini CLI.

## Getting Started

The process for contributing to the documentation is similar to contributing code.

1. **Fork the repository** and create a new branch.
2. **Make your changes** in the `/docs` directory.
3. **Build the documentation locally** to preview your changes. (We are in the process of setting up a dedicated command for this, for now, you can just check the markdown rendering).
4. **Lint and format your changes.** Our preflight check includes linting and formatting for documentation files.
   ```bash
   npm run preflight
   ```
5. **Open a pull request** with your changes.

## Documentation Structure

Our documentation is organized using [sidebar.json](../sidebar.json) as the table of contents. When adding new documentation:

1. Create your markdown file in the appropriate directory under `/docs`
2. Add an entry to `sidebar.json` in the relevant section
3. Ensure all internal links use relative paths and point to existing files

## Style Guide

We follow the [Google Developer Documentation Style Guide](https://developers.google.com/style). Please refer to it for guidance on writing style, tone, and formatting.

### Key Style Points

- Use sentence case for headings
- Write in second person ("you") when addressing the reader
- Use present tense
- Keep paragraphs short and focused
- Use code blocks with appropriate language tags for syntax highlighting
- Include practical examples whenever possible

## Linting and Formatting

We use `eslint` and `prettier` to enforce a consistent style across our documentation. The `npm run preflight` command will check for any linting issues.

You can also run the linter and formatter separately:

- `npm run lint` - Check for linting issues
- `npm run format` - Auto-format markdown files
- `npm run lint:fix` - Auto-fix linting issues where possible

Please make sure your contributions are free of linting errors before submitting a pull request.

## Before You Submit

Before submitting your documentation pull request, please:

1. Run `npm run preflight` to ensure all checks pass
2. Review your changes for clarity and accuracy
3. Check that all links work correctly
4. Ensure any code examples are tested and functional
5. Sign the [Contributor License Agreement (CLA)](https://cla.developers.google.com/) if you haven't already

## Need Help?

If you have questions about contributing documentation:

- Check our [FAQ](../faq.md)
- Review existing documentation for examples
- Open an issue to discuss your proposed changes
- Reach out to the maintainers

We appreciate your contributions to making Gemini CLI documentation better!
