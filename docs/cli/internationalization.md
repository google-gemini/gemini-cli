# Internationalization (i18n) in Gemini CLI

## Overview

Gemini CLI supports internationalization (i18n) to provide a localized experience for users worldwide. This document provides comprehensive guidance for developers on UI development, internationalization implementation, and testing strategies.

## 🆕 New Developer Quick Start Guide

### For New Contributors: Getting Started with UI Development and i18n

If you're new to the Gemini CLI project, this section will help you understand how to develop user interfaces with internationalization support.

#### 🏗️ UI Development Basics

**1. Understanding the Tech Stack:**
- **React + Ink**: Terminal-based UI using React components
- **TypeScript**: Type-safe development environment
- **i18next + react-i18next**: Internationalization framework
- **Vitest**: Testing framework with snapshot testing

**2. Key Concepts:**
- **Terminal UI**: Unlike web apps, we render to terminal using Ink components
- **Theme System**: Consistent colors and styling via semantic themes
- **Component Architecture**: Reusable, tested React components
- **Golden Tests**: JSON snapshots for comprehensive component testing

#### 🌍 i18n Development Workflow

**Step 1: Set Up Your Development Environment**

```bash
# Clone and set up the project
git clone https://github.com/google-gemini/gemini-cli.git
cd gemini-cli
npm install
npm run build

# Run in development mode with language switching
npm start
```

**Step 2: Understanding the File Structure**

```
packages/cli/src/
├── ui/
│   ├── components/          # React components
│   │   ├── Help.tsx        # Example: Internationalized component
│   │   ├── AuthDialog.tsx  # Example: Dialog with i18n
│   │   └── SettingsDialog.tsx
│   └── utils/
│       └── styledText.tsx  # Utility for styled translations
├── i18n/
│   ├── index.ts           # i18n configuration
│   ├── useTranslation.ts  # React hook for translations
│   └── locales/
│       └── en/
│           ├── common.json     # UI elements, buttons
│           ├── dialogs.json    # Dialog text
│           └── help.json       # Help system content
```

#### 📝 Your First Internationalized Component

Let's create a simple component with i18n support:

```tsx
// src/ui/components/WelcomeMessage.tsx
import React from 'react';
import { Box, Text } from 'ink';
import { useTranslation } from '../../i18n/useTranslation.js';
import { renderStyledText } from '../utils/styledText.js';
import { theme } from '../semantic-colors.js';

interface WelcomeMessageProps {
  username: string;
}

export function WelcomeMessage({ username }: WelcomeMessageProps) {
  const { t } = useTranslation('common');

  return (
    <Box flexDirection="column" padding={1}>
      {/* Simple text translation */}
      <Text bold color={theme.text.primary}>
        {t('welcome.title')}
      </Text>
      
      {/* Text with variable interpolation */}
      <Text color={theme.text.secondary}>
        {t('welcome.greeting', { username })}
      </Text>
      
      {/* Complex styled text using Semantic Interpolation Pattern */}
      {renderStyledText(t('welcome.instructions'), {
        command: <Text bold color={theme.text.accent}>gemini --help</Text>,
        key: <Text bold color={theme.text.accent}>Tab</Text>
      }, theme.text.primary)}
    </Box>
  );
}
```

**Add corresponding translations:**

```json
// src/i18n/locales/en/common.json
{
  "welcome": {
    "title": "Welcome to Gemini CLI",
    "greeting": "Hello, {{username}}! Ready to get started?",
    "instructions": "Use {command} for help or press {key} for autocomplete."
  }
}
```

#### 🧪 Testing Your i18n Component

**1. Create Component Tests with Golden Testing:**

```tsx
// src/ui/components/WelcomeMessage.test.tsx
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { WelcomeMessage } from './WelcomeMessage.js';
import '../../i18n/index.js'; // Initialize i18n

describe('WelcomeMessage', () => {
  it('should render welcome message with user interpolation', () => {
    const { lastFrame } = render(
      <WelcomeMessage username="Alice" />
    );

    const output = lastFrame();
    expect(output).toContain('Welcome to Gemini CLI');
    expect(output).toContain('Hello, Alice!');
    expect(output).toContain('gemini --help');
  });

  it('should match golden snapshot for complete component structure', () => {
    const component = <WelcomeMessage username="TestUser" />;
    
    // Golden test: capture complete component as JSON
    const componentJSON = JSON.stringify(component, null, 2);
    expect(componentJSON).toMatchSnapshot('welcome-message-component.json');
  });
});
```

