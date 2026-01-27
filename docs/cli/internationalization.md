# Internationalization (i18n)

Gemini CLI supports multiple UI languages through a built-in
internationalization system powered by [i18next](https://www.i18next.com/). Each
language is packaged as a self-contained locale folder with translation files
and a manifest.

## Changing the UI language

### Using the Settings dialog

1. Run `/settings` in Gemini CLI.
2. Navigate to the **Language** option under **General**.
3. Press Enter to cycle through available languages.
4. Restart Gemini CLI for the change to take effect.

### Using an environment variable

Set `GEMINI_LANG` to override the UI language without changing settings:

```bash
GEMINI_LANG=ja gemini
```

### Auto-detection

When the language setting is **Auto** (the default), Gemini CLI detects the
system language using the following priority:

1. `GEMINI_LANG` environment variable
2. `LANG` environment variable (Unix-style locale, e.g. `ja_JP.UTF-8`)
3. `Intl.DateTimeFormat` system locale
4. Fallback to English

## Built-in languages

| Code | Language | Display Name |
| ---- | -------- | ------------ |
| `en` | English  | English      |
| `ja` | Japanese | 日本語       |

Additional languages can be added by creating a new locale folder (see below).

## Locale folder structure

Each language lives in its own directory under
`packages/cli/src/i18n/locales/<code>/`:

```
locales/
├── en/
│   ├── manifest.json
│   ├── common.json
│   ├── commands.json
│   ├── dialogs.json
│   ├── help.json
│   └── loading.json
└── ja/
    ├── manifest.json
    ├── common.json
    ├── commands.json
    ├── dialogs.json
    ├── help.json
    └── loading.json
```

### manifest.json

Every locale folder **must** contain a `manifest.json` that declares the
language's display name. This is what appears in the Settings dialog:

```json
{
  "displayName": "日本語"
}
```

The folder name (e.g. `ja`) is the locale code used internally. The
`displayName` is the human-readable label shown to users. This system supports
any locale code — there is no hardcoded list of languages.

### Namespace files

Translations are split into namespaces, each in its own JSON file:

| File            | Purpose                                     |
| --------------- | ------------------------------------------- |
| `common.json`   | Shared UI strings (buttons, status, labels) |
| `commands.json` | Slash command descriptions (76 commands)    |
| `dialogs.json`  | Auth dialog and settings dialog strings     |
| `help.json`     | Help overlay content and keyboard shortcuts |
| `loading.json`  | Loading tips and waiting phrases (152 tips) |

## Adding a new language

To add a new language, no code changes are required:

1. Create a new directory under `packages/cli/src/i18n/locales/` using the
   locale code as the folder name (e.g. `fr/`, `zh/`, `tlh/`).

2. Add a `manifest.json`:

   ```json
   {
     "displayName": "Français"
   }
   ```

3. Copy the five namespace JSON files from `en/` and translate the values. Keep
   all keys identical — only translate the string values.

4. Build and run. The new language appears automatically in the Settings dialog.

### Translation guidelines

- **Keep keys unchanged.** Only translate the JSON values, never the keys.
- **Preserve interpolation variables.** Strings like `{{count}}` or `{{name}}`
  must remain exactly as-is in your translations.
- **Translate complete sentences.** Avoid translating sentence fragments. Each
  key should contain a semantically complete unit of text.
- **Use the `en/` files as the canonical reference.** If a key is missing from
  your locale, the English fallback is used automatically.
- **Tips are arrays.** The `loading.json` file contains arrays of strings under
  `tips.settings`, `tips.shortcuts`, and `tips.commands`. Translate each element
  while keeping the same array structure and count.

## i18n patterns for developers

### Using translations in React components

Import `useTranslation` from `react-i18next`:

```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation('common');
  return <Text>{t('greeting')}</Text>;
}
```

For namespace-qualified keys:

```tsx
const { t } = useTranslation();
return <Text>{t('help:keyboardShortcuts')}</Text>;
```

### Using translations outside React

Import the `t` function directly from the i18n module:

```typescript
import { t } from '../i18n/index.js';

const message = t('common:loading');
```

### Helper functions

The i18n module exports several helpers:

| Function                                         | Purpose                                  |
| ------------------------------------------------ | ---------------------------------------- |
| `getInformativeTips()`                           | Returns all loading tips as a flat array |
| `getInteractiveShellWaitingPhrase()`             | Returns the shell waiting message        |
| `getWaitingForConfirmationPhrase()`              | Returns the confirmation waiting message |
| `getCommandDescription(name, fallback, parent?)` | Translates a slash command description   |
| `getAvailableLanguages()`                        | Returns detected locale codes            |
| `isLanguageAvailable(code)`                      | Checks if a locale pack exists           |
| `getLanguageOptions()`                           | Returns options for the settings schema  |

### Adding new translatable strings

When adding user-facing strings to the CLI:

1. Add the English string to the appropriate namespace file in `en/`.
2. Use `t('namespace:key')` or `useTranslation('namespace')` in your code.
3. Add corresponding translations to all other locale files (currently `ja/`).
4. If the string contains dynamic values, use i18next interpolation:

   ```json
   {
     "connectedServers": "Connected to {{count}} MCP servers"
   }
   ```

   ```typescript
   t('common:connectedServers', { count: 5 });
   ```

## Settings reference

The language setting is stored in `settings.json`:

```json
{
  "general": {
    "language": "auto"
  }
}
```

Valid values are `"auto"` (default) or any locale code with an available locale
pack (e.g. `"en"`, `"ja"`).
