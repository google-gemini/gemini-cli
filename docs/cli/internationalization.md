# Internationalization (i18n) in Gemini CLI

## Overview

Gemini CLI supports internationalization (i18n) to provide a localized experience for users worldwide. This document provides guidance for developers on adding new translatable strings and managing i18n coverage.

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

### Running i18n Tests

```bash
# Run all i18n tests
npm test src/i18n/index.test.ts

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

### 1. String Extraction Guidelines

- Extract user-facing strings immediately when writing components
- Don't extract debug messages or internal logs
- Use descriptive, hierarchical keys: `dialog.auth.title` not `authTitle`
- Group related strings in appropriate namespaces

### 2. Translation-Friendly Strings

- Write complete sentences instead of concatenating fragments
- Avoid hardcoded formatting - use interpolation instead
- Consider different languages may need different sentence structures
- Provide context in key names when the same word could have different meanings

### 3. Code Organization

- Import translations at the component level, not globally
- Use the correct namespace for your content type
- Handle missing translations gracefully with fallbacks
- Test your components with longer translated text

### 4. Performance Considerations

- Namespaces are loaded on-demand - organize by usage patterns
- Avoid loading all translations upfront
- Use translation keys that are likely to be stable over time

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

## Related Documentation

- [Semantic Interpolation Pattern](../../../packages/cli/src/ui/utils/styledText.tsx) - Implementation details
- [Translation Tests](../../../packages/cli/src/i18n/index.test.ts) - Test coverage examples
- [Help Component Example](../../../packages/cli/src/ui/components/Help.tsx) - Reference implementation

## External Resources

- [i18next Documentation](https://www.i18next.com/)
- [react-i18next Documentation](https://react.i18next.com/)
- [Internationalization Best Practices](https://developer.mozilla.org/en-US/docs/Web/Localization)