**2. Run Tests and Generate Snapshots:**

```bash
# Run your component tests
npm test src/ui/components/WelcomeMessage.test.tsx

# Run all i18n tests
npm test src/i18n/

# Run tests with coverage
npm test -- --coverage
```

#### 🔄 Language Switching and Testing

**1. Test Different Languages (Future):**

```tsx
// Test component with different languages
describe('WelcomeMessage i18n', () => {
  it('should support language switching', async () => {
    // This will be useful when adding more languages
    // For now, test the i18n infrastructure works
    const { lastFrame } = render(<WelcomeMessage username="用户" />);
    
    const output = lastFrame();
    expect(output).toContain('Welcome'); // English default
  });
});
```

**2. Manual Testing in Development:**

```bash
# Start CLI and test language settings
npm start

# In the CLI, use settings to change language (when available):
# /settings → Language → Select language
```

#### 🎯 JSON Snapshot Testing - Core Method

**Why JSON Snapshots?** Following Jacob's feedback (#6832), we use complete component JSON snapshots instead of partial assertions because they capture the full component structure and make it clear what changes impact the UI.

**Basic Pattern:**
```tsx
it('should match component structure snapshot', () => {
  const component = <MyComponent prop="value" />;
  
  // Capture complete component as JSON
  const componentJSON = JSON.stringify(component, null, 2);
  expect(componentJSON).toMatchSnapshot('my-component.json');
});
```

#### 🐛 Debugging Common i18n Issues

**1. Missing Translation Keys:**
```
// Error: "translation missing"
// Solution: Check key path and namespace
console.log(t('help:sections.missing')); // ❌ Wrong
console.log(t('sections.missing'));     // ✅ Correct (with 'help' namespace)
```

**2. Interpolation Not Working:**
```tsx
// Problem: Variables not replacing
{t('welcome.greeting', { user: 'Alice' })} // ❌ Wrong key name

// Solution: Match JSON key names exactly
{t('welcome.greeting', { username: 'Alice' })} // ✅ Correct
```

**3. Styled Text Issues:**
```tsx
// Problem: Styling not applied
{renderStyledText(t('message'), {
  symbol: '@'  // ❌ Plain string, no styling
})}

// Solution: Use Ink components for styling
{renderStyledText(t('message'), {
  symbol: <Text bold color="purple">@</Text>  // ✅ Styled component
})}
```


---

## Architecture

### Framework

- **i18next**: Core i18n framework for translation management
- **react-i18next**: React integration for components
- **Dynamic loading**: Translation files are loaded on-demand

### File Structure

```
packages/cli/src/i18n/
├── index.ts                 # i18n configuration and initialization
├── index.test.ts           # i18n tests and coverage validation
├── useTranslation.ts       # React hook wrapper
└── locales/
    ├── en/
    │   ├── common.json     # Common UI elements (buttons, labels)
    │   ├── dialogs.json    # Authentication and settings dialogs
    │   └── help.json       # Help system content
    └── [future languages]/
```

## Developer Guide

### Translation Approach Standards

#### Use `t()` function for simple text:

1. **Pure text**: No embedded styles or components
2. **Single semantic unit**: Complete concept that doesn't need splitting
3. **Simple interpolation**: Only variable replacement, no styling needs

Examples:

```tsx
// Section titles
<Text bold>{t('sections.basics')}</Text>

// Simple error messages
<Text color="red">{t('errors.fileNotFound')}</Text>

// Variable interpolation
<Text>{t('userCount', { count: users.length })}</Text>
```

#### Use Semantic Interpolation Pattern for complex styled text:

**Problem**: How to translate text with embedded styling without creating fragmented translation keys?

**Solution**: Complete semantic translations with styled placeholders.

```tsx
import { renderStyledText } from '../utils/styledText.js';

// Translation file: Complete semantic unit with placeholders
{
  "shellMode": "Shell mode: Execute shell commands via {symbol} (e.g., {example}) or use natural language (e.g. {natural})."
}

// Component: Styled interpolation
{renderStyledText(t('shellMode'), {
  symbol: <Text bold color={theme.text.accent}>!</Text>,
  example: <Text bold color={theme.text.accent}>!npm run start</Text>,
  natural: <Text bold color={theme.text.accent}>start server</Text>
}, theme.text.primary)}
```

