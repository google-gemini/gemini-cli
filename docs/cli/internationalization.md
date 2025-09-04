# Internationalization (i18n)

Gemini CLI supports multiple languages to provide a localized user experience for users worldwide. The internationalization system allows you to use the CLI in your preferred language, with all UI elements, commands, help text, and messages translated appropriately.

## Supported Languages

Currently, Gemini CLI supports the following languages:

- **English** (`en`) - Default language
- **Chinese (Simplified)** (`zh`) - 中文（简体）
- **French** (`fr`) - Français
- **Spanish** (`es`) - Español

Additional language support will be added in future releases based on community needs and contributions.

## Changing the Language

### Through the Settings Command

The most convenient way to change the language is through the interactive `/settings` command:

1. Start Gemini CLI
2. Type `/settings` and press Enter
3. Navigate to the "Language" option using arrow keys
4. Select your preferred language from the dropdown
5. Press Enter to save the setting

The language change takes effect immediately and persists across CLI sessions.

### Through Configuration File

You can also set the language by editing your `settings.json` file:

```json
{
  "language": "zh"
}
```

The `language` setting can be configured in any of the [configuration file locations](./configuration.md#settings-files):

- User settings: `~/.gemini/settings.json`
- Project settings: `.gemini/settings.json`
- System settings: Platform-specific system directory

### Through Environment Variables (Automatic Detection)

Gemini CLI can automatically detect your preferred language from environment variables. To enable this:

1. Go to `/settings` → Language → Select "Use GEMINI_LANG (Environment Variable)"
2. Or set `"language": ""` in your `settings.json` file
3. Set one of the following environment variables:

```bash
# Gemini-specific language setting (highest priority)
export GEMINI_LANG=zh

# Standard Unix locale variables (fallback)
export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8
```

**Priority order:**
1. **Settings file** (explicit language selection) - Highest
2. **GEMINI_LANG** environment variable
3. **LANG/LC_ALL** environment variables  
4. **Default** (`en`) - Lowest

**Locale format support:**
- `zh_CN.UTF-8` → `zh` (Chinese)
- `es_ES.UTF-8` → `es` (Spanish)
- `fr_FR.UTF-8` → `fr` (French)
- `C.UTF-8` or `POSIX` → `en` (English)

### Manual Environment Variable Configuration

You can also use environment variables in your settings file for dynamic configuration:

```json
{
  "language": "$MY_PREFERRED_LANGUAGE"
}
```

Then set the environment variable:

```bash
export MY_PREFERRED_LANGUAGE=zh
```

This approach follows the same [environment variable resolution](./configuration.md#settings-files) pattern used by other settings.

## What Gets Translated

When you change the language setting, the following elements are localized:

### User Interface Elements

- Navigation menus and options
- Button labels and controls
- Status indicators and feedback messages
- Error messages and warnings
- Loading indicators and progress text

### Help System

- Command descriptions and usage instructions
- Keyboard shortcuts and key bindings
- Feature explanations and tips
- Quick help tooltips

### Command System

- Built-in command descriptions
- Command output and feedback
- Validation messages
- Success and error notifications

### Settings Interface

- Setting names and descriptions
- Option labels and values
- Configuration explanations
- Help text and tooltips

## Language Configuration Precedence

The language setting follows the same precedence rules as other [configuration settings](./configuration.md#configuration-layers):

1. **Command-line arguments** (highest priority)
2. **Environment variables**
3. **System settings file**
4. **Project settings file**
5. **User settings file**
6. **Default values** (English - lowest priority)

## Fallback Behavior

If a translation is missing for the selected language, Gemini CLI will:

1. **Graceful fallback**: Display the English version of the text
2. **Maintain functionality**: All features continue to work normally
3. **Preserve formatting**: UI layout and formatting remain consistent

This ensures that the CLI remains fully functional even if translations are incomplete.

## Technical Implementation

The internationalization system in Gemini CLI:

- Uses **react-i18next** for translation management
- Supports **interpolation** for dynamic content
- Implements **namespace separation** for organized translations
- Provides **type safety** for translation keys
- Enables **hot reloading** for immediate language switching

## Development Tools

### Translation Coverage Report

For maintainers and contributors, Gemini CLI includes a coverage analysis tool to track translation completeness across all supported languages:

```bash
# Generate a detailed coverage report (Markdown format)
npx tsx src/i18n/find-unused-translations.ts --coverage
```

This command generates `translation-coverage-report.md` with:

- **Coverage Summary**: Table showing completion percentage for each language
- **Missing Keys**: Detailed list of untranslated keys by language  
- **Progress Visualization**: ASCII progress bars for each language
- **Status Indicators**: Visual completion status (✅ Complete / ⚠️ Missing)

**Example output:**
```markdown
| Language | Coverage | Keys | Status |
|----------|----------|------|---------|
| 🇺🇸 English (en) | 100.0% | 689/689 | ✅ Complete |
| 🇨🇳 Chinese (zh) | 97.5% | 672/689 | ⚠️  21 missing |
| 🇪🇸 Spanish (es) | 95.1% | 655/689 | ⚠️  38 missing |
```

### Unused Translation Detection

To find potentially unused translation keys:

```bash
# Generate unused translation report  
npx tsx src/i18n/find-unused-translations.ts
```

This helps maintain clean translation files by identifying orphaned keys.

## Contributing Translations

We welcome contributions to improve and expand language support in Gemini CLI. If you'd like to help with translations:

1. **Check Coverage**: Run the coverage report to see what needs translation
2. **Report Issues**: If you find translation errors or missing text, please [open an issue](https://github.com/google-gemini/gemini-cli/issues)
3. **Community Contributions**: Join discussions about internationalization improvements
4. **New Languages**: Help us prioritize new language support by expressing interest in the community

## Troubleshooting

### Language Not Changing

If the language setting doesn't take effect:

1. **Check the setting**: Verify the language code is correct (`"en"` or `"zh"`)
2. **Restart the CLI**: Some changes may require restarting the application
3. **Check precedence**: Ensure a higher-priority setting isn't overriding your choice
4. **Verify file format**: Make sure your `settings.json` file is valid JSON

### Missing Translations

If you see English text in a non-English language mode:

1. **Expected behavior**: This is normal fallback behavior for incomplete translations
2. **Report gaps**: Help us improve by reporting missing translations
3. **Context matters**: Some technical terms may remain in English intentionally

### Performance Impact

The internationalization system is designed to be lightweight:

- **Minimal overhead**: Translation files are loaded only when needed
- **Fast switching**: Language changes are applied immediately
- **Cached resources**: Translations are cached for better performance

For more information about configuration options and settings management, see the [Configuration documentation](./configuration.md).
