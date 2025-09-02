# Internationalization (i18n) Tools

## Overview

This directory contains internationalization resources and tools for the Gemini CLI project.

## Directory Structure

```
packages/cli/src/i18n/
├── README.md                    # Documentation and usage guide
├── index.ts                     # Main i18n configuration and initialization
├── useTranslation.ts            # React hook for component translations
├── find-hardcoded-strings.ts    # Detection tool for hardcoded strings  
├── translationIntegrity.test.ts # Test suite for translation consistency
└── locales/                     # Translation files by language
    ├── en/                      # English (base language) - 18 files
    │   ├── auth.json           # Authentication dialogs
    │   ├── commands.json       # Command descriptions and usage
    │   ├── config.json         # Configuration messages  
    │   ├── dialogs.json        # UI dialog text
    │   ├── errors.json         # Error messages
    │   ├── help.json           # Help system content
    │   ├── messages.json       # General user messages
    │   ├── tools.json          # Tool descriptions and parameters
    │   ├── ui.json             # UI component text
    │   └── ... (9 more files)
    ├── zh/                     # Chinese (Simplified) - 16 files  
    ├── es/                     # Spanish - 13 files
    └── fr/                     # French - 13 files
```

### Translation Resources
- **`locales/`** - Translation files organized by language code
  - **`en/`** - English translations (base language, most complete)
  - **`zh/`** - Chinese (Simplified) translations  
  - **`es/`** - Spanish translations
  - **`fr/`** - French translations

### Development Tools

#### `find-hardcoded-strings.ts`
A utility script to detect hardcoded English strings that need internationalization.

**Usage:**
```bash
# From project root directory
npx tsx packages/cli/src/i18n/find-hardcoded-strings.ts
```

**Features:**
- Scans all TypeScript/TSX files in the project
- Identifies hardcoded strings that should be internationalized
- Excludes technical terms, developer messages, and fallback strings
- Generates a detailed report with priorities
- Supports multiple filtering patterns to reduce false positives

**Output:**
- Generates `i18n-hardcoded-strings-report.md` in the project root
- Shows priority levels (High/Medium/Low) for better task organization
- Includes statistics and recommendations

**Use Cases:**
- Pre-commit checks for internationalization compliance
- Regular audits to ensure consistent i18n coverage
- Onboarding new contributors to understand i18n patterns

#### `translationIntegrity.test.ts`
A comprehensive test suite that validates the integrity and consistency of translation files.

**Usage:**
```bash
# Run translation integrity tests
npm test -- --testPathPattern=translationIntegrity

# Or run specific test pattern
npm test -- src/i18n/translationIntegrity.test.ts
```

**Test Categories:**

1. **File Structure Validation**
   - Verifies all supported language directories exist (`en`, `zh`, `fr`, `es`)
   - Ensures all required namespace files are present for each language
   - Validates the complete file structure integrity

2. **JSON File Validity**
   - Checks all translation files contain valid JSON syntax
   - Prevents build failures due to malformed translation files
   - Ensures files can be properly parsed by the i18n system

3. **Translation Key Consistency**
   - Compares translation keys across all languages
   - Identifies missing translations in non-English languages
   - Ensures all languages have the same key structure
   - Validates nested object structures match across languages

**Automated Checks:**
- **Missing Files**: Detects if any required translation files are missing
- **Syntax Errors**: Catches JSON parsing errors before deployment
- **Key Mismatches**: Reports missing or extra translation keys per language
- **Structure Validation**: Ensures consistent nested object hierarchies

**Benefits:**
- **Prevents Runtime Errors**: Catches translation issues before they reach users
- **Ensures Completeness**: Guarantees all languages have complete translations
- **Maintains Quality**: Enforces consistent structure across all language files
- **CI/CD Integration**: Can be used in automated testing pipelines

**Example Output:**
```
✓ should have all supported language directories
✓ should have all required namespace files for each language  
✓ should have valid JSON files for all languages and namespaces
✓ should have consistent translation keys across all languages
```

## Usage Instructions

### Adding New Languages
1. Create a new language directory under `locales/` (e.g., `locales/de/` for German)
2. Copy the structure from `locales/en/` 
3. Translate all JSON files maintaining the same key structure
4. Update the language selector in `SettingsDialog.tsx`

### Adding New Translation Keys
1. Add the key-value pair to the appropriate English JSON file
2. Add corresponding translations to all other language files
3. Use the `t()` function in your TypeScript code: `t('namespace:key')`

### Testing Translations

#### 1. Check for Hardcoded Strings
Run the hardcoded strings detector after making changes:
```bash
npx tsx packages/cli/src/i18n/find-hardcoded-strings.ts
```

#### 2. Validate Translation Integrity
Run the translation integrity tests to ensure consistency:
```bash
# Quick check
npm test -- --testPathPattern=translationIntegrity

# Full test output with details
npm test -- src/i18n/translationIntegrity.test.ts
```

#### 3. Complete Validation Workflow
For comprehensive testing, run both tools:
```bash
# 1. Check for new hardcoded strings
npx tsx packages/cli/src/i18n/find-hardcoded-strings.ts

# 2. Validate translation file integrity
npm test -- --testPathPattern=translationIntegrity

# 3. Run full test suite to ensure no regressions
npm test
```

## Contributing

When adding new user-facing strings:
1. Always use the `t()` function with appropriate namespace and key
2. Add the English version to the relevant JSON file in `locales/en/`
3. Add translations to other language files (or mark as TODO)
4. Run the hardcoded strings detector to verify compliance