**Benefits**:

- ✅ **Complete semantic context** for translators
- ✅ **No fragmented translation keys** (avoiding `t('exclamation')`)
- ✅ **Ink-compatible** styling
- ✅ **Type-safe** implementation

#### Translation Guidelines:

**✅ DO translate**:

- Complete semantic units with context
- User-facing messages and instructions
- Help text and descriptions
- Error messages and warnings

**❌ DON'T translate**:

- Pure styling symbols (`!`, `@`, `(`, `)`)
- Technical punctuation without meaning
- Universal syntax elements
- Single characters without semantic context

### Semantic Interpolation Pattern

#### Implementation

1. **Create the utility function** (already provided in `src/ui/utils/styledText.tsx`)
2. **Structure translations** with complete semantic meaning
3. **Use placeholders** for styled elements only

#### Example Migration

**Before** (Fragmented approach):

```json
{
  "addContext": "Add context",
  "colon": ":",
  "use": "Use",
  "symbol": "@",
  "toSpecify": "to specify files",
  "example": "(e.g.,",
  "exampleFile": "@src/myFile.ts",
  "closeParen": ")"
}
```

**After** (Semantic approach):

```json
{
  "addContext": "Add context: Use {symbol} to specify files for context (e.g., {example}) to target specific files or folders."
}
```

**Result**:

- 🔻 Reduced from 8 fragmented keys to 1 semantic key
- ✅ Complete context for translators
- ✅ Maintains all styling capabilities

### Adding New Translatable Strings

#### 1. Add Translation Keys to JSON Files

Choose the appropriate namespace and add your strings:

```json
// packages/cli/src/i18n/locales/en/common.json
{
  "button": {
    "save": "Save",
    "cancel": "Cancel",
    "confirm": "Confirm"
  },
  "message": {
    "success": "Operation completed successfully",
    "error": "An error occurred: {{details}}"
  }
}
```

#### 2. Use in React Components

**For simple text strings:**

```typescript
// packages/cli/src/ui/components/Help.tsx
import { useTranslation } from '../../i18n/useTranslation.js';

export const Help: React.FC<Help> = ({ commands }) => {
  const { t } = useTranslation('help');

  return (
    <Box>
      {/* Simple section titles - use t() function */}
      <Text bold color={Colors.Foreground}>
        {t('sections.basics')}      {/* "Basics:" */}
      </Text>
      <Text bold color={Colors.Foreground}>
        {t('sections.commands')}    {/* "Commands:" */}
      </Text>
      <Text bold color={Colors.Foreground}>
        {t('sections.shortcuts')}   {/* "Keyboard Shortcuts:" */}
      </Text>
    </Box>
  );
};
```

**For rich text with styling:**

For complex text with embedded styling (such as highlighted symbols and examples), use the Semantic Interpolation Pattern with the `renderStyledText` utility function:

```typescript
// packages/cli/src/ui/components/Help.tsx
import { renderStyledText } from '../utils/styledText.js';
import { useTranslation } from '../../i18n/useTranslation.js';

export const Help: React.FC<HelpProps> = ({ commands }) => {
  const { t } = useTranslation('help');

  return (
    <Box>
      {/* ❌ Avoid fragmented translations like this */}
      {/* <Text bold>{t('basics.addContext')}</Text>
          {t('basics.colon')}
          <Text bold>@</Text>
          {t('basics.toSpecify')} */}

      {/* ✅ Use Semantic Interpolation Pattern */}
      {renderStyledText(t('basics.addContext'), {
        symbol: <Text bold color={theme.text.accent}>@</Text>,
        example: <Text bold color={theme.text.accent}>@src/myFile.ts</Text>
      }, theme.text.primary)}
    </Box>
  );
};
```

**Translation file structure:**

```json
{
  "basics": {
    "addContext": "Add context: Use {symbol} to specify files for context (e.g., {example}) to target specific files or folders."
  }
}
```

**Why use Semantic Interpolation Pattern?**

- **Complete semantic context**: Translators see full sentences with context
- **Ink-compatible**: Works perfectly in terminal environment
- **Type-safe**: Full TypeScript support with proper error handling
- **Maintainable**: Clear separation between content and styling

#### 3. Use in Non-React Code

```typescript
import { t } from '../i18n/index.js';

function processCommand() {
  const errorMessage = t('common:message.error', {
    details: 'Invalid command syntax',
  });
  console.error(errorMessage);
}
```

### Namespace Guidelines

- **`common`**: Buttons, labels, generic UI elements, common messages
- **`dialogs`**: Authentication and settings dialog text, prompts, instructions
- **`help`**: Help system content, documentation text, keyboard shortcuts

### Key Naming Conventions

Use hierarchical, semantic keys:

```json
{
  "dialog": {
    "auth": {
      "title": "Authentication Required",
      "subtitle": "Please select your authentication method"
    }
  },
  "button": {
    "primary": {
      "continue": "Continue",
      "login": "Sign In"
    }
  }
}
```

### String Interpolation

For dynamic content, use interpolation:

```json
{
  "welcome": "Welcome back, {{username}}!",
  "progress": "Processing {{current}} of {{total}} items..."
}
```

```typescript
const message = t('welcome', { username: 'Alice' });
const progress = t('progress', { current: 5, total: 10 });
```

## Testing and Coverage

### 🧪 JSON Snapshot Testing Strategy

**Core Principle**: Following Jacob's feedback on Issue #6832, we use **Golden Tests** (complete component JSON snapshots) instead of partial assertions to capture the full component structure and clearly detect what changes impact the UI.

#### Essential Testing Patterns

**1. Component Structure Snapshots:**
```tsx
describe('Component Golden Tests', () => {
  it('should match complete component structure', () => {
    const component = <MyComponent prop="testValue" />;
    
    // Capture complete component as JSON - this is the key method
    const componentJSON = JSON.stringify(component, null, 2);
    expect(componentJSON).toMatchSnapshot('my-component.json');
  });
});
```

**2. StyledText Snapshots:**
```tsx
describe('StyledText Testing', () => {
  it('should capture styled interpolation structure', () => {
    const component = renderStyledText(
      'Use {symbol} to access {feature}',
      {
        symbol: <Text bold color="purple">@</Text>,
        feature: <Text bold color="green">files</Text>
      },
      'white'
    );

    // Golden test captures complete styling structure
    const componentJSON = JSON.stringify(component, null, 2);
    expect(componentJSON).toMatchSnapshot('styled-interpolation.json');
  });
});
```

**3. Error Scenario Snapshots:**
```tsx
describe('Error Handling', () => {
  it('should capture error structure for missing keys', () => {
    let errorObject;
    try {
      renderStyledText('Use {missing}', { provided: <Text>Wrong</Text> });
    } catch (error) {
      errorObject = {
        message: (error as Error).message,
        name: (error as Error).name,
        cause: (error as Error).cause || null
      };
    }
    
    const errorJSON = JSON.stringify(errorObject, null, 2);
    expect(errorJSON).toMatchSnapshot('error-structure.json');
  });
});
```

### Running i18n Tests

```bash
# Run all i18n tests
npm test src/i18n/index.test.ts

# Run component tests with snapshots
npm test src/ui/components/ 

# Run styled text utility tests
npm test src/ui/utils/styledText.test.tsx

# Generate/update golden test snapshots
npm test -- --update-snapshots

# Run with coverage
npm test -- --coverage src/i18n/
```

### Coverage Report

The i18n system includes comprehensive coverage validation:

```bash
# Generate detailed coverage report
npm test src/i18n/index.test.ts -- --reporter=verbose

# Check translation key coverage
npm test src/i18n/index.test.ts -- --grep "translation keys"

# Validate golden test snapshots
npm test src/ui/utils/styledText.test.tsx -- --reporter=verbose
```

#### What the Coverage Report Includes:

1. **Translation Key Coverage**: Validates all defined keys have translations
2. **Missing Translation Detection**: Identifies keys used in code but missing in JSON
3. **Unused Key Detection**: Finds translation keys that aren't referenced in code
4. **Interpolation Testing**: Verifies variable substitution works correctly
5. **Namespace Loading**: Ensures all namespaces load properly

#### Example Coverage Output:

```
✓ All translation keys have English translations
✓ No missing translations detected
✓ All used keys are defined in translation files
✓ Interpolation works for dynamic content
✓ All namespaces load correctly
⚠ 3 unused translation keys found (see warnings)
```

### Adding Coverage for New Strings

When adding new translatable strings, update the test file:

```typescript
// packages/cli/src/i18n/index.test.ts
const EXPECTED_KEYS = {
  common: [
    'button.save',
    'button.cancel',
    'message.success',
    'message.error',
    // Add your new keys here
  ],
  dialogs: [
    'auth.title',
    'auth.description',
    'settings.title',
    'settings.applyTo',
    // Add dialog-related keys here
  ],
  help: [
    'sections.basics',
    'sections.commands',
    'basics.addContext',
    'basics.shellMode',
    // Add help-related keys here
  ],
};
```

## Best Practices

### Best Practices Summary

**Component Development:**
- Use `useTranslation('namespace')` with appropriate namespace
- Use `renderStyledText()` for styled interpolations
- Always use theme constants for colors
- Create JSON snapshots for comprehensive testing

**Translation Keys:**
- Use hierarchical structure: `dialog.auth.title`
- Complete sentences, not fragments
- Group by namespace: `common`, `dialogs`, `help`

**Testing Pattern:**
```tsx
describe('ComponentName', () => {
  it('should match component structure', () => {
    const component = <ComponentName prop="value" />;
    const componentJSON = JSON.stringify(component, null, 2);
    expect(componentJSON).toMatchSnapshot('component-name.json');
  });
});
```

## Troubleshooting

### Common Issues

1. **Missing Translation Warning**

   ```
   i18next: key "button.new" returned an object instead of string.
   ```

   Solution: Check that the key path is correct and points to a string value.

2. **Namespace Not Found**

   ```
   i18next: namespace "commands" was not yet loaded
   ```

   Solution: Ensure the namespace is properly imported and initialized.

3. **Interpolation Not Working**
   ```
   Expected: "Hello, Alice!"
   Actual: "Hello, {{name}}!"
   ```
   Solution: Verify the interpolation object contains the correct key names.

### Debugging Tips

- Use browser dev tools to inspect `i18next` object
- Check console for i18next warnings and errors
- Verify translation files are properly formatted JSON
- Test with `lng` parameter to simulate different languages

## FAQ: JSON Snapshot Testing

**Q: Why do we use JSON snapshots instead of testing individual elements?**
A: Following Jacob's feedback on Issue #6832, we use "Golden Tests" (complete component JSON snapshots) because they capture the full component structure, making it clear exactly what changes impact the UI. This is more comprehensive than partial assertions.

**Q: How do I create a JSON snapshot test?**
A: Use this pattern:
```tsx
it('should match component structure', () => {
  const component = <MyComponent prop="value" />;
  const componentJSON = JSON.stringify(component, null, 2);
  expect(componentJSON).toMatchSnapshot('my-component.json');
});
```

**Q: My snapshot tests are failing. What should I do?**
A: 
1. Verify your changes are intentional
2. Run `npm test -- --update-snapshots` to update snapshots
3. Review the snapshot diff to ensure it matches your intended changes
4. Commit the updated snapshot files

**Q: How do I test styledText components with snapshots?**
A: Capture the complete renderStyledText output:
```tsx
const component = renderStyledText('Use {symbol}', {
  symbol: <Text bold color="purple">@</Text>
});
const componentJSON = JSON.stringify(component, null, 2);
expect(componentJSON).toMatchSnapshot('styled-text.json');
```

**Q: Should I still use functional tests alongside JSON snapshots?**
A: Yes, use both:
- Functional tests verify behavior: `expect(lastFrame()).toContain('text')`
- JSON snapshots verify structure: `expect(componentJSON).toMatchSnapshot()`

## Related Documentation

- [Semantic Interpolation Pattern](../../../packages/cli/src/ui/utils/styledText.tsx) - Implementation details
- [Translation Tests](../../../packages/cli/src/i18n/index.test.ts) - Test coverage examples
- [Help Component Example](../../../packages/cli/src/ui/components/Help.tsx) - Reference implementation

## External Resources

- [i18next Documentation](https://www.i18next.com/)
- [react-i18next Documentation](https://react.i18next.com/)
- [Internationalization Best Practices](https://developer.mozilla.org/en-US/docs/Web/Localization)